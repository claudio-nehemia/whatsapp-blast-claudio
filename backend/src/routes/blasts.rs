use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use crate::routes::AppState;
use crate::models::blast::CreateBlastRequest;
use crate::services::blasts;

// Import callback payload structs defined in route layer or shared
use crate::routes::blasts::callbacks::{RecipientStatusCallback, BlastStatusCallback};

pub mod callbacks {
    use serde::Deserialize;
    
    #[derive(Deserialize)]
    pub struct RecipientStatusCallback {
        #[serde(rename = "blastId")]
        pub blast_id: String,
        #[serde(rename = "recipientId")]
        pub recipient_id: String,
        pub status: String,
        #[serde(rename = "errorMessage")]
        pub error_message: Option<String>,
        #[serde(rename = "sentAt")]
        pub sent_at: Option<String>,
    }

    #[derive(Deserialize)]
    pub struct BlastStatusCallback {
        #[serde(rename = "blastId")]
        pub blast_id: String,
        pub status: String,
    }
}

pub async fn create_blast(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateBlastRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = blasts::execute_blast(&state.db, &state.ws_hub, &state.whatsapp_service_url, payload).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn list_blasts(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = blasts::get_blasts_list(&state.db).await?;
    Ok(Json(response))
}

pub async fn get_blast(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = blasts::get_blast_details(&state.db, &id_str).await?;
    Ok(Json(response))
}

pub async fn list_blast_recipients(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = blasts::get_blast_recipients_list(&state.db, &id_str).await?;
    Ok(Json(response))
}

pub async fn pause_blast(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    blasts::trigger_blast_action(&state.db, &state.ws_hub, &state.whatsapp_service_url, &id_str, "pause", "Paused").await?;
    Ok(StatusCode::OK)
}

pub async fn resume_blast(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    blasts::trigger_blast_action(&state.db, &state.ws_hub, &state.whatsapp_service_url, &id_str, "resume", "Running").await?;
    Ok(StatusCode::OK)
}

pub async fn cancel_blast(
    State(state): State<Arc<AppState>>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    blasts::trigger_blast_action(&state.db, &state.ws_hub, &state.whatsapp_service_url, &id_str, "cancel", "Cancelled").await?;
    Ok(StatusCode::OK)
}

// Webhook status endpoints from Node.js
pub async fn webhook_recipient_status(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RecipientStatusCallback>,
) -> impl IntoResponse {
    let res = blasts::update_recipient_status(
        &state.db, 
        &state.ws_hub, 
        &payload.recipient_id, 
        &payload.blast_id, 
        &payload.status, 
        payload.error_message, 
        payload.sent_at
    ).await;
    
    match res {
        Ok(_) => StatusCode::OK,
        Err((code, _)) => code,
    }
}

pub async fn webhook_blast_status(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<BlastStatusCallback>,
) -> impl IntoResponse {
    let res = blasts::update_blast_status(&state.db, &state.ws_hub, &payload.blast_id, &payload.status).await;
    match res {
        Ok(_) => StatusCode::OK,
        Err((code, _)) => code,
    }
}
