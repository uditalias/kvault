use tauri::State;
use uuid::Uuid;

use crate::db::workspaces::{self, Workspace};
use crate::AppDb;

#[tauri::command]
pub async fn list_workspaces(db: State<'_, AppDb>) -> Result<Vec<Workspace>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    workspaces::get_all_workspaces(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_workspace(
    db: State<'_, AppDb>,
    name: String,
    state_json: String,
) -> Result<Workspace, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    workspaces::create_workspace(&conn, &id, &name, &state_json).map_err(|e| e.to_string())?;

    // Fetch the created workspace to get timestamps
    workspaces::get_workspace(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_workspace(
    db: State<'_, AppDb>,
    id: String,
    name: String,
    state_json: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    workspaces::update_workspace(&conn, &id, &name, &state_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_workspace(db: State<'_, AppDb>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    workspaces::delete_workspace(&conn, &id).map_err(|e| e.to_string())
}
