use axum::http::StatusCode;
use mongodb::bson::{doc, oid::ObjectId};
use chrono::Utc;

use crate::database::Db;
use crate::models::user::{User, RegisterRequest, LoginRequest, AuthResponse, UserResponse};
use crate::utils::auth::{hash_password, verify_password, generate_token};

pub async fn register_user(
    db: &Db,
    payload: RegisterRequest,
) -> Result<AuthResponse, (StatusCode, String)> {
    let users_col = db.db.collection::<User>("users");
    
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
        role: "user".to_string(),
        created_at: Utc::now(),
    };
    
    let insert_result = users_col.insert_one(&new_user, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let user_id = insert_result.inserted_id.as_object_id()
        .ok_or_else(|| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get inserted ID".to_string()))?;
        
    let token = generate_token(&user_id.to_hex())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let mut db_user = new_user;
    db_user.id = Some(user_id);
    
    Ok(AuthResponse {
        token,
        user: db_user.to_response(),
    })
}

pub async fn login_user(
    db: &Db,
    payload: LoginRequest,
) -> Result<AuthResponse, (StatusCode, String)> {
    let users_col = db.db.collection::<User>("users");
    
    let user = users_col.find_one(doc! { "email": &payload.email }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let user = match user {
        Some(u) => u,
        None => return Err((StatusCode::UNAUTHORIZED, "Invalid email or password".to_string())),
    };
    
    if !verify_password(&payload.password, &user.password_hash) {
        return Err((StatusCode::UNAUTHORIZED, "Invalid email or password".to_string()));
    }
    
    let user_id = user.id.unwrap().to_hex();
    let token = generate_token(&user_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    Ok(AuthResponse {
        token,
        user: user.to_response(),
    })
}

pub async fn get_user_profile(
    db: &Db,
    user_id: &str,
) -> Result<UserResponse, (StatusCode, String)> {
    let users_col = db.db.collection::<User>("users");
    
    let oid = ObjectId::parse_str(user_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID format".to_string()))?;
        
    let user = users_col.find_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    match user {
        Some(u) => Ok(u.to_response()),
        None => Err((StatusCode::NOT_FOUND, "User not found".to_string())),
    }
}

pub async fn check_user_role(
    db: &Db,
    user_id: &str,
) -> Result<(ObjectId, String), (StatusCode, String)> {
    let users_col = db.db.collection::<User>("users");
    
    let oid = ObjectId::parse_str(user_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID format".to_string()))?;
        
    let user = users_col.find_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "User not found".to_string()))?;
        
    Ok((oid, user.role))
}
