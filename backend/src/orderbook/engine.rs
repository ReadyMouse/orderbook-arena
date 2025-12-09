use std::collections::BTreeMap;
use std::cmp::Ordering;
use crate::kraken::types::{BookSnapshot, BookDelta, parse_price_level};
use anyhow::Result;

/// Wrapper for f64 that implements Ord for use in BTreeMap
/// Prices in orderbooks are always valid numbers (no NaN), so this is safe
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub(crate) struct Price(f64);

impl Eq for Price {}

impl Ord for Price {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.partial_cmp(&other.0).unwrap_or(Ordering::Equal)
    }
}

/// Orderbook engine that maintains the current state of bids and asks
/// 
/// Bids are stored in a BTreeMap and iterated in reverse to get descending order (highest price first)
/// Asks are stored in a BTreeMap and iterated forward to get ascending order (lowest price first)
pub struct OrderbookEngine {
    /// Bids (buy orders) - key: price, value: volume
    /// Iterated in reverse to get descending order (highest price first)
    bids: BTreeMap<Price, f64>,
    
    /// Asks (sell orders) - key: price, value: volume
    /// Iterated forward to get ascending order (lowest price first)
    asks: BTreeMap<Price, f64>,
    
    /// Last traded price
    last_price: Option<f64>,
}

impl OrderbookEngine {
    /// Create a new empty orderbook engine
    pub fn new() -> Self {
        Self {
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            last_price: None,
        }
    }

    /// Get the current last traded price
    pub fn last_price(&self) -> Option<f64> {
        self.last_price
    }

    /// Set the last traded price
    pub fn set_last_price(&mut self, price: f64) {
        self.last_price = Some(price);
    }

    /// Get a mutable reference to the bids map (for internal use)
    pub fn bids_mut(&mut self) -> &mut BTreeMap<Price, f64> {
        &mut self.bids
    }

    /// Get a mutable reference to the asks map (for internal use)
    pub fn asks_mut(&mut self) -> &mut BTreeMap<Price, f64> {
        &mut self.asks
    }

    /// Apply a snapshot to the orderbook, replacing all existing state
    /// 
    /// This method clears the current bids and asks, then populates them
    /// with the data from the snapshot. This is used for the initial snapshot
    /// message from Kraken.
    pub fn apply_snapshot(&mut self, snapshot: &BookSnapshot) -> Result<()> {
        // Clear existing state
        self.bids.clear();
        self.asks.clear();

        // Process bids
        for bid_level in &snapshot.bids {
            let price_level = parse_price_level(bid_level)?;
            // Only insert if volume is greater than zero
            if price_level.volume > 0.0 {
                self.bids.insert(Price(price_level.price), price_level.volume);
            }
        }

        // Process asks
        for ask_level in &snapshot.asks {
            let price_level = parse_price_level(ask_level)?;
            // Only insert if volume is greater than zero
            if price_level.volume > 0.0 {
                self.asks.insert(Price(price_level.price), price_level.volume);
            }
        }

        Ok(())
    }

    /// Get the best bid price (highest bid)
    fn best_bid(&self) -> Option<f64> {
        self.bids.iter().rev().next().map(|(p, _)| p.0)
    }

    /// Get the best ask price (lowest ask)
    fn best_ask(&self) -> Option<f64> {
        self.asks.iter().next().map(|(p, _)| p.0)
    }

