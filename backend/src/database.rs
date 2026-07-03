use mongodb::{Client, Database};
use std::env;

#[derive(Clone)]
pub struct Db {
    pub client: Client,
    pub db: Database,
}

impl Db {
    pub async fn init() -> Self {
        let uri = env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        let db_name = env::var("MONGO_DB_NAME").unwrap_or_else(|_| "whatsapp_blast".to_string());
        
        let client = Client::with_uri_str(&uri).await.expect("Failed to connect to MongoDB");
        let db = client.database(&db_name);
        
        println!("Connected to MongoDB at: {}/{}", uri, db_name);
        
        Self { client, db }
    }
}
