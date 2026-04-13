use tauri::State;
use uuid::Uuid;

use crate::db::filters::{self, SavedFilter};
use crate::AppDb;

#[tauri::command]
pub async fn list_saved_filters(
    db: State<'_, AppDb>,
    namespace_id: String,
) -> Result<Vec<SavedFilter>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    filters::get_saved_filters(&conn, &namespace_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_filter(
    db: State<'_, AppDb>,
    namespace_id: String,
    name: String,
    filter_type: String,
    filter_value: String,
) -> Result<SavedFilter, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    filters::create_saved_filter(&conn, &id, &namespace_id, &name, &filter_type, &filter_value)
        .map_err(|e| e.to_string())?;
    filters::get_saved_filter(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_saved_filter(db: State<'_, AppDb>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    filters::delete_saved_filter(&conn, &id).map_err(|e| e.to_string())
}
