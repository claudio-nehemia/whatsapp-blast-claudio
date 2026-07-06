use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Template {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub body: String,
    pub image_path: Option<String>,
    pub campaign_ids: Option<Vec<String>>,
    pub user_id: Option<ObjectId>,
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub body: String,
    pub image_path: Option<String>,
    pub campaign_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct TemplateResponse {
    pub id: String,
    pub name: String,
    pub body: String,
    pub image_path: Option<String>,
    pub campaign_ids: Vec<String>,
    pub created_at: DateTime<Utc>,
}

impl Template {
    pub fn to_response(&self) -> TemplateResponse {
        TemplateResponse {
            id: self.id.map(|oid| oid.to_hex()).unwrap_or_default(),
            name: self.name.clone(),
            body: self.body.clone(),
            image_path: self.image_path.clone(),
            campaign_ids: self.campaign_ids.clone().unwrap_or_default(),
            created_at: self.created_at,
        }
    }
}
