use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Blast {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub template_id: ObjectId,
    pub campaign_id: Option<ObjectId>,
    pub campaign_ids: Option<Vec<ObjectId>>,
    pub sender_id: Option<ObjectId>,
    pub total_recipients: i32,
    pub success_count: i32,
    pub failed_count: i32,
    pub status: String, // "Pending", "Running", "Completed", "Cancelled"
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBlastRequest {
    pub name: String,
    pub template_id: String,
    pub campaign_ids: Vec<String>,
    pub sender_id: String,
    pub excluded_contact_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BlastResponse {
    pub id: String,
    pub name: String,
    pub template_id: String,
    pub template_name: String,
    pub campaign_ids: Vec<String>,
    pub campaign_name: String,
    pub sender_id: Option<String>,
    pub sender_name: Option<String>,
    pub total_recipients: i32,
    pub success_count: i32,
    pub failed_count: i32,
    pub status: String,
    pub created_at: DateTime<Utc>,
}
