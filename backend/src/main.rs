mod kraken;
mod orderbook;
mod config;
mod api;

use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, RwLock};
use crate::api::routes::AppState;
use crate::kraken::client::{KrakenClient, KrakenMessage};
use crate::kraken::types::{BookMessage, BookSnapshot, BookDelta, parse_book_snapshot, parse_book_delta};
use crate::orderbook::engine::OrderbookEngine;
use crate::orderbook::store::SnapshotStore;
use crate::orderbook::integration::start_snapshot_storage_task;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = config::Config::from_env();
    
    // Create shared state
    let engine = Arc::new(RwLock::new(OrderbookEngine::new()));
    let snapshot_store = Arc::new(SnapshotStore::new());
    let (orderbook_updates_tx, _) = broadcast::channel::<crate::orderbook::engine::OrderbookState>(100);
    
    // Clone for the Kraken processing task
    let engine_for_kraken = engine.clone();
    let updates_tx_for_kraken = orderbook_updates_tx.clone();
    
    // Clone for the broadcast task
    let engine_for_broadcast = engine.clone();
    let updates_tx_for_broadcast = orderbook_updates_tx.clone();
    
    // Start snapshot storage task
    start_snapshot_storage_task(engine.clone(), snapshot_store.clone(), config.clone());
    
    // Start task to process Kraken messages and update orderbook
    tokio::spawn(async move {
        let client = KrakenClient::new();
        loop {
            match client.connect().await {
                Ok(mut connection) => {
                    eprintln!("Connected to Kraken WebSocket");
                    
                    // Subscribe to book channel
                    if let Err(e) = connection.subscribe_book(&config.trading_pair, Some(config.book_depth)).await {
                        eprintln!("Failed to subscribe to book channel: {}", e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                        continue;
                    }
                    
                    // Process messages
                    loop {
                        match connection.next_message().await {
                            Ok(Some(KrakenMessage::Book(book_msg))) => {
                                eprintln!("Received book message, channel_id: {:?}", book_msg.channel_id());
                                // Process book message
                                if let Some(book_data) = book_msg.book_data() {
                                    eprintln!("Book data extracted, trying to parse...");
                                    // Try to parse as snapshot first
                                    match parse_book_snapshot(&book_data) {
                                        Ok(snapshot) => {
                                            eprintln!("Parsed as snapshot: {} bids, {} asks", snapshot.bids.len(), snapshot.asks.len());
                                            let mut engine_guard = engine_for_kraken.write().await;
                                            if let Err(e) = engine_guard.apply_snapshot(&snapshot) {
                                                eprintln!("Error applying snapshot: {}", e);
                                            } else {
                                                eprintln!("Snapshot applied successfully, broadcasting update");
                                                // Broadcast update
                                                let state = engine_guard.get_current_state();
                                                let _ = updates_tx_for_kraken.send(state);
                                            }
                                        }
                                        Err(snapshot_err) => {
                                            // Try parsing as delta
                                            match parse_book_delta(&book_data) {
                                                Ok(delta) => {
                                                    eprintln!("Parsed as delta: {} bids, {} asks", delta.bids.len(), delta.asks.len());
                                                    let mut engine_guard = engine_for_kraken.write().await;
                                                    if let Err(e) = engine_guard.apply_delta(&delta) {
                                                        eprintln!("Error applying delta: {}", e);
                                                    } else {
                                                        eprintln!("Delta applied successfully, broadcasting update");
                                                        // Broadcast update
                                                        let state = engine_guard.get_current_state();
                                                        let _ = updates_tx_for_kraken.send(state);
                                                    }
                                                }
                                                Err(delta_err) => {
                                                    eprintln!("Failed to parse as snapshot or delta. Snapshot error: {}, Delta error: {}", snapshot_err, delta_err);
                                                    eprintln!("Book data: {}", serde_json::to_string(&book_data).unwrap_or_default());
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    eprintln!("No book data extracted from message");
                                }
                            }
                            Ok(Some(KrakenMessage::SubscriptionStatus(status))) => {
                                eprintln!("Subscription status: {:?}", status);
                            }
                            Ok(Some(KrakenMessage::Close)) => {
                                eprintln!("Kraken connection closed");
                                break;
                            }
                            Ok(None) => {
                                // Unknown message type, continue
                            }
                            Err(e) => {
                                eprintln!("Error receiving message from Kraken: {}", e);
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to connect to Kraken: {}. Retrying in 5 seconds...", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            }
        }
    });
    
    // Create AppState
    let app_state = AppState {
        snapshot_store,
        orderbook_updates: orderbook_updates_tx,
        engine: engine.clone(),
    };
    
    // Create router with REST routes and WebSocket handler
    let app = api::routes::create_router(app_state);
    
    // Bind to the configured port
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;
    
    eprintln!("Server listening on http://{}", addr);
    eprintln!("WebSocket endpoint: ws://{}/live", addr);
    eprintln!("REST endpoints:");
    eprintln!("  GET /snapshot/:timestamp");
    eprintln!("  GET /history");
    
    axum::serve(listener, app).await?;
    
    Ok(())
}