    /// Apply a delta update to the orderbook
    /// 
    /// This method processes incremental updates from Kraken. For each price level:
    /// - If volume is 0, the price level is removed
    /// - If volume > 0, the price level is updated (or inserted if it doesn't exist)
    /// 
    /// Trades are detected when:
    /// 1. Volume decreases at the best bid or best ask price (indicates a trade executed)
    /// 2. The best bid or best ask price changes (indicates the top level was consumed)
    pub fn apply_delta(&mut self, delta: &BookDelta) -> Result<()> {
        // Get current best bid and ask before processing delta
        let best_bid_before = self.best_bid();
        let best_ask_before = self.best_ask();

        // Process bid updates
        for bid_level in &delta.bids {
            let price_level = parse_price_level(bid_level)?;
            let price = Price(price_level.price);

            // Check if this is a trade at the best bid (volume decrease indicates trade)
            if let Some(best_bid) = best_bid_before {
                if price_level.price == best_bid {
                    let old_volume = self.bids.get(&price).copied().unwrap_or(0.0);
                    // If volume decreased (but not to zero), it's likely a trade
                    if price_level.volume < old_volume && price_level.volume > 0.0 {
                        self.last_price = Some(price_level.price);
                    }
                }
            }

            if price_level.volume == 0.0 {
                // Remove the price level if volume is zero
                self.bids.remove(&price);
            } else {
                // Update or insert the price level
                self.bids.insert(price, price_level.volume);
            }
        }

        // Process ask updates
        for ask_level in &delta.asks {
            let price_level = parse_price_level(ask_level)?;
            let price = Price(price_level.price);

            // Check if this is a trade at the best ask (volume decrease indicates trade)
            if let Some(best_ask) = best_ask_before {
                if price_level.price == best_ask {
                    let old_volume = self.asks.get(&price).copied().unwrap_or(0.0);
                    // If volume decreased (but not to zero), it's likely a trade
                    if price_level.volume < old_volume && price_level.volume > 0.0 {
                        self.last_price = Some(price_level.price);
                    }
                }
            }

            if price_level.volume == 0.0 {
                // Remove the price level if volume is zero
                self.asks.remove(&price);
            } else {
                // Update or insert the price level
                self.asks.insert(price, price_level.volume);
            }
        }

        // Also update last_price if best bid or ask changed (indicates a trade consumed the level)
        let best_bid_after = self.best_bid();
        let best_ask_after = self.best_ask();

        // If best bid changed, update last_price to the new best bid
        if best_bid_before != best_bid_after {
            if let Some(new_best_bid) = best_bid_after {
                self.last_price = Some(new_best_bid);
            }
        }

        // If best ask changed, update last_price to the new best ask
        if best_ask_before != best_ask_after {
            if let Some(new_best_ask) = best_ask_after {
                self.last_price = Some(new_best_ask);
            }
        }

        Ok(())
    }
}

