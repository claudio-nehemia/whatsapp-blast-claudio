use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub min_delay: i32,
    pub max_delay: i32,
    pub max_retry: i32,
    pub typing_simulation: bool,
    pub auto_retry: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub min_delay: i32,
    pub max_delay: i32,
    pub max_retry: i32,
    pub typing_simulation: bool,
    pub auto_retry: bool,
}
