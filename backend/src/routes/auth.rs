use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
    Extension,
};
use std::sync::Arc;

use crate::routes::AppState;
use crate::models::user::{RegisterRequest, LoginRequest};
use crate::services::auth;

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = auth::register_user(&state.db, payload).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = auth::login_user(&state.db, payload).await?;
    Ok(Json(response))
}

pub async fn get_profile(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = auth::get_user_profile(&state.db, &user_id).await?;
    Ok(Json(response))
}
