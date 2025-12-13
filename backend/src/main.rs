mod kraken;
mod orderbook;
mod config;
mod api;

use std::net::SocketAddr;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, RwLock, Mutex};
use crate::api::routes::{AppState, TickerData};
use crate::kraken::client::{KrakenClient, KrakenMessage};
use crate::kraken::types::{BookMessage, BookSnapshot, BookDelta, parse_book_snapshot, parse_book_delta};
use crate::orderbook::engine::OrderbookEngine;
use crate::orderbook::store::SnapshotStore;
use crate::orderbook::integration::start_snapshot_storage_task;

/// Mapping from ticker symbol to Kraken trading pair
fn ticker_to_pair(ticker: &str) -> String {
    match ticker {
        "BTC" => "BTC/USD".to_string(),
        "ETH" => "ETH/USD".to_string(),
        "XMR" => "XMR/USD".to_string(),
        "ZEC" => "ZEC/USD".to_string(),
        _ => format!("{}/USD", ticker), // Default fallback
    }
}

/// Start a Kraken connection for a specific ticker
fn start_kraken_task(ticker: String, ticker_data: TickerData, book_depth: u32) {
    tokio::spawn(async move {
        let client = KrakenClient::new();
        let trading_pair = ticker_to_pair(&ticker);
        eprintln!("Starting Kraken task for ticker {} ({})", ticker, trading_pair);
        
        loop {
            match client.connect().await {
                Ok(mut connection) => {
                    eprintln!("Connected to Kraken WebSocket for {}", ticker);
                    
                    // Subscribe to book channel
                    if let Err(e) = connection.subscribe_book(&trading_pair, Some(book_depth)).await {
                        eprintln!("Failed to subscribe to book channel for {}: {}", ticker, e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                        continue;
                    }
                    
                    // Process messages
                    loop {
                        match connection.next_message().await {
                            Ok(Some(KrakenMessage::Book(book_msg))) => {
                                if let Some(book_data) = book_msg.book_data() {
                                    // Try to parse as snapshot first
                                    match parse_book_snapshot(&book_data) {
                                        Ok(snapshot) => {
                                            eprintln!("[{}] Parsed as snapshot: {} bids, {} asks", ticker, snapshot.bids.len(), snapshot.asks.len());
                                            let mut engine_guard = ticker_data.engine.write().await;
                                            if let Err(e) = engine_guard.apply_snapshot(&snapshot) {
                                                eprintln!("[{}] Error applying snapshot: {}", ticker, e);
                                            } else {
                                                let state = engine_guard.get_current_state();
                                                let _ = ticker_data.orderbook_updates.send(state);
                                            }
                                        }
                                        Err(_) => {
                                            // Try parsing as delta
                                            match parse_book_delta(&book_data) {
                                                Ok(delta) => {
                                                    let mut engine_guard = ticker_data.engine.write().await;
                                                    if let Err(e) = engine_guard.apply_delta(&delta) {
                                                        eprintln!("[{}] Error applying delta: {}", ticker, e);
                                                    } else {
                                                        let state = engine_guard.get_current_state();
                                                        let _ = ticker_data.orderbook_updates.send(state);
                                                    }
                                                }
                                                Err(e) => {
                                                    eprintln!("[{}] Failed to parse message: {}", ticker, e);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Ok(Some(KrakenMessage::SubscriptionStatus(status))) => {
                                eprintln!("[{}] Subscription status: {:?}", ticker, status);
                            }
                            Ok(Some(KrakenMessage::Close)) => {
                                eprintln!("[{}] Kraken connection closed", ticker);
                                break;
                            }
                            Ok(None) => {
                                // Unknown message type, continue
                            }
                            Err(e) => {
                                eprintln!("[{}] Error receiving message from Kraken: {}", ticker, e);
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[{}] Failed to connect to Kraken: {}. Retrying in 5 seconds...", ticker, e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            }
        }
    });
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = config::Config::from_env();
    
    // Create shared state
    let snapshot_store = Arc::new(SnapshotStore::new());
    
    // Initialize tickers map with default tickers
    let tickers_map = Arc::new(Mutex::new(HashMap::new()));
    
    // Start Kraken connections for all supported tickers
    let supported_tickers = vec!["ZEC", "BTC", "ETH", "XMR"];
    for ticker in supported_tickers {
        let engine = Arc::new(RwLock::new(OrderbookEngine::new()));
        let (orderbook_updates_tx, _) = broadcast::channel::<crate::orderbook::engine::OrderbookState>(100);
        
        let ticker_data = TickerData {
            orderbook_updates: orderbook_updates_tx,
            engine: engine.clone(),
        };
        
        // Store in map
        {
            let mut tickers = tickers_map.lock().await;
            tickers.insert(ticker.to_string(), ticker_data.clone());
        }
        
        // Start Kraken connection task for this ticker
        start_kraken_task(ticker.to_string(), ticker_data.clone(), config.book_depth);
        
        // Start snapshot storage task for this ticker
        start_snapshot_storage_task(engine.clone(), snapshot_store.clone(), config.clone());
    }
    
    // Create AppState
    let app_state = AppState {
        snapshot_store,
        tickers: tickers_map,
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
