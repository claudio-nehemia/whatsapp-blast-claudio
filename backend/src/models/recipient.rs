use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlastRecipient {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub blast_id: ObjectId,
    pub contact_id: ObjectId,
    pub phone: String,
    pub status: String, // "Pending", "Sending", "Success", "Failed"
    pub error_message: Option<String>,
    pub retry_count: i32,
    pub sent_at: Option<BsonDateTime>,
}

#[derive(Debug, Serialize)]
pub struct RecipientResponse {
    pub id: String,
    pub blast_id: String,
    pub contact_id: String,
    pub contact_name: String,
    pub phone: String,
    pub status: String,
    pub error_message: Option<String>,
    pub retry_count: i32,
    pub sent_at: Option<DateTime<Utc>>,
}
