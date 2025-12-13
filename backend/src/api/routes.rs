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
use std::collections::HashMap;
use tokio::sync::{broadcast, RwLock, Mutex};
use crate::orderbook::store::SnapshotStore;
use crate::orderbook::snapshot::Snapshot;
use crate::orderbook::engine::{OrderbookState, OrderbookEngine};
use crate::api::error::ApiError;
use crate::api::websocket::handle_websocket;
use serde_json::{json, Value};

/// Per-ticker orderbook data
#[derive(Clone)]
pub struct TickerData {
    /// Broadcast channel for streaming orderbook updates to WebSocket clients
    pub orderbook_updates: broadcast::Sender<OrderbookState>,
    /// Orderbook engine for getting current state
    pub engine: Arc<RwLock<OrderbookEngine>>,
}

/// Application state shared across all handlers
#[derive(Clone)]
pub struct AppState {
    pub snapshot_store: Arc<SnapshotStore>,
    /// Map of ticker symbol to ticker data
    pub tickers: Arc<Mutex<HashMap<String, TickerData>>>,
}

/// Create the REST API router with all routes
pub fn create_router(state: AppState) -> Router {
    use tower_http::cors::{CorsLayer, Any};
    use tower::ServiceBuilder;
    use tower_http::trace::TraceLayer;
    
    // Configure CORS for development
    // Allows all origins, methods, and headers for local development
    // Note: CORS doesn't apply to WebSocket connections, but we apply it to REST routes
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    // Create router with WebSocket route first (before CORS layer)
    // WebSocket upgrades happen at the route level, not affected by CORS
    Router::new()
        .route("/live", axum::routing::get(handle_websocket))
        .route("/snapshot/:ticker/:timestamp", axum::routing::get(get_snapshot))
        .route("/history/:ticker", axum::routing::get(get_history))
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(cors)
        )
        .with_state(state)
}

/// GET /snapshot/{ticker}/{timestamp} - Retrieve snapshot by ticker and timestamp
/// 
/// Returns 404 if snapshot not found, 400 if timestamp format is invalid
async fn get_snapshot(
    Path((ticker, timestamp_str)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Json<Snapshot>, ApiError> {
    // Parse and validate timestamp format
    let timestamp = timestamp_str
        .parse::<i64>()
        .map_err(|_| ApiError::bad_request("Invalid timestamp format. Expected a Unix timestamp (integer)"))?;
    
    // Retrieve snapshot from store
    state.snapshot_store
        .get_snapshot(&ticker, timestamp)
        .await
        .map(Json)
        .ok_or_else(|| ApiError::not_found(format!("No snapshot found for ticker {} at timestamp: {}", ticker, timestamp)))
}

/// GET /history/{ticker} - Get history range (min/max timestamps) for a specific ticker
/// 
/// Returns JSON with minTimestamp and maxTimestamp fields
/// Returns 404 if no history is available for this ticker
async fn get_history(
    Path(ticker): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    state.snapshot_store
        .get_history_range(&ticker)
        .await
        .map(|(min, max)| Json(json!({
            "minTimestamp": min,
            "maxTimestamp": max,
        })))
        .ok_or_else(|| ApiError::not_found(format!("No history available for ticker {}. No snapshots have been stored yet.", ticker)))
}

