use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
    Extension,
};
use std::sync::Arc;
use serde::Deserialize;
use mongodb::bson::{doc, oid::ObjectId};
use futures_util::TryStreamExt;
use chrono::Utc;

use crate::routes::AppState;
use crate::models::user::User;
use crate::services::auth;
use crate::utils::auth::hash_password;

#[derive(Debug, Deserialize)]
pub struct CreateUserAdminRequest {
    pub name: String,
    pub email: String,
    pub password: String,
    pub role: String, // "user" or "superadmin"
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserAdminRequest {
    pub name: String,
    pub email: String,
    pub role: String, // "user" or "superadmin"
    pub password: Option<String>,
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (_, role) = auth::check_user_role(&state.db, &user_id).await?;
    if role != "superadmin" {
        return Err((StatusCode::FORBIDDEN, "Forbidden: Super Admin only".to_string()));
    }
    
    let users_col = state.db.db.collection::<User>("users");
    let mut cursor = users_col.find(None, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let mut response_list = Vec::new();
    while let Some(u) = cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        response_list.push(u.to_response());
    }
    
    Ok(Json(response_list))
}

pub async fn create_user(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Json(payload): Json<CreateUserAdminRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (_, role) = auth::check_user_role(&state.db, &user_id).await?;
    if role != "superadmin" {
        return Err((StatusCode::FORBIDDEN, "Forbidden: Super Admin only".to_string()));
    }
    
    if payload.role != "user" && payload.role != "superadmin" {
        return Err((StatusCode::BAD_REQUEST, "Invalid role. Must be 'user' or 'superadmin'".to_string()));
    }

    let users_col = state.db.db.collection::<User>("users");
    
    let existing = users_col.find_one(doc! { "email": &payload.email }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if existing.is_some() {
        return Err((StatusCode::BAD_REQUEST, "Email already registered".to_string()));
    }
    
    let password_hash = hash_password(&payload.password);
    let new_user = User {
        id: None,
        name: payload.name,
        email: payload.email,
        password_hash,
        role: payload.role,
        created_at: Utc::now(),
    };
    
    let insert_result = users_col.insert_one(&new_user, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let new_oid = insert_result.inserted_id.as_object_id().unwrap();
    let mut db_user = new_user;
    db_user.id = Some(new_oid);
    
    Ok((StatusCode::CREATED, Json(db_user.to_response())))
}

pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id_str): Path<String>,
    Json(payload): Json<UpdateUserAdminRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (_, role) = auth::check_user_role(&state.db, &user_id).await?;
    if role != "superadmin" {
        return Err((StatusCode::FORBIDDEN, "Forbidden: Super Admin only".to_string()));
    }
    
    if payload.role != "user" && payload.role != "superadmin" {
        return Err((StatusCode::BAD_REQUEST, "Invalid role. Must be 'user' or 'superadmin'".to_string()));
    }

    let users_col = state.db.db.collection::<User>("users");
    let oid = ObjectId::parse_str(&id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID format".to_string()))?;
        
    let existing = users_col.find_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "User not found".to_string()))?;
        
    // Email check for duplicate (if email changed)
    if existing.email != payload.email {
        let email_exists = users_col.find_one(doc! { "email": &payload.email }, None).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if email_exists.is_some() {
            return Err((StatusCode::BAD_REQUEST, "Email already taken".to_string()));
        }
    }
    
    let mut update_fields = doc! {
        "name": payload.name,
        "email": payload.email,
        "role": payload.role,
    };
    
    if let Some(ref new_pass) = payload.password {
        if !new_pass.trim().is_empty() {
            update_fields.insert("password_hash", hash_password(new_pass));
        }
    }
    
    let update_doc = doc! {
        "$set": update_fields
    };
    
    users_col.update_one(doc! { "_id": oid }, update_doc, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let updated = users_col.find_one(doc! { "_id": oid }, None).await
        .unwrap_or(None)
        .ok_or_else(|| (StatusCode::NOT_FOUND, "User not found after update".to_string()))?;
        
    Ok(Json(updated.to_response()))
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let (admin_oid, role) = auth::check_user_role(&state.db, &user_id).await?;
    if role != "superadmin" {
        return Err((StatusCode::FORBIDDEN, "Forbidden: Super Admin only".to_string()));
    }
    
    let oid = ObjectId::parse_str(&id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID format".to_string()))?;
        
    if oid == admin_oid {
        return Err((StatusCode::BAD_REQUEST, "Cannot delete your own superadmin account".to_string()));
    }
    
    let users_col = state.db.db.collection::<User>("users");
    let res = users_col.delete_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    if res.deleted_count == 0 {
        return Err((StatusCode::NOT_FOUND, "User not found".to_string()));
    }
    
    Ok(StatusCode::NO_CONTENT)
}
