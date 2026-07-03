use axum::http::StatusCode;
use mongodb::bson::{doc, oid::ObjectId};
use chrono::Utc;
use futures_util::TryStreamExt;
use uuid::Uuid;

use crate::database::Db;
use crate::models::sender::{WhatsappSender, CreateSenderRequest, UpdateSenderNameRequest, SenderResponse};

pub async fn get_senders_list(
    db: &Db,
) -> Result<Vec<SenderResponse>, (StatusCode, String)> {
    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");
    let mut cursor = senders_col.find(None, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let mut senders = Vec::new();
    while let Some(s) = cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        senders.push(SenderResponse {
            id: s.id.unwrap().to_hex(),
            name: s.name,
            phone_number: s.phone_number,
            session_id: s.session_id,
            status: s.status,
            qr_code: s.qr_code,
            created_at: s.created_at,
        });
    }
    
    senders.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(senders)
}

pub async fn create_sender(
    db: &Db,
    payload: CreateSenderRequest,
) -> Result<SenderResponse, (StatusCode, String)> {
    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");
    
    let session_id = format!("sender-{}", Uuid::new_v4().to_string()[..8].to_string());
    
    let new_sender = WhatsappSender {
        id: None,
        name: payload.name,
        phone_number: None,
        session_id: session_id.clone(),
        status: "disconnected".to_string(),
        qr_code: None,
        created_at: Utc::now(),
    };
    
    let insert_res = senders_col.insert_one(&new_sender, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let sender_oid = insert_res.inserted_id.as_object_id().unwrap();
    
    Ok(SenderResponse {
        id: sender_oid.to_hex(),
        name: new_sender.name,
        phone_number: None,
        session_id,
        status: "disconnected".to_string(),
        qr_code: None,
        created_at: new_sender.created_at,
    })
}

pub async fn update_sender_name(
    db: &Db,
    id_str: &str,
    payload: UpdateSenderNameRequest,
) -> Result<SenderResponse, (StatusCode, String)> {
    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");
    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Sender ID format".to_string()))?;
    
    let update_doc = doc! {
        "$set": doc! { "name": payload.name }
    };
    
    senders_col.update_one(doc! { "_id": oid }, update_doc, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let updated = senders_col.find_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Sender not found".to_string()))?;
        
    Ok(SenderResponse {
        id: updated.id.unwrap().to_hex(),
        name: updated.name,
        phone_number: updated.phone_number,
        session_id: updated.session_id,
        status: updated.status,
        qr_code: updated.qr_code,
        created_at: updated.created_at,
    })
}

pub async fn trigger_connect_sender(
    db: &Db,
    id_str: &str,
    whatsapp_service_url: &str,
) -> Result<String, (StatusCode, String)> {
    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");
    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Sender ID format".to_string()))?;
        
    let sender = senders_col.find_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Sender not found".to_string()))?;
        
    let client = reqwest::Client::new();
    let node_url = format!("{}/api/connect", whatsapp_service_url);
    
    let response = client.post(&node_url)
        .json(&serde_json::json!({ "sessionId": sender.session_id }))
        .send()
        .await;
        
    match response {
        Ok(res) if res.status().is_success() => {
            let update_doc = doc! {
                "$set": doc! { "status": "connecting" }
            };
            let _ = senders_col.update_one(doc! { "_id": oid }, update_doc, None).await;
            
            let body = res.text().await.unwrap_or_default();
            Ok(body)
        }
        _ => Err((StatusCode::BAD_GATEWAY, "WhatsApp Service offline".to_string()))
    }
}

pub async fn trigger_disconnect_sender(
    db: &Db,
    id_str: &str,
    whatsapp_service_url: &str,
) -> Result<String, (StatusCode, String)> {
    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");
    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Sender ID format".to_string()))?;
        
    let sender = senders_col.find_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Sender not found".to_string()))?;
        
    let client = reqwest::Client::new();
    let node_url = format!("{}/api/disconnect", whatsapp_service_url);
    
    let response = client.post(&node_url)
        .json(&serde_json::json!({ "sessionId": sender.session_id }))
        .send()
        .await;
        
    match response {
        Ok(res) if res.status().is_success() => {
            let update_doc = doc! {
                "$set": doc! { "status": "disconnected", "qr_code": null, "phone_number": null }
            };
            let _ = senders_col.update_one(doc! { "_id": oid }, update_doc, None).await;
            
            let body = res.text().await.unwrap_or_default();
            Ok(body)
        }
        _ => Err((StatusCode::BAD_GATEWAY, "WhatsApp Service offline".to_string()))
    }
}

pub async fn delete_sender(
    db: &Db,
    id_str: &str,
    whatsapp_service_url: &str,
) -> Result<(), (StatusCode, String)> {
    let senders_col = db.db.collection::<WhatsappSender>("whatsapp_senders");
    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Sender ID format".to_string()))?;
        
    if let Ok(Some(sender)) = senders_col.find_one(doc! { "_id": oid }, None).await {
        let client = reqwest::Client::new();
        let node_url = format!("{}/api/disconnect", whatsapp_service_url);
        let _ = client.post(&node_url)
            .json(&serde_json::json!({ "sessionId": sender.session_id }))
            .send()
            .await;
    }
    
    senders_col.delete_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    Ok(())
}