impl Default for OrderbookEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_orderbook() {
        let engine = OrderbookEngine::new();
        assert_eq!(engine.last_price(), None);
        // Verify bids and asks are empty by checking length through mut access
        let mut engine = engine;
        assert_eq!(engine.bids_mut().len(), 0);
        assert_eq!(engine.asks_mut().len(), 0);
    }

    #[test]
    fn test_set_last_price() {
        let mut engine = OrderbookEngine::new();
        engine.set_last_price(42000.0);
        assert_eq!(engine.last_price(), Some(42000.0));
    }

    #[test]
    fn test_bids_ordering() {
        let mut engine = OrderbookEngine::new();
        // Add bids in random order
        engine.bids_mut().insert(Price(41980.0), 1.2);
        engine.bids_mut().insert(Price(41990.0), 2.5);
        engine.bids_mut().insert(Price(41970.0), 0.8);
        
        // When iterating in reverse, should get descending order
        let prices: Vec<f64> = engine.bids_mut().iter().rev().map(|(p, _)| p.0).collect();
        assert_eq!(prices, vec![41990.0, 41980.0, 41970.0]);
    }

    #[test]
    fn test_asks_ordering() {
        let mut engine = OrderbookEngine::new();
        // Add asks in random order
        engine.asks_mut().insert(Price(42020.0), 0.8);
        engine.asks_mut().insert(Price(42010.0), 3.1);
        engine.asks_mut().insert(Price(42030.0), 1.5);
        
        // When iterating forward, should get ascending order
        let prices: Vec<f64> = engine.asks_mut().iter().map(|(p, _)| p.0).collect();
        assert_eq!(prices, vec![42010.0, 42020.0, 42030.0]);
    }

    #[test]
    fn test_apply_snapshot() {
        use crate::kraken::types::BookSnapshot;
        
        let mut engine = OrderbookEngine::new();
        
        // Create a snapshot with some bids and asks
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
                ["41980.0".to_string(), "1.2".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
                ["42020.0".to_string(), "0.8".to_string(), "1234567890.0".to_string()],
            ],
        };
        
        // Apply the snapshot
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Verify bids were populated (in descending order when iterated in reverse)
        assert_eq!(engine.bids_mut().len(), 2);
        let bid_prices: Vec<f64> = engine.bids_mut().iter().rev().map(|(p, _)| p.0).collect();
        assert_eq!(bid_prices, vec![41990.0, 41980.0]);
        assert_eq!(engine.bids_mut().get(&Price(41990.0)), Some(&2.5));
        assert_eq!(engine.bids_mut().get(&Price(41980.0)), Some(&1.2));
        
        // Verify asks were populated (in ascending order)
        assert_eq!(engine.asks_mut().len(), 2);
        let ask_prices: Vec<f64> = engine.asks_mut().iter().map(|(p, _)| p.0).collect();
        assert_eq!(ask_prices, vec![42010.0, 42020.0]);
        assert_eq!(engine.asks_mut().get(&Price(42010.0)), Some(&3.1));
        assert_eq!(engine.asks_mut().get(&Price(42020.0)), Some(&0.8));
    }

    #[test]
    fn test_apply_snapshot_clears_existing() {
        use crate::kraken::types::BookSnapshot;
        
        let mut engine = OrderbookEngine::new();
        
        // Add some initial data
        engine.bids_mut().insert(Price(50000.0), 10.0);
        engine.asks_mut().insert(Price(30000.0), 5.0);
        
        // Create a new snapshot
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
            ],
        };
        
        // Apply the snapshot - should clear old data
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Verify old data is gone
        assert_eq!(engine.bids_mut().get(&Price(50000.0)), None);
        assert_eq!(engine.asks_mut().get(&Price(30000.0)), None);
        
        // Verify new data is present
        assert_eq!(engine.bids_mut().get(&Price(41990.0)), Some(&2.5));
        assert_eq!(engine.asks_mut().get(&Price(42010.0)), Some(&3.1));
    }

    #[test]
    fn test_apply_snapshot_filters_zero_volume() {
        use crate::kraken::types::BookSnapshot;
        
        let mut engine = OrderbookEngine::new();
        
        // Create a snapshot with zero volume entries
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
                ["41980.0".to_string(), "0.0".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
                ["42020.0".to_string(), "0.0".to_string(), "1234567890.0".to_string()],
            ],
        };
        
        // Apply the snapshot
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Verify zero volume entries were filtered out
        assert_eq!(engine.bids_mut().len(), 1);
        assert_eq!(engine.bids_mut().get(&Price(41990.0)), Some(&2.5));
        assert_eq!(engine.bids_mut().get(&Price(41980.0)), None);
        
        assert_eq!(engine.asks_mut().len(), 1);
        assert_eq!(engine.asks_mut().get(&Price(42010.0)), Some(&3.1));
        assert_eq!(engine.asks_mut().get(&Price(42020.0)), None);
    }

    #[test]
    fn test_apply_delta_updates_existing() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // First, apply a snapshot to set initial state
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Apply a delta that updates existing price levels
        let delta = BookDelta {
            bids: vec![
                ["41990.0".to_string(), "5.0".to_string(), "1234567891.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "1.5".to_string(), "1234567891.0".to_string()],
            ],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify volumes were updated
        assert_eq!(engine.bids_mut().get(&Price(41990.0)), Some(&5.0));
        assert_eq!(engine.asks_mut().get(&Price(42010.0)), Some(&1.5));
    }

    #[test]
    fn test_apply_delta_inserts_new() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // Set initial state
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Apply a delta that adds new price levels
        let delta = BookDelta {
            bids: vec![
                ["41980.0".to_string(), "1.2".to_string(), "1234567891.0".to_string()],
            ],
            asks: vec![
                ["42020.0".to_string(), "0.8".to_string(), "1234567891.0".to_string()],
            ],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify new levels were added
        assert_eq!(engine.bids_mut().len(), 2);
        assert_eq!(engine.bids_mut().get(&Price(41980.0)), Some(&1.2));
        assert_eq!(engine.bids_mut().get(&Price(41990.0)), Some(&2.5));
        
        assert_eq!(engine.asks_mut().len(), 2);
        assert_eq!(engine.asks_mut().get(&Price(42010.0)), Some(&3.1));
        assert_eq!(engine.asks_mut().get(&Price(42020.0)), Some(&0.8));
    }

    #[test]
    fn test_apply_delta_removes_zero_volume() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // Set initial state with multiple levels
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
                ["41980.0".to_string(), "1.2".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
                ["42020.0".to_string(), "0.8".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Apply a delta that removes a price level (volume = 0)
        let delta = BookDelta {
            bids: vec![
                ["41980.0".to_string(), "0.0".to_string(), "1234567891.0".to_string()],
            ],
            asks: vec![
                ["42020.0".to_string(), "0.0".to_string(), "1234567891.0".to_string()],
            ],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify removed levels are gone
        assert_eq!(engine.bids_mut().len(), 1);
        assert_eq!(engine.bids_mut().get(&Price(41980.0)), None);
        assert_eq!(engine.bids_mut().get(&Price(41990.0)), Some(&2.5));
        
        assert_eq!(engine.asks_mut().len(), 1);
        assert_eq!(engine.asks_mut().get(&Price(42020.0)), None);
        assert_eq!(engine.asks_mut().get(&Price(42010.0)), Some(&3.1));
    }

    #[test]
    fn test_apply_delta_mixed_operations() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // Set initial state
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
                ["41980.0".to_string(), "1.2".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Apply a delta with mixed operations: update, insert, remove
        let delta = BookDelta {
            bids: vec![
                ["41990.0".to_string(), "5.0".to_string(), "1234567891.0".to_string()], // update
                ["41980.0".to_string(), "0.0".to_string(), "1234567891.0".to_string()], // remove
                ["41970.0".to_string(), "0.5".to_string(), "1234567891.0".to_string()], // insert
            ],
            asks: vec![
                ["42010.0".to_string(), "1.5".to_string(), "1234567891.0".to_string()], // update
                ["42020.0".to_string(), "2.0".to_string(), "1234567891.0".to_string()], // insert
            ],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify all operations worked
        assert_eq!(engine.bids_mut().len(), 2);
        assert_eq!(engine.bids_mut().get(&Price(41990.0)), Some(&5.0)); // updated
        assert_eq!(engine.bids_mut().get(&Price(41980.0)), None); // removed
        assert_eq!(engine.bids_mut().get(&Price(41970.0)), Some(&0.5)); // inserted
        
        assert_eq!(engine.asks_mut().len(), 2);
        assert_eq!(engine.asks_mut().get(&Price(42010.0)), Some(&1.5)); // updated
        assert_eq!(engine.asks_mut().get(&Price(42020.0)), Some(&2.0)); // inserted
    }

    #[test]
    fn test_apply_delta_updates_last_price_on_bid_trade() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // Set initial state with best bid at 41990
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
                ["41980.0".to_string(), "1.2".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Apply a delta that decreases volume at best bid (indicates a trade)
        let delta = BookDelta {
            bids: vec![
                ["41990.0".to_string(), "1.5".to_string(), "1234567891.0".to_string()], // volume decreased from 2.5 to 1.5
            ],
            asks: vec![],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify last_price was updated to the trade price
        assert_eq!(engine.last_price(), Some(41990.0));
    }

    #[test]
    fn test_apply_delta_updates_last_price_on_ask_trade() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // Set initial state with best ask at 42010
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
                ["42020.0".to_string(), "1.2".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Apply a delta that decreases volume at best ask (indicates a trade)
        let delta = BookDelta {
            bids: vec![],
            asks: vec![
                ["42010.0".to_string(), "2.0".to_string(), "1234567891.0".to_string()], // volume decreased from 3.1 to 2.0
            ],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify last_price was updated to the trade price
        assert_eq!(engine.last_price(), Some(42010.0));
    }

    #[test]
    fn test_apply_delta_updates_last_price_when_best_bid_consumed() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // Set initial state with best bid at 41990
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
                ["41980.0".to_string(), "1.2".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Apply a delta that removes the best bid (consumed by trade)
        let delta = BookDelta {
            bids: vec![
                ["41990.0".to_string(), "0.0".to_string(), "1234567891.0".to_string()], // remove best bid
            ],
            asks: vec![],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify last_price was updated to the new best bid (41980)
        assert_eq!(engine.last_price(), Some(41980.0));
    }

    #[test]
    fn test_apply_delta_updates_last_price_when_best_ask_consumed() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // Set initial state with best ask at 42010
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
                ["42020.0".to_string(), "1.2".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        
        // Apply a delta that removes the best ask (consumed by trade)
        let delta = BookDelta {
            bids: vec![],
            asks: vec![
                ["42010.0".to_string(), "0.0".to_string(), "1234567891.0".to_string()], // remove best ask
            ],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify last_price was updated to the new best ask (42020)
        assert_eq!(engine.last_price(), Some(42020.0));
    }

    #[test]
    fn test_apply_delta_does_not_update_last_price_for_non_trade_updates() {
        use crate::kraken::types::{BookSnapshot, BookDelta};
        
        let mut engine = OrderbookEngine::new();
        
        // Set initial state
        let snapshot = BookSnapshot {
            bids: vec![
                ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
            ],
            asks: vec![
                ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
            ],
        };
        engine.apply_snapshot(&snapshot).unwrap();
        engine.set_last_price(42000.0);
        
        // Apply a delta that adds a new price level (not at best bid/ask)
        let delta = BookDelta {
            bids: vec![
                ["41980.0".to_string(), "1.2".to_string(), "1234567891.0".to_string()], // new level, not best bid
            ],
            asks: vec![
                ["42020.0".to_string(), "0.8".to_string(), "1234567891.0".to_string()], // new level, not best ask
            ],
        };
        engine.apply_delta(&delta).unwrap();
        
        // Verify last_price was not changed (no trade detected)
        assert_eq!(engine.last_price(), Some(42000.0));
    }
}

