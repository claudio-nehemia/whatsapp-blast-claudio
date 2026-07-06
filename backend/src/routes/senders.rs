use axum::{
    extract::{State, Path},
    http::StatusCode,
    Json,
    Extension,
};
use std::sync::Arc;

use crate::routes::AppState;
use crate::models::sender::{CreateSenderRequest, UpdateSenderNameRequest, SenderResponse};
use crate::services::senders;

pub async fn list_senders(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
) -> Result<Json<Vec<SenderResponse>>, (StatusCode, String)> {
    let response = senders::get_senders_list(&state.db, &user_id).await?;
    Ok(Json(response))
}

pub async fn create_sender(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Json(payload): Json<CreateSenderRequest>,
) -> Result<(StatusCode, Json<SenderResponse>), (StatusCode, String)> {
    let response = senders::create_sender(&state.db, &user_id, payload).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn update_sender_name(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateSenderNameRequest>,
) -> Result<Json<SenderResponse>, (StatusCode, String)> {
    let response = senders::update_sender_name(&state.db, &user_id, &id, payload).await?;
    Ok(Json(response))
}

pub async fn connect_sender(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
) -> Result<(StatusCode, String), (StatusCode, String)> {
    let response = senders::trigger_connect_sender(&state.db, &user_id, &id, &state.whatsapp_service_url).await?;
    Ok((StatusCode::OK, response))
}

pub async fn disconnect_sender(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
) -> Result<(StatusCode, String), (StatusCode, String)> {
    let response = senders::trigger_disconnect_sender(&state.db, &user_id, &id, &state.whatsapp_service_url).await?;
    Ok((StatusCode::OK, response))
}

pub async fn delete_sender(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    senders::delete_sender(&state.db, &user_id, &id, &state.whatsapp_service_url).await?;
    Ok(StatusCode::NO_CONTENT)
}
