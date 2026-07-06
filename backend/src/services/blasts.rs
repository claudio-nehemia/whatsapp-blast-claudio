use axum::http::StatusCode;
use mongodb::bson::{doc, oid::ObjectId, DateTime as BsonDateTime};
use chrono::Utc;
use futures_util::TryStreamExt;
use serde::{Serialize, Deserialize};
use std::sync::Arc;

use crate::database::Db;
use crate::routes::ws::WsHub;
use crate::models::blast::{Blast, CreateBlastRequest, BlastResponse};
use crate::models::recipient::{BlastRecipient, RecipientResponse};
use crate::models::campaign::ContactCampaign;
use crate::models::template::Template;
use crate::models::contact::Contact;
use crate::models::settings::Settings;
use crate::models::sender::WhatsappSender;

#[derive(Serialize)]
struct NodeBlastPayload {
    #[serde(rename = "blastId")]
    blast_id: String,
    #[serde(rename = "sessionId")]
    session_id: String,
    recipients: Vec<NodeRecipientPayload>,
    #[serde(rename = "imagePath")]
    image_path: Option<String>,
    settings: NodeSettingsPayload,
}

#[derive(Serialize)]
struct NodeRecipientPayload {
    #[serde(rename = "recipientId")]
    recipient_id: String,
    phone: String,
    text: String,
}

#[derive(Serialize)]
struct NodeSettingsPayload {
    #[serde(rename = "minDelay")]
    min_delay: i32,
    #[serde(rename = "maxDelay")]
    max_delay: i32,
    #[serde(rename = "maxRetry")]
    max_retry: i32,
    #[serde(rename = "typingSimulation")]
    typing_simulation: bool,
}

