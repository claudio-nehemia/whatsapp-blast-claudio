use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
    Extension,
};
use std::sync::Arc;

use crate::routes::AppState;
use crate::models::template::CreateTemplateRequest;
use crate::services::templates;

pub async fn create_template(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Json(payload): Json<CreateTemplateRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = templates::insert_template(&state.db, &user_id, payload).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn list_templates(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = templates::get_templates_list(&state.db, &user_id).await?;
    Ok(Json(response))
}

pub async fn get_template(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = templates::get_template_details(&state.db, &user_id, &id_str).await?;
    Ok(Json(response))
}

pub async fn update_template(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id_str): Path<String>,
    Json(payload): Json<CreateTemplateRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let response = templates::modify_template(&state.db, &user_id, &id_str, payload).await?;
    Ok(Json(response))
}

pub async fn delete_template(
    State(state): State<Arc<AppState>>,
    Extension(user_id): Extension<String>,
    Path(id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    templates::remove_template(&state.db, &user_id, &id_str).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn upload_template_image(
    State(state): State<Arc<AppState>>,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut file_path = None;
    
    while let Some(field) = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image" {
            let filename = field.file_name().unwrap_or("upload.png").to_string();
            let data = field.bytes().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
            
            let upload_dir = std::path::Path::new("storage/uploads");
            if !upload_dir.exists() {
                std::fs::create_dir_all(upload_dir)
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            }
            
            let file_ext = std::path::Path::new(&filename)
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("png");
                
            let unique_name = format!("img-{}.{}", uuid::Uuid::new_v4(), file_ext);
            let target_path = upload_dir.join(&unique_name);
            
            std::fs::write(&target_path, &data)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                
            let abs_path = std::env::current_dir()
                .map(|d| d.join(&target_path).to_string_lossy().to_string())
                .unwrap_or_else(|_| target_path.to_string_lossy().to_string());
                
            file_path = Some(abs_path);
            break;
        }
    }
    
    if let Some(path) = file_path {
        Ok(Json(serde_json::json!({ "filePath": path })))
    } else {
        Err((StatusCode::BAD_REQUEST, "No image field found in multipart request".to_string()))
    }
}
