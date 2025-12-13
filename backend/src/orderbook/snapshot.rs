use serde::{Deserialize, Serialize};
use crate::orderbook::engine::{PriceLevelEntry, OrderbookState};

/// Snapshot of orderbook state at a specific point in time
/// 
/// This struct represents a complete orderbook state that can be stored
/// and retrieved for time-travel functionality.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    /// Ticker symbol (e.g., "ZEC", "BTC", "ETH", "XMR")
    pub ticker: String,
    
    /// Unix timestamp in seconds
    pub timestamp: i64,
    
    /// Last traded price (None if no trades have occurred)
    #[serde(rename = "lastPrice")]
    pub last_price: Option<f64>,
    
    /// Bids (buy orders) sorted in descending order by price (highest first)
    pub bids: Vec<PriceLevelEntry>,
    
    /// Asks (sell orders) sorted in ascending order by price (lowest first)
    pub asks: Vec<PriceLevelEntry>,
}

impl Snapshot {
    /// Create a new snapshot from the given data
    pub fn new(
        ticker: String,
        timestamp: i64,
        last_price: Option<f64>,
        bids: Vec<PriceLevelEntry>,
        asks: Vec<PriceLevelEntry>,
    ) -> Self {
        Self {
            ticker,
            timestamp,
            last_price,
            bids,
            asks,
        }
    }

    /// Create a snapshot from an OrderbookState with the given ticker
    pub fn from_orderbook_state(ticker: String, state: OrderbookState) -> Self {
        Self {
            ticker,
            timestamp: state.timestamp,
            last_price: state.last_price,
            bids: state.bids,
            asks: state.asks,
        }
    }
}

