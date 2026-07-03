use axum::http::StatusCode;
use mongodb::bson::{doc, oid::ObjectId};
use chrono::Utc;
use futures_util::TryStreamExt;

use crate::database::Db;
use crate::models::template::{Template, CreateTemplateRequest, TemplateResponse};

pub async fn insert_template(
    db: &Db,
    payload: CreateTemplateRequest,
) -> Result<TemplateResponse, (StatusCode, String)> {
    let templates_col = db.db.collection::<Template>("templates");
    
    let new_template = Template {
        id: None,
        name: payload.name,
        body: payload.body,
        image_path: payload.image_path,
        campaign_ids: payload.campaign_ids,
        created_at: Utc::now(),
    };
    
    let insert_res = templates_col.insert_one(&new_template, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let template_oid = insert_res.inserted_id.as_object_id().unwrap();
    let mut db_temp = new_template;
    db_temp.id = Some(template_oid);
    
    Ok(db_temp.to_response())
}

pub async fn get_templates_list(
    db: &Db,
) -> Result<Vec<TemplateResponse>, (StatusCode, String)> {
    let templates_col = db.db.collection::<Template>("templates");
    
    let mut cursor = templates_col.find(None, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    let mut templates = Vec::new();
    
    while let Some(t) = cursor.try_next().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))? {
        templates.push(t.to_response());
    }
    
    templates.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    
    Ok(templates)
}

pub async fn get_template_details(
    db: &Db,
    id_str: &str,
) -> Result<TemplateResponse, (StatusCode, String)> {
    let templates_col = db.db.collection::<Template>("templates");
    
    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid template ID format".to_string()))?;
        
    let template = templates_col.find_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    match template {
        Some(t) => Ok(t.to_response()),
        None => Err((StatusCode::NOT_FOUND, "Template not found".to_string())),
    }
}

pub async fn modify_template(
    db: &Db,
    id_str: &str,
    payload: CreateTemplateRequest,
) -> Result<TemplateResponse, (StatusCode, String)> {
    let templates_col = db.db.collection::<Template>("templates");
    
    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid template ID format".to_string()))?;
        
    let update_doc = doc! {
        "$set": doc! {
            "name": payload.name,
            "body": payload.body,
            "image_path": payload.image_path,
            "campaign_ids": mongodb::bson::to_bson(&payload.campaign_ids).unwrap_or(mongodb::bson::Bson::Null),
        }
    };
    
    let res = templates_col.update_one(doc! { "_id": oid }, update_doc, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    if res.matched_count == 0 {
        return Err((StatusCode::NOT_FOUND, "Template not found".to_string()));
    }
    
    let updated = templates_col.find_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Template not found after update".to_string()))?;
        
    Ok(updated.to_response())
}

pub async fn remove_template(
    db: &Db,
    id_str: &str,
) -> Result<(), (StatusCode, String)> {
    let templates_col = db.db.collection::<Template>("templates");
    
    let oid = ObjectId::parse_str(id_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid template ID format".to_string()))?;
        
    let res = templates_col.delete_one(doc! { "_id": oid }, None).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
    if res.deleted_count == 0 {
        return Err((StatusCode::NOT_FOUND, "Template not found".to_string()));
    }
    
    Ok(())
}
