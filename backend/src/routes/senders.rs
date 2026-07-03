use axum::{
    extract::{State, Path},
    http::StatusCode,
    Json,
};
use std::sync::Arc;

use crate::routes::AppState;
use crate::models::sender::{CreateSenderRequest, UpdateSenderNameRequest, SenderResponse};
use crate::services::senders;

pub async fn list_senders(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<SenderResponse>>, (StatusCode, String)> {
    let response = senders::get_senders_list(&state.db).await?;
    Ok(Json(response))
}

pub async fn create_sender(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSenderRequest>,
) -> Result<(StatusCode, Json<SenderResponse>), (StatusCode, String)> {
    let response = senders::create_sender(&state.db, payload).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn update_sender_name(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateSenderNameRequest>,
) -> Result<Json<SenderResponse>, (StatusCode, String)> {
    let response = senders::update_sender_name(&state.db, &id, payload).await?;
    Ok(Json(response))
}

pub async fn connect_sender(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<(StatusCode, String), (StatusCode, String)> {
    let response = senders::trigger_connect_sender(&state.db, &id, &state.whatsapp_service_url).await?;
    Ok((StatusCode::OK, response))
}

pub async fn disconnect_sender(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<(StatusCode, String), (StatusCode, String)> {
    let response = senders::trigger_disconnect_sender(&state.db, &id, &state.whatsapp_service_url).await?;
    Ok((StatusCode::OK, response))
}

pub async fn delete_sender(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    senders::delete_sender(&state.db, &id, &state.whatsapp_service_url).await?;
    Ok(StatusCode::NO_CONTENT)
}
