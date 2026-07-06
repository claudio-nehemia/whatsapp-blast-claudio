use std::sync::Arc;
use std::env;
use tower_http::cors::{CorsLayer, Any};

mod database;
mod models;
mod middleware;
mod utils;
mod routes;
mod services;

use database::Db;
use routes::{create_router, AppState};
use routes::ws::WsHub;

#[tokio::main]
async fn main() {
    // Load .env file
    let _ = dotenvy::dotenv();

    // Init MongoDB Connection
    let db = Db::init().await;

    // Seed Super Admin if not present
    seed_super_admin(&db).await;

    // Migrate legacy data to main user
    migrate_legacy_data(&db).await;

    // Init WebSocket Hub
    let ws_hub = Arc::new(WsHub::new());

    // WhatsApp Service URL configuration
    let whatsapp_service_url = env::var("WHATSAPP_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:5000".to_string());

    // Build shared Application State
    let state = AppState {
        db,
        ws_hub,
        whatsapp_service_url,
    };

    // Configure CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build Router
    let app = create_router(Arc::new(state)).layer(cors);

    // Start Server
    let port = env::var("PORT").unwrap_or_else(|_| "8000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    
    let listener = tokio::net::TcpListener::bind(&addr).await
        .unwrap_or_else(|e| panic!("Failed to bind server to address {}: {}", addr, e));

    println!("Rust Backend server running at http://{}", addr);

    axum::serve(listener, app).await
        .expect("Server failed to run");
}

async fn seed_super_admin(db: &Db) {
    let users_col = db.db.collection::<models::user::User>("users");
    
    // Check if a superadmin exists
    let filter = mongodb::bson::doc! { "role": "superadmin" };
    match users_col.find_one(filter, None).await {
        Ok(Some(_)) => {
            println!("Super Admin account already exists.");
        }
        Ok(None) => {
            let password_hash = utils::auth::hash_password("superadmin123");
            let admin = models::user::User {
                id: None,
                name: "Super Admin".to_string(),
                email: "admin@claz.me".to_string(),
                password_hash,
                role: "superadmin".to_string(),
                created_at: chrono::Utc::now(),
            };
            match users_col.insert_one(&admin, None).await {
                Ok(_) => println!("Seeded Super Admin account successfully (admin@claz.me / superadmin123)"),
                Err(e) => eprintln!("Failed to seed Super Admin account: {}", e),
            }
        }
        Err(e) => {
            eprintln!("Failed to check for Super Admin: {}", e);
        }
    }
}

async fn migrate_legacy_data(db: &Db) {
    let users_col = db.db.collection::<models::user::User>("users");
    
    // Find the user with email pmkmercubuana@gmail.com
    let filter = mongodb::bson::doc! { "email": "pmkmercubuana@gmail.com" };
    match users_col.find_one(filter, None).await {
        Ok(Some(user)) => {
            if let Some(user_oid) = user.id {
                println!("Found legacy owner user: pmkmercubuana@gmail.com (ID: {}). Running data migration...", user_oid.to_hex());
                
                // Collections to update
                let collections = vec![
                    "contact_campaigns",
                    "contacts",
                    "templates",
                    "blasts",
                    "whatsapp_senders",
                    "settings"
                ];
                
                for coll_name in collections {
                    let coll = db.db.collection::<mongodb::bson::Document>(coll_name);
                    
                    // Filter: where user_id does not exist or is null
                    let update_filter = mongodb::bson::doc! {
                        "$or": [
                            { "user_id": { "$exists": false } },
                            { "user_id": mongodb::bson::Bson::Null }
                        ]
                    };
                    
                    let update_doc = mongodb::bson::doc! {
                        "$set": { "user_id": user_oid }
                    };
                    
                    match coll.update_many(update_filter, update_doc, None).await {
                        Ok(res) => {
                            if res.modified_count > 0 {
                                println!("Migrated {} documents in collection '{}' to owner pmkmercubuana@gmail.com", res.modified_count, coll_name);
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to migrate collection '{}': {}", coll_name, e);
                        }
                    }
                }
            }
        }
        Ok(None) => {
            println!("Legacy owner user pmkmercubuana@gmail.com not found. Skipping migration.");
        }
        Err(e) => {
            eprintln!("Failed to query legacy owner user for migration: {}", e);
        }
    }
}
