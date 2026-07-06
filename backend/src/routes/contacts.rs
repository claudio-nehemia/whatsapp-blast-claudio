use axum::{
    extract::{State, Multipart, Query, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
    Extension,
};
use std::sync::Arc;
use serde::Deserialize;

use crate::routes::AppState;
use crate::services::contacts;

#[derive(Debug, Deserialize)]
pub struct ContactsQuery {
    pub campaign_id: Option<String>,
    pub search: Option<String>,
}

pub async fn upload_excel(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut campaign_name = String::new();
    let mut file_bytes = Vec::new();
    
    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        
        if name == "campaign_name" {
            if let Ok(text) = field.text().await {
                campaign_name = text.trim().to_string();
            }
        } else if name == "file" {
            if let Ok(bytes) = field.bytes().await {
                file_bytes = bytes.to_vec();
            }
        }
    }
    
    let response = contacts::upload_excel_contacts(&state.db, &user_id, campaign_name, file_bytes).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn list_campaigns(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = contacts::get_campaigns_list(&state.db, &user_id).await?;
    Ok(Json(response))
}

pub async fn list_contacts(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Query(params): Query<ContactsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = contacts::get_contacts_list(&state.db, &user_id, params).await?;
    Ok(Json(response))
}

pub async fn delete_campaign(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    contacts::remove_campaign(&state.db, &user_id, &id_str).await?;
    Ok(StatusCode::NO_CONTENT)
}
