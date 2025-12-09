//! REST API route handlers
//! 
//! This module contains handlers for REST endpoints:
//! - GET /snapshot/{timestamp} - Retrieve snapshot by timestamp
//! - GET /history - Get history range (min/max timestamps)

use axum::{
    extract::{Path, State},
    response::Json,
    Router,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use crate::orderbook::store::SnapshotStore;
use crate::orderbook::snapshot::Snapshot;
use crate::orderbook::engine::OrderbookState;
use crate::api::error::ApiError;
use crate::api::websocket::handle_websocket;
use serde_json::{json, Value};

/// Application state shared across all handlers
#[derive(Clone)]
pub struct AppState {
    pub snapshot_store: Arc<SnapshotStore>,
    /// Broadcast channel for streaming orderbook updates to WebSocket clients
    pub orderbook_updates: broadcast::Sender<OrderbookState>,
}

/// Create the REST API router with all routes
pub fn create_router(state: AppState) -> Router {
    use tower_http::cors::{CorsLayer, Any};
    
    // Configure CORS for development
    // Allows all origins, methods, and headers for local development
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    Router::new()
        .route("/snapshot/:timestamp", axum::routing::get(get_snapshot))
        .route("/history", axum::routing::get(get_history))
        .route("/live", axum::routing::get(handle_websocket))
        .layer(cors)
        .with_state(state)
}

/// GET /snapshot/{timestamp} - Retrieve snapshot by timestamp
/// 
/// Returns 404 if snapshot not found, 400 if timestamp format is invalid
async fn get_snapshot(
    Path(timestamp_str): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Snapshot>, ApiError> {
    // Parse and validate timestamp format
    let timestamp = timestamp_str
        .parse::<i64>()
        .map_err(|_| ApiError::bad_request("Invalid timestamp format. Expected a Unix timestamp (integer)"))?;
    
    // Retrieve snapshot from store
    state.snapshot_store
        .get_snapshot(timestamp)
        .await
        .map(Json)
        .ok_or_else(|| ApiError::not_found(format!("No snapshot found for timestamp: {}", timestamp)))
}

/// GET /history - Get history range (min/max timestamps)
/// 
/// Returns JSON with minTimestamp and maxTimestamp fields
/// Returns 404 if no history is available
async fn get_history(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    state.snapshot_store
        .get_history_range()
        .await
        .map(|(min, max)| Json(json!({
            "minTimestamp": min,
            "maxTimestamp": max,
        })))
        .ok_or_else(|| ApiError::not_found("No history available. No snapshots have been stored yet."))
}

