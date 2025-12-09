//! WebSocket server endpoint handler
//! 
//! This module contains the WebSocket handler for the /live endpoint
//! that streams real-time orderbook updates.

use axum::{
    extract::{ws::{Message, WebSocketUpgrade}, State},
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use crate::api::routes::AppState;
use crate::orderbook::engine::OrderbookState;

/// WebSocket handler for /live endpoint
/// 
/// Accepts WebSocket connections and streams real-time orderbook updates
pub async fn handle_websocket(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Handle an individual WebSocket connection
async fn handle_socket(socket: axum::extract::ws::WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    
    // Subscribe to orderbook updates
    let mut rx = state.orderbook_updates.subscribe();
    
    loop {
        tokio::select! {
            // Handle incoming orderbook updates
            result = rx.recv() => {
                match result {
                    Ok(orderbook_state) => {
                        let json = match serde_json::to_string(&orderbook_state) {
                            Ok(json) => json,
                            Err(e) => {
                                eprintln!("Error serializing orderbook state: {}", e);
                                continue;
                            }
                        };
                        
                        if sender.send(Message::Text(json)).await.is_err() {
                            // Client disconnected
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        // We lagged behind, skip this update
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        // Broadcast channel closed
                        break;
                    }
                }
            }
            
            // Handle incoming WebSocket messages
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Close(_))) => {
                        // Client closed the connection
                        break;
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        // Respond to ping with pong
                        if sender.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(_)) => {
                        // Error receiving message, close connection
                        break;
                    }
                    None => {
                        // Stream ended
                        break;
                    }
                    _ => {
                        // Ignore other messages
                    }
                }
            }
        }
    }
}

