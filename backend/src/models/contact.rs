use mongodb::bson::{oid::ObjectId, Document};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Contact {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub campaign_id: ObjectId,
    pub phone: String,
    pub name: String,
    pub dynamic_fields: Document,
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ContactResponse {
    pub id: String,
    pub campaign_id: String,
    pub campaign_name: String,
    pub phone: String,
    pub name: String,
    pub dynamic_fields: serde_json::Value,
    pub created_at: DateTime<Utc>,
}
