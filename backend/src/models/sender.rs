use serde::{Serialize, Deserialize};
use mongodb::bson::oid::ObjectId;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WhatsappSender {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub phone_number: Option<String>,
    pub session_id: String,
    pub status: String, // "disconnected", "connecting", "qr", "connected"
    pub qr_code: Option<String>,
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSenderRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSenderNameRequest {
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct SenderResponse {
    pub id: String,
    pub name: String,
    pub phone_number: Option<String>,
    pub session_id: String,
    pub status: String,
    pub qr_code: Option<String>,
    pub created_at: DateTime<Utc>,
}
