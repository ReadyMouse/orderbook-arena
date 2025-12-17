//! WebSocket server endpoint handler
//! 
//! This module contains the WebSocket handler for the /live endpoint
//! that streams real-time orderbook updates.

use axum::{
    extract::{ws::{Message, WebSocketUpgrade}, State, Query},
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use crate::api::routes::AppState;
use crate::orderbook::engine::OrderbookState;
use crate::kraken::types::OhlcData;
use serde::{Deserialize, Serialize};

/// WebSocket message wrapper to distinguish between different data types
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum WebSocketMessage {
    #[serde(rename = "orderbook")]
    Orderbook { data: OrderbookState },
    #[serde(rename = "ohlc")]
    Ohlc { data: OhlcData },
}

#[derive(Debug, Deserialize)]
pub struct WebSocketQuery {
    #[serde(default = "default_ticker")]
    ticker: String,
}

fn default_ticker() -> String {
    "ZEC".to_string()
}

/// WebSocket handler for /live endpoint
/// 
/// Accepts WebSocket connections and streams real-time orderbook updates
/// Query parameter: ticker (optional, defaults to "ZEC")
pub async fn handle_websocket(
    ws: WebSocketUpgrade,
    Query(query): Query<WebSocketQuery>,
    State(state): State<AppState>,
) -> Response {
    eprintln!("WebSocket upgrade request received for /live endpoint with ticker: {}", query.ticker);
    
    ws.on_upgrade(|socket| {
        eprintln!("WebSocket connection upgraded for ticker {}, starting handler", query.ticker);
        handle_socket(socket, state, query.ticker)
    })
}

/// Handle an individual WebSocket connection
async fn handle_socket(socket: axum::extract::ws::WebSocket, state: AppState, ticker: String) {
    eprintln!("WebSocket handler started for ticker: {}", ticker);
    let (mut sender, mut receiver) = socket.split();
    
    // Get or create ticker data
    let ticker_data = {
        let mut tickers = state.tickers.lock().await;
        tickers.entry(ticker.clone()).or_insert_with(|| {
            eprintln!("Creating new ticker data for: {}", ticker);
            let (orderbook_tx, _) = broadcast::channel::<OrderbookState>(100);
            let (ohlc_tx, _) = broadcast::channel::<OhlcData>(100);
            crate::api::routes::TickerData {
                orderbook_updates: orderbook_tx,
                ohlc_updates: ohlc_tx,
                engine: std::sync::Arc::new(tokio::sync::RwLock::new(
                    crate::orderbook::engine::OrderbookEngine::new()
                )),
            }
        }).clone()
    };
    
    // Send current state immediately when client connects
    let current_state = {
        let engine_guard = ticker_data.engine.read().await;
        engine_guard.get_current_state()
    };
    
    eprintln!("Current orderbook state for {}: {} bids, {} asks", ticker, current_state.bids.len(), current_state.asks.len());
    
    // Send initial state if orderbook has data
    if !current_state.bids.is_empty() || !current_state.asks.is_empty() {
        let message = WebSocketMessage::Orderbook { data: current_state };
        if let Ok(json) = serde_json::to_string(&message) {
            eprintln!("Sending initial state to client for ticker {}", ticker);
            if let Err(e) = sender.send(Message::Text(json)).await {
                eprintln!("Error sending initial state: {}", e);
                return;
            }
        }
    } else {
        eprintln!("Orderbook is empty for {}, not sending initial state", ticker);
    }
    
    // Subscribe to orderbook updates for this ticker
    let mut orderbook_rx = ticker_data.orderbook_updates.subscribe();
    // Subscribe to OHLC updates for this ticker
    let mut ohlc_rx = ticker_data.ohlc_updates.subscribe();
    
    loop {
        tokio::select! {
            // Handle incoming orderbook updates
            result = orderbook_rx.recv() => {
                match result {
                    Ok(orderbook_state) => {
                        let message = WebSocketMessage::Orderbook { data: orderbook_state };
                        let json = match serde_json::to_string(&message) {
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
            
            // Handle incoming OHLC updates
            result = ohlc_rx.recv() => {
                match result {
                    Ok(ohlc_data) => {
                        let message = WebSocketMessage::Ohlc { data: ohlc_data };
                        let json = match serde_json::to_string(&message) {
                            Ok(json) => json,
                            Err(e) => {
                                eprintln!("Error serializing OHLC data: {}", e);
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

