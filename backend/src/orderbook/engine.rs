use std::collections::BTreeMap;
use std::cmp::Ordering;

/// Wrapper for f64 that implements Ord for use in BTreeMap
/// Prices in orderbooks are always valid numbers (no NaN), so this is safe
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
struct Price(f64);

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
}

