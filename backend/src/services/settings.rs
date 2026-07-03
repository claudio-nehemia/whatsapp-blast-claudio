use axum::http::StatusCode;
use mongodb::bson::doc;

use crate::database::Db;
use crate::models::settings::{Settings, UpdateSettingsRequest};

pub async fn get_system_settings(
    db: &Db,
) -> Result<Settings, (StatusCode, String)> {
    let settings_col = db.db.collection::<Settings>("settings");
    
    let settings = settings_col.find_one(None, None).await
        .unwrap_or(None);
        
    let active_settings = match settings {
        Some(s) => s,
        None => {
            let default_s = Settings {
                id: None,
                min_delay: 5,
                max_delay: 10,
                max_retry: 3,
                typing_simulation: true,
                auto_retry: true,
            };
            let insert_res = settings_col.insert_one(&default_s, None).await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let mut db_s = default_s;
            db_s.id = Some(insert_res.inserted_id.as_object_id().unwrap());
            db_s
        }
    };
    
    Ok(active_settings)
}

pub async fn modify_system_settings(
    db: &Db,
    payload: UpdateSettingsRequest,
) -> Result<Settings, (StatusCode, String)> {
    let settings_col = db.db.collection::<Settings>("settings");
    
    let update_doc = doc! {
        "$set": doc! {
            "min_delay": payload.min_delay,
            "max_delay": payload.max_delay,
            "max_retry": payload.max_retry,
            "typing_simulation": payload.typing_simulation,
            "auto_retry": payload.auto_retry,
        }
    };
    
    let opts = mongodb::options::UpdateOptions::builder().upsert(true).build();
    settings_col.update_one(doc! {}, update_doc, opts).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let updated = settings_col.find_one(None, None).await
        .unwrap_or(None)
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Settings not found after update".to_string()))?;
        
    Ok(updated)
}

pub async fn query_whatsapp_status(
    whatsapp_service_url: &str,
) -> Result<String, (StatusCode, String)> {
    let client = reqwest::Client::new();
    let node_url = format!("{}/api/status", whatsapp_service_url);
    
    let response = client.get(&node_url).send().await;
    match response {
        Ok(res) if res.status().is_success() => {
            let body = res.text().await.unwrap_or_default();
            Ok(body)
        }
        _ => Err((StatusCode::BAD_GATEWAY, "WhatsApp Service offline".to_string()))
    }
}

pub async fn trigger_whatsapp_connect(
    whatsapp_service_url: &str,
) -> Result<String, (StatusCode, String)> {
    let client = reqwest::Client::new();
    let node_url = format!("{}/api/connect", whatsapp_service_url);
    
    let response = client.post(&node_url).send().await;
    match response {
        Ok(res) if res.status().is_success() => {
            let body = res.text().await.unwrap_or_default();
            Ok(body)
        }
        _ => Err((StatusCode::BAD_GATEWAY, "WhatsApp Service offline".to_string()))
    }
}

pub async fn trigger_whatsapp_disconnect(
    whatsapp_service_url: &str,
) -> Result<String, (StatusCode, String)> {
    let client = reqwest::Client::new();
    let node_url = format!("{}/api/disconnect", whatsapp_service_url);
    
    let response = client.post(&node_url).send().await;
    match response {
        Ok(res) if res.status().is_success() => {
            let body = res.text().await.unwrap_or_default();
            Ok(body)
        }
        _ => Err((StatusCode::BAD_GATEWAY, "WhatsApp Service offline".to_string()))
    }
}
