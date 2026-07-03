use axum::http::StatusCode;
use mongodb::bson::{doc, oid::ObjectId};
use chrono::Utc;
use tokio::fs;
use uuid::Uuid;
use futures_util::TryStreamExt;
use std::collections::HashMap;

use crate::database::Db;
use crate::models::campaign::{ContactCampaign, CampaignResponse};
use crate::models::contact::{Contact, ContactResponse};
use crate::utils::excel::parse_excel_file_async;
use crate::routes::contacts::ContactsQuery;

pub async fn upload_excel_contacts(
    db: &Db,
    campaign_name: String,
    file_bytes: Vec<u8>,
) -> Result<CampaignResponse, (StatusCode, String)> {
    if campaign_name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "campaign_name is required".to_string()));
    }
    if file_bytes.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "file is required and cannot be empty".to_string()));
    }
    
    let upload_dir = "./storage/excel";
    fs::create_dir_all(upload_dir).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create storage dir: {}", e)))?;
        
    let file_id = Uuid::new_v4().to_string();
    let file_path = format!("{}/{}.xlsx", upload_dir, file_id);
    
    fs::write(&file_path, &file_bytes).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to save upload: {}", e)))?;
        
    let groq_api_key = std::env::var("GROQ_API_KEY").ok();
    let parsed = match parse_excel_file_async(&file_path, groq_api_key).await {
        Ok(res) => res,
        Err(err) => {
            let _ = fs::remove_file(&file_path).await;
            return Err((StatusCode::BAD_REQUEST, format!("Excel parsing failed: {}", err)));
        }
    };
    
    let _ = fs::remove_file(&file_path).await;
    
    let campaign_col = db.db.collection::<ContactCampaign>("contact_campaigns");
    let contacts_col = db.db.collection::<Contact>("contacts");
    
    let mut first_campaign_response = None;
    let total_sheets = parsed.sheets.len();

    for sheet in parsed.sheets {
        let sheet_campaign_name = if total_sheets > 1 {
            format!("{} - {}", campaign_name, sheet.name)
        } else {
            campaign_name.clone()
        };

        // If campaign already exists, delete it and its contacts first to overwrite
        if let Some(existing_camp) = campaign_col.find_one(doc! { "name": &sheet_campaign_name }, None).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        {
            if let Some(oid) = existing_camp.id {
                let _ = contacts_col.delete_many(doc! { "campaign_id": oid }, None).await;
                let _ = campaign_col.delete_one(doc! { "_id": oid }, None).await;
            }
        }

        let campaign = ContactCampaign {
            id: None,
            name: sheet_campaign_name.clone(),
            headers: sheet.headers.clone(),
            created_at: Utc::now(),
        };

        let camp_insert = campaign_col.insert_one(&campaign, None).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            
        let campaign_oid = camp_insert.inserted_id.as_object_id().unwrap();

        let contacts_to_insert: Vec<Contact> = sheet.rows.into_iter().map(|row| Contact {
            id: None,
            campaign_id: campaign_oid,
            phone: row.phone,
            name: row.name,
            dynamic_fields: row.dynamic_fields,
            created_at: Utc::now(),
        }).collect();

        contacts_col.insert_many(&contacts_to_insert, None).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if first_campaign_response.is_none() {
            first_campaign_response = Some(CampaignResponse {
                id: campaign_oid.to_hex(),
                name: sheet_campaign_name,
                headers: sheet.headers,
                contact_count: contacts_to_insert.len() as i64,
                created_at: campaign.created_at,
            });
        }
    }

    let response = match first_campaign_response {
        Some(resp) => resp,
        None => return Err((StatusCode::BAD_REQUEST, "All sheets inside the uploaded file already exist as campaigns".to_string())),
    };

    Ok(response)
}

pub async fn get_campaigns_list(
    db: &Db,
) -> Result<Vec<CampaignResponse>, (StatusCode, String)> {
    let campaign_col = db.db.collection::<ContactCampaign>("contact_campaigns");
    let contacts_col = db.db.collection::<Contact>("contacts");
    
    let mut cursor = campaign_col.find(None, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let mut campaigns = Vec::new();
    
    while let Some(camp) = cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        let count = contacts_col.count_documents(doc! { "campaign_id": camp.id.unwrap() }, None).await
            .unwrap_or(0);
            
        campaigns.push(CampaignResponse {
            id: camp.id.unwrap().to_hex(),
            name: camp.name,
            headers: camp.headers,
            contact_count: count as i64,
            created_at: camp.created_at,
        });
    }
    
    campaigns.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    
    Ok(campaigns)
}

pub async fn get_contacts_list(
    db: &Db,
    params: ContactsQuery,
) -> Result<Vec<ContactResponse>, (StatusCode, String)> {
    let contacts_col = db.db.collection::<Contact>("contacts");
    let campaign_col = db.db.collection::<ContactCampaign>("contact_campaigns");
    
    let mut filter = doc! {};
    
    if let Some(camp_id_str) = params.campaign_id {
        if !camp_id_str.is_empty() && camp_id_str != "all" {
            let oid = ObjectId::parse_str(&camp_id_str)
                .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid campaign_id format".to_string()))?;
            filter.insert("campaign_id", oid);
        }
    }
    
    if let Some(search) = params.search {
        if !search.is_empty() {
            filter.insert(
                "$or",
                vec![
                    doc! { "name": doc! { "$regex": &search, "$options": "i" } },
                    doc! { "phone": doc! { "$regex": &search, "$options": "i" } }
                ]
            );
        }
    }
    
    let mut cursor = contacts_col.find(filter, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let mut contacts = Vec::new();
    let mut camp_cache: HashMap<String, String> = HashMap::new();
    
    while let Some(contact) = cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        let camp_id_hex = contact.campaign_id.to_hex();
        
        let camp_name = match camp_cache.get(&camp_id_hex) {
            Some(name) => name.clone(),
            None => {
                let name = match campaign_col.find_one(doc! { "_id": contact.campaign_id }, None).await {
                    Ok(Some(c)) => c.name,
                    _ => "Unknown".to_string(),
                };
                camp_cache.insert(camp_id_hex.clone(), name.clone());
                name
            }
        };
        
        let fields_json = serde_json::to_value(&contact.dynamic_fields)
            .unwrap_or(serde_json::Value::Null);
            
        contacts.push(ContactResponse {
            id: contact.id.unwrap().to_hex(),
            campaign_id: camp_id_hex,
            campaign_name: camp_name,
            phone: contact.phone,
            name: contact.name,
            dynamic_fields: fields_json,
            created_at: contact.created_at,
        });
    }
    
    Ok(contacts)
}

pub async fn remove_campaign(
    db: &Db,
    id_str: &str,
) -> Result<(), (StatusCode, String)> {
    let campaign_col = db.db.collection::<ContactCampaign>("contact_campaigns");
    let contacts_col = db.db.collection::<Contact>("contacts");
    
    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid campaign ID format".to_string()))?;
        
    let res = campaign_col.delete_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    if res.deleted_count == 0 {
        return Err((StatusCode::NOT_FOUND, "Campaign not found".to_string()));
    }
    
    let _ = contacts_col.delete_many(doc! { "campaign_id": oid }, None).await;
    
    Ok(())
}