pub async fn execute_blast(
    db: &Db,
    ws_hub: &WsHub,
    whatsapp_service_url: &str,
    user_id: &str,
    payload: CreateBlastRequest,
) -> Result<BlastResponse, (StatusCode, String)> {
    let (user_oid, _role) = crate::services::auth::check_user_role(db, user_id).await?;

    let campaigns_col = db.db.collection::<ContactCampaign>("contact_campaigns");
    let templates_col = db.db.collection::<Template>("templates");
    let contacts_col = db.db.collection::<Contact>("contacts");
    let blasts_col = db.db.collection::<Blast>("blasts");
    let recipients_col = db.db.collection::<BlastRecipient>("blast_recipients");
    let settings_col = db.db.collection::<Settings>("settings");

    let campaign_oids: Vec<ObjectId> = payload.campaign_ids.iter()
        .filter_map(|id| ObjectId::parse_str(id).ok())
        .collect();
    if campaign_oids.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "At least one campaign ID is required".to_string()));
    }

    let template_oid = ObjectId::parse_str(&payload.template_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid template ID".to_string()))?;

    let sender_oid = ObjectId::parse_str(&payload.sender_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid sender ID".to_string()))?;

    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");
    let sender = senders_col.find_one(doc! { "_id": sender_oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "WhatsApp sender not found".to_string()))?;

    if sender.status != "connected" {
        return Err((StatusCode::BAD_REQUEST, "Selected WhatsApp sender is not connected".to_string()));
    }

    let mut campaign_names = Vec::new();
    let mut camp_cursor = campaigns_col.find(doc! { "_id": { "$in": &campaign_oids } }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    while let Some(camp) = camp_cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        campaign_names.push(camp.name);
    }
    let campaign_name_str = campaign_names.join(", ");
        
    let template = templates_col.find_one(doc! { "_id": template_oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Template not found".to_string()))?;

    let settings = settings_col.find_one(doc! { "user_id": user_oid }, None).await
        .unwrap_or(None)
        .unwrap_or(Settings {
            id: None,
            min_delay: 5,
            max_delay: 10,
            max_retry: 3,
            typing_simulation: true,
            auto_retry: true,
            user_id: Some(user_oid),
        });

    let excluded_oids: Vec<ObjectId> = payload.excluded_contact_ids.iter()
        .filter_map(|id| ObjectId::parse_str(id).ok())
        .collect();

    let mut cursor = contacts_col.find(doc! { "campaign_id": { "$in": &campaign_oids } }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut recipients_to_insert = Vec::new();
    let mut node_recipients = Vec::new();

    let blast_oid = ObjectId::new();

    while let Some(contact) = cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        let contact_oid = contact.id.unwrap();
        if excluded_oids.contains(&contact_oid) {
            continue;
        }

        let recipient_oid = ObjectId::new();
        let sender_phone = sender.phone_number.as_deref().unwrap_or("");
        let personalized_text = replace_placeholders(
            &template.body,
            &contact.name,
            &contact.phone,
            &sender.name,
            sender_phone,
            &contact.dynamic_fields,
        );

        recipients_to_insert.push(BlastRecipient {
            id: Some(recipient_oid),
            blast_id: blast_oid,
            contact_id: contact_oid,
            phone: contact.phone.clone(),
            status: "Pending".to_string(),
            error_message: None,
            retry_count: 0,
            sent_at: None,
        });

        node_recipients.push(NodeRecipientPayload {
            recipient_id: recipient_oid.to_hex(),
            phone: contact.phone,
            text: personalized_text,
        });
    }

    if recipients_to_insert.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No recipients selected".to_string()));
    }

    let new_blast = Blast {
        id: Some(blast_oid),
        name: payload.name,
        template_id: template_oid,
        campaign_id: campaign_oids.first().cloned(),
        campaign_ids: Some(campaign_oids.clone()),
        sender_id: Some(sender_oid),
        total_recipients: recipients_to_insert.len() as i32,
        success_count: 0,
        failed_count: 0,
        status: "Running".to_string(),
        user_id: Some(user_oid),
        created_at: Utc::now(),
    };

    blasts_col.insert_one(&new_blast, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    recipients_col.insert_many(&recipients_to_insert, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let client = reqwest::Client::new();
    let node_url = format!("{}/api/blast", whatsapp_service_url);
    
    let payload_to_node = NodeBlastPayload {
        blast_id: blast_oid.to_hex(),
        session_id: sender.session_id.clone(),
        recipients: node_recipients,
        image_path: template.image_path.clone(),
        settings: NodeSettingsPayload {
            min_delay: settings.min_delay,
            max_delay: settings.max_delay,
            max_retry: settings.max_retry,
            typing_simulation: settings.typing_simulation,
        },
    };

    let response = client.post(&node_url)
        .json(&payload_to_node)
        .send()
        .await;

    match response {
        Ok(res) if res.status().is_success() => {
            ws_hub.broadcast(&serde_json::json!({
                "type": "blast_started",
                "blast_id": blast_oid.to_hex(),
                "status": "Running"
            }).to_string());

            Ok(BlastResponse {
                id: blast_oid.to_hex(),
                name: new_blast.name,
                template_id: template_oid.to_hex(),
                template_name: template.name,
                campaign_ids: campaign_oids.iter().map(|oid| oid.to_hex()).collect(),
                campaign_name: campaign_name_str,
                sender_id: Some(sender_oid.to_hex()),
                sender_name: Some(sender.name),
                total_recipients: new_blast.total_recipients,
                success_count: 0,
                failed_count: 0,
                status: "Running".to_string(),
                created_at: new_blast.created_at,
            })
        }
        _ => {
            let _ = blasts_col.delete_one(doc! { "_id": blast_oid }, None).await;
            let _ = recipients_col.delete_many(doc! { "blast_id": blast_oid }, None).await;
            
            Err((
                StatusCode::BAD_GATEWAY,
                "Failed to initiate blast. WhatsApp gateway is offline.".to_string(),
            ))
        }
    }
}

pub async fn get_blasts_list(
    db: &Db,
    user_id: &str,
) -> Result<Vec<BlastResponse>, (StatusCode, String)> {
    let (user_oid, role) = crate::services::auth::check_user_role(db, user_id).await?;
    let blasts_col = db.db.collection::<Blast>("blasts");
    let campaigns_col = db.db.collection::<ContactCampaign>("contact_campaigns");
    let templates_col = db.db.collection::<Template>("templates");
    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");

    let filter = if role == "superadmin" {
        doc! {}
    } else {
        doc! { "user_id": user_oid }
    };

    let mut cursor = blasts_col.find(filter, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut response = Vec::new();
    let mut camp_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut temp_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut sender_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    while let Some(b) = cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        let campaign_oids = b.campaign_ids.clone().unwrap_or_else(|| {
            b.campaign_id.map(|id| vec![id]).unwrap_or_default()
        });
        let camp_ids_hex: Vec<String> = campaign_oids.iter().map(|oid| oid.to_hex()).collect();
        let temp_hex = b.template_id.to_hex();

        let mut campaign_names = Vec::new();
        for oid in &campaign_oids {
            let oid_hex = oid.to_hex();
            let name = match camp_cache.get(&oid_hex) {
                Some(n) => n.clone(),
                None => {
                    let n = match campaigns_col.find_one(doc! { "_id": oid }, None).await {
                        Ok(Some(c)) => c.name,
                        _ => "Unknown".to_string(),
                    };
                    camp_cache.insert(oid_hex.clone(), n.clone());
                    n
                }
            };
            campaign_names.push(name);
        }
        let camp_name = campaign_names.join(", ");

        let temp_name = match temp_cache.get(&temp_hex) {
            Some(n) => n.clone(),
            None => {
                let n = match templates_col.find_one(doc! { "_id": b.template_id }, None).await {
                    Ok(Some(t)) => t.name,
                    _ => "Unknown".to_string(),
                };
                temp_cache.insert(temp_hex.clone(), n.clone());
                n
            }
        };

        let sender_id_hex = b.sender_id.map(|oid| oid.to_hex());
        let sender_name = match &sender_id_hex {
            Some(hex) => match sender_cache.get(hex) {
                Some(n) => Some(n.clone()),
                None => {
                    let n = match senders_col.find_one(doc! { "_id": b.sender_id.unwrap() }, None).await {
                        Ok(Some(s)) => s.name,
                        _ => "Unknown Sender".to_string(),
                    };
                    sender_cache.insert(hex.clone(), n.clone());
                    Some(n)
                }
            },
            None => None,
        };

        response.push(BlastResponse {
            id: b.id.unwrap().to_hex(),
            name: b.name,
            template_id: temp_hex,
            template_name: temp_name,
            campaign_ids: camp_ids_hex,
            campaign_name: camp_name,
            sender_id: sender_id_hex,
            sender_name,
            total_recipients: b.total_recipients,
            success_count: b.success_count,
            failed_count: b.failed_count,
            status: b.status,
            created_at: b.created_at,
        });
    }

    // Sort by created_at descending
    response.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(response)
}

pub async fn get_blast_details(
    db: &Db,
    user_id: &str,
    id_str: &str,
) -> Result<BlastResponse, (StatusCode, String)> {
    let (user_oid, role) = crate::services::auth::check_user_role(db, user_id).await?;
    let blasts_col = db.db.collection::<Blast>("blasts");
    let campaigns_col = db.db.collection::<ContactCampaign>("contact_campaigns");
    let templates_col = db.db.collection::<Template>("templates");

    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Blast ID format".to_string()))?;

    let filter = if role == "superadmin" {
        doc! { "_id": oid }
    } else {
        doc! { "_id": oid, "user_id": user_oid }
    };

    let b = blasts_col.find_one(filter, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Blast not found".to_string()))?;

    let campaign_oids = b.campaign_ids.clone().unwrap_or_else(|| {
        b.campaign_id.map(|id| vec![id]).unwrap_or_default()
    });
    let camp_ids_hex: Vec<String> = campaign_oids.iter().map(|oid| oid.to_hex()).collect();

    let mut campaign_names = Vec::new();
    for oid in &campaign_oids {
        let name = match campaigns_col.find_one(doc! { "_id": oid }, None).await {
            Ok(Some(c)) => c.name,
            _ => "Unknown".to_string(),
        };
        campaign_names.push(name);
    }
    let camp_name = campaign_names.join(", ");

    let temp_name = match templates_col.find_one(doc! { "_id": b.template_id }, None).await {
        Ok(Some(t)) => t.name,
        _ => "Unknown".to_string(),
    };

    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");
    let sender_id_hex = b.sender_id.map(|oid| oid.to_hex());
    let sender_name = match &sender_id_hex {
        Some(_) => match senders_col.find_one(doc! { "_id": b.sender_id.unwrap() }, None).await {
            Ok(Some(s)) => Some(s.name),
            _ => Some("Unknown Sender".to_string()),
        },
        None => None,
    };

    Ok(BlastResponse {
        id: b.id.unwrap().to_hex(),
        name: b.name,
        template_id: b.template_id.to_hex(),
        template_name: temp_name,
        campaign_ids: camp_ids_hex,
        campaign_name: camp_name,
        sender_id: sender_id_hex,
        sender_name,
        total_recipients: b.total_recipients,
        success_count: b.success_count,
        failed_count: b.failed_count,
        status: b.status,
        created_at: b.created_at,
    })
}

pub async fn get_blast_recipients_list(
    db: &Db,
    user_id: &str,
    id_str: &str,
) -> Result<Vec<RecipientResponse>, (StatusCode, String)> {
    let (user_oid, role) = crate::services::auth::check_user_role(db, user_id).await?;
    let blasts_col = db.db.collection::<Blast>("blasts");
    let recipients_col = db.db.collection::<BlastRecipient>("blast_recipients");
    let contacts_col = db.db.collection::<Contact>("contacts");

    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Blast ID format".to_string()))?;

    // Verify ownership
    let blast_filter = if role == "superadmin" {
        doc! { "_id": oid }
    } else {
        doc! { "_id": oid, "user_id": user_oid }
    };
    if blasts_col.find_one(blast_filter, None).await.unwrap_or(None).is_none() {
        return Err((StatusCode::NOT_FOUND, "Blast not found".to_string()));
    }

    let mut cursor = recipients_col.find(doc! { "blast_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut response = Vec::new();

    while let Some(r) = cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        let contact_name = match contacts_col.find_one(doc! { "_id": r.contact_id }, None).await {
            Ok(Some(c)) => c.name,
            _ => "Unknown".to_string(),
        };

        response.push(RecipientResponse {
            id: r.id.unwrap().to_hex(),
            blast_id: r.blast_id.to_hex(),
            contact_id: r.contact_id.to_hex(),
            contact_name,
            phone: r.phone,
            status: r.status,
            error_message: r.error_message,
            retry_count: r.retry_count,
            sent_at: r.sent_at.map(|bdt| bdt.to_chrono()),
        });
    }

    Ok(response)
}

pub async fn trigger_blast_action(
    db: &Db,
    ws_hub: &WsHub,
    whatsapp_service_url: &str,
    user_id: &str,
    blast_id: &str,
    action: &str,
    status_db: &str,
) -> Result<(), (StatusCode, String)> {
    let (user_oid, role) = crate::services::auth::check_user_role(db, user_id).await?;
    let blasts_col = db.db.collection::<Blast>("blasts");
    let oid = ObjectId::parse_str(blast_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Blast ID".to_string()))?;

    let blast_filter = if role == "superadmin" {
        doc! { "_id": oid }
    } else {
        doc! { "_id": oid, "user_id": user_oid }
    };
    if blasts_col.find_one(blast_filter.clone(), None).await.unwrap_or(None).is_none() {
        return Err((StatusCode::NOT_FOUND, "Blast not found".to_string()));
    }

    let client = reqwest::Client::new();
    let node_url = format!("{}/api/blast/{}", whatsapp_service_url, action);
    
    let res = client.post(&node_url).send().await;
    match res {
        Ok(r) if r.status().is_success() => {
            let update_res = blasts_col.update_one(
                blast_filter,
                doc! { "$set": doc! { "status": status_db } },
                None
            ).await;
            
            if update_res.is_ok() {
                ws_hub.broadcast(&serde_json::json!({
                    "type": "blast_status",
                    "blast_id": blast_id,
                    "status": status_db
                }).to_string());
            }

            Ok(())
        }
        _ => Err((StatusCode::BAD_GATEWAY, "WhatsApp Service offline".to_string()))
    }
}

fn replace_placeholders(
    template_body: &str,
    name: &str,
    phone: &str,
    sender_name: &str,
    sender_phone: &str,
    fields: &mongodb::bson::Document,
) -> String {
    let mut text = template_body.to_string();
    
    text = text.replace("{{name}}", name);
    text = text.replace("{{nama}}", name);
    text = text.replace("{{phone}}", phone);
    text = text.replace("{{wa}}", phone);
    text = text.replace("{{sender_name}}", sender_name);
    text = text.replace("{{sender}}", sender_name);
    text = text.replace("{{sender_phone}}", sender_phone);
    
    for (key, val) in fields.iter() {
        let placeholder = format!("{{{{{}}}}}", key);
        let val_str = match val {
            mongodb::bson::Bson::String(s) => s.clone(),
            _ => val.to_string(),
        };
        text = text.replace(&placeholder, &val_str);
    }
    
    text
}

pub async fn update_recipient_status(
    db: &Db,
    ws_hub: &WsHub,
    recipient_id_str: &str,
    blast_id_str: &str,
    status: &str,
    error_message: Option<String>,
    sent_at: Option<String>,
) -> Result<(), (StatusCode, String)> {
    let recipients_col = db.db.collection::<BlastRecipient>("blast_recipients");
    let blasts_col = db.db.collection::<Blast>("blasts");

    let recipient_oid = ObjectId::parse_str(recipient_id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid recipient ID".to_string()))?;
    let blast_oid = ObjectId::parse_str(blast_id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid blast ID".to_string()))?;

    let sent_at_bson = sent_at.as_ref().and_then(|s| {
        chrono::DateTime::parse_from_rfc3339(s).ok().map(|dt| {
            BsonDateTime::from_millis(dt.timestamp_millis())
        })
    });

    let orig_recipient = recipients_col.find_one(doc! { "_id": recipient_oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let orig_status = orig_recipient.map(|r| r.status).unwrap_or_default();

    let mut update_doc = doc! {
        "status": status,
    };
    if let Some(err) = error_message.clone() {
        update_doc.insert("error_message", err);
    }
    if let Some(ref sa) = sent_at_bson {
        update_doc.insert("sent_at", sa);
    }

    recipients_col.update_one(
        doc! { "_id": recipient_oid },
        doc! { "$set": update_doc },
        None
    ).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if orig_status != "Success" && orig_status != "Failed" {
        if status == "Success" {
            let _ = blasts_col.update_one(
                doc! { "_id": blast_oid },
                doc! { "$inc": doc! { "success_count": 1 } },
                None
            ).await;
        } else if status == "Failed" {
            let _ = blasts_col.update_one(
                doc! { "_id": blast_oid },
                doc! { "$inc": doc! { "failed_count": 1 } },
                None
            ).await;
        }
    }

    ws_hub.broadcast(&serde_json::json!({
        "type": "recipient_update",
        "blast_id": blast_id_str,
        "recipient_id": recipient_id_str,
        "status": status,
        "error_message": error_message,
        "sent_at": sent_at.clone()
    }).to_string());

    Ok(())
}

pub async fn update_blast_status(
    db: &Db,
    ws_hub: &WsHub,
    blast_id_str: &str,
    status: &str,
) -> Result<(), (StatusCode, String)> {
    let blasts_col = db.db.collection::<Blast>("blasts");
    let blast_oid = ObjectId::parse_str(blast_id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Blast ID".to_string()))?;

    blasts_col.update_one(
        doc! { "_id": blast_oid },
        doc! { "$set": doc! { "status": status } },
        None
    ).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    ws_hub.broadcast(&serde_json::json!({
        "type": "blast_status",
        "blast_id": blast_id_str,
        "status": status
    }).to_string());

    Ok(())
}
