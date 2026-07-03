use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde::Deserialize;
use mongodb::bson::doc;

use crate::routes::AppState;
use crate::models::settings::UpdateSettingsRequest;
use crate::services::settings;

#[derive(Deserialize)]
pub struct WhatsappStatusCallback {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub qr: Option<String>,
    pub error: Option<String>,
    #[serde(rename = "phoneNumber")]
    pub phone_number: Option<String>,
}

pub async fn get_settings(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = settings::get_system_settings(&state.db).await?;
    Ok(Json(response))
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateSettingsRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = settings::modify_system_settings(&state.db, payload).await?;
    Ok(Json(response))
}

pub async fn get_whatsapp_status(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = settings::query_whatsapp_status(&state.whatsapp_service_url).await?;
    Ok((StatusCode::OK, response))
}

pub async fn connect_whatsapp(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = settings::trigger_whatsapp_connect(&state.whatsapp_service_url).await?;
    Ok((StatusCode::OK, response))
}

pub async fn disconnect_whatsapp(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = settings::trigger_whatsapp_disconnect(&state.whatsapp_service_url).await?;
    Ok((StatusCode::OK, response))
}

pub async fn webhook_whatsapp_status(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<WhatsappStatusCallback>,
) -> impl IntoResponse {
    let senders_col = state.db.db.collection::<crate::models::sender::WhatsappSender>("whatsapp_senders");
    
    let mut update_fields = doc! {
        "status": &payload.event_type,
    };
    
    if payload.event_type == "qr" {
        update_fields.insert("qr_code", &payload.qr);
    } else if payload.event_type == "connected" {
        update_fields.insert("qr_code", mongodb::bson::Bson::Null);
        if let Some(ref num) = payload.phone_number {
            update_fields.insert("phone_number", num);
        }
    } else if payload.event_type == "disconnected" {
        update_fields.insert("qr_code", mongodb::bson::Bson::Null);
        update_fields.insert("phone_number", mongodb::bson::Bson::Null);
    }

    let update_doc = doc! {
        "$set": update_fields
    };

    let _ = senders_col.update_one(doc! { "session_id": &payload.session_id }, update_doc, None).await;

    let updated_sender = senders_col.find_one(doc! { "session_id": &payload.session_id }, None).await.unwrap_or(None);

    let msg = if let Some(sender) = updated_sender {
        serde_json::json!({
            "type": "whatsapp_status",
            "sender": {
                "id": sender.id.unwrap().to_hex(),
                "name": sender.name,
                "phone_number": sender.phone_number,
                "session_id": sender.session_id,
                "status": sender.status,
                "qr_code": sender.qr_code,
                "created_at": sender.created_at,
            }
        }).to_string()
    } else {
        serde_json::json!({
            "type": "whatsapp_status",
            "event": {
                "session_id": payload.session_id,
                "type": payload.event_type,
                "qr": payload.qr,
                "error": payload.error,
                "phone_number": payload.phone_number,
            }
        }).to_string()
    };
    
    state.ws_hub.broadcast(&msg);
    
    StatusCode::OK
}
