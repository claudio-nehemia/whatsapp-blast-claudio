use axum::{
    routing::{get, post, put, delete},
    Router,
    middleware,
};
use std::sync::Arc;

use crate::database::Db;
use crate::routes::ws::WsHub;

pub mod auth;
pub mod contacts;
pub mod templates;
pub mod blasts;
pub mod settings;
pub mod ws;
pub mod senders;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub ws_hub: Arc<WsHub>,
    pub whatsapp_service_url: String,
}

pub fn create_router(state: Arc<AppState>) -> Router {
    // Routes that require authentication
    let protected_routes = Router::new()
        .route("/api/auth/profile", get(auth::get_profile))
        .route("/api/campaigns", get(contacts::list_campaigns))
        .route("/api/campaigns/:id", delete(contacts::delete_campaign))
        .route("/api/contacts/upload", post(contacts::upload_excel))
        .route("/api/contacts", get(contacts::list_contacts))
        .route("/api/templates/upload-image", post(templates::upload_template_image))
        .route("/api/templates", get(templates::list_templates).post(templates::create_template))
        .route("/api/templates/:id", get(templates::get_template).put(templates::update_template).delete(templates::delete_template))
        .route("/api/blasts", get(blasts::list_blasts).post(blasts::create_blast))
        .route("/api/blasts/:id", get(blasts::get_blast))
        .route("/api/blasts/:id/recipients", get(blasts::list_blast_recipients))
        .route("/api/blasts/:id/pause", post(blasts::pause_blast))
        .route("/api/blasts/:id/resume", post(blasts::resume_blast))
        .route("/api/blasts/:id/cancel", post(blasts::cancel_blast))
        .route("/api/settings", get(settings::get_settings).put(settings::update_settings))
        .route("/api/whatsapp/status", get(settings::get_whatsapp_status))
        .route("/api/whatsapp/connect", post(settings::connect_whatsapp))
        .route("/api/whatsapp/disconnect", post(settings::disconnect_whatsapp))
        .route("/api/senders", get(senders::list_senders).post(senders::create_sender))
        .route("/api/senders/:id/name", put(senders::update_sender_name))
        .route("/api/senders/:id/connect", post(senders::connect_sender))
        .route("/api/senders/:id/disconnect", post(senders::disconnect_sender))
        .route("/api/senders/:id", delete(senders::delete_sender))
        .layer(middleware::from_fn(crate::middleware::auth::require_auth));

    // Combine all routes
    Router::new()
        .merge(protected_routes)
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/internal/whatsapp-status", post(settings::webhook_whatsapp_status))
        .route("/api/internal/recipient-status", post(blasts::webhook_recipient_status))
        .route("/api/internal/blast-status", post(blasts::webhook_blast_status))
        .route("/ws", get(ws::ws_handler))
        .with_state(state)
}
