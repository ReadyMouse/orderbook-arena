use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::orderbook::snapshot::Snapshot;

/// In-memory storage for orderbook snapshots indexed by (ticker, timestamp)
/// 
/// This store maintains snapshots in memory for time-travel functionality.
/// Snapshots are indexed by (ticker, timestamp) tuple for fast retrieval.
pub struct SnapshotStore {
    /// Map from (ticker, timestamp) to snapshot
    snapshots: Arc<RwLock<HashMap<(String, i64), Snapshot>>>,
}

impl SnapshotStore {
    /// Create a new empty snapshot store
    pub fn new() -> Self {
        Self {
            snapshots: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Store a snapshot with (ticker, timestamp) as the key
    /// 
    /// If a snapshot with the same (ticker, timestamp) already exists, it will be replaced.
    pub async fn store_snapshot(&self, snapshot: Snapshot) {
        let key = (snapshot.ticker.clone(), snapshot.timestamp);
        let mut snapshots = self.snapshots.write().await;
        snapshots.insert(key, snapshot);
    }

    /// Retrieve a snapshot by ticker and timestamp
    /// 
    /// Returns `Some(Snapshot)` if found, `None` otherwise.
    pub async fn get_snapshot(&self, ticker: &str, timestamp: i64) -> Option<Snapshot> {
        let key = (ticker.to_string(), timestamp);
        let snapshots = self.snapshots.read().await;
        snapshots.get(&key).cloned()
    }

    /// Get the minimum and maximum timestamps available for a specific ticker
    /// 
    /// Returns `Some((min, max))` if there are any snapshots for this ticker, `None` if no snapshots exist.
    pub async fn get_history_range(&self, ticker: &str) -> Option<(i64, i64)> {
        let snapshots = self.snapshots.read().await;
        
        // Filter keys to only include the requested ticker
        let ticker_timestamps: Vec<i64> = snapshots
            .keys()
            .filter(|(t, _)| t.as_str() == ticker)
            .map(|(_, timestamp)| *timestamp)
            .collect();
        
        if ticker_timestamps.is_empty() {
            return None;
        }
        
        let min = ticker_timestamps.iter().min().copied()?;
        let max = ticker_timestamps.iter().max().copied()?;
        Some((min, max))
    }

    /// Remove snapshots older than the specified cutoff timestamp
    /// 
    /// This is used for cleanup to remove snapshots older than 1 hour.
    /// If ticker is provided, only removes snapshots for that ticker.
    pub async fn remove_older_than(&self, cutoff_timestamp: i64, ticker: Option<&str>) -> usize {
        let mut snapshots = self.snapshots.write().await;
        let initial_len = snapshots.len();
        
        snapshots.retain(|(t, timestamp), _| {
            // If a specific ticker is provided, only delete old snapshots for THAT ticker
            // Keep all snapshots from other tickers
            if let Some(filter_ticker) = ticker {
                if t.as_str() == filter_ticker {
                    // This is the ticker we're cleaning up - keep only if recent
                    *timestamp >= cutoff_timestamp
                } else {
                    // Different ticker - keep it
                    true
                }
            } else {
                // No ticker filter - clean up old snapshots from ALL tickers
                *timestamp >= cutoff_timestamp
            }
        });
        
        initial_len - snapshots.len()
    }

    /// Get the number of snapshots currently stored
    pub async fn len(&self) -> usize {
        let snapshots = self.snapshots.read().await;
        snapshots.len()
    }

    /// Check if the store is empty
    pub async fn is_empty(&self) -> bool {
        let snapshots = self.snapshots.read().await;
        snapshots.is_empty()
    }
}

impl Default for SnapshotStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_new_store() {
        let store = SnapshotStore::new();
        assert!(store.is_empty().await);
        assert_eq!(store.len().await, 0);
    }

    #[tokio::test]
    async fn test_store_and_get_snapshot() {
        let store = SnapshotStore::new();
        
        let snapshot = Snapshot::new(
            "BTC".to_string(),
            1234567890,
            Some(42000.0),
            vec![],
            vec![],
        );
        
        store.store_snapshot(snapshot.clone()).await;
        
        assert_eq!(store.len().await, 1);
        assert!(!store.is_empty().await);
        
        let retrieved = store.get_snapshot("BTC", 1234567890).await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().timestamp, 1234567890);
    }

    #[tokio::test]
    async fn test_get_nonexistent_snapshot() {
        let store = SnapshotStore::new();
        
        let retrieved = store.get_snapshot("BTC", 9999999999).await;
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_store_replaces_existing() {
        let store = SnapshotStore::new();
        
        let snapshot1 = Snapshot::new("BTC".to_string(), 1234567890, Some(42000.0), vec![], vec![]);
        let snapshot2 = Snapshot::new("BTC".to_string(), 1234567890, Some(43000.0), vec![], vec![]);
        
        store.store_snapshot(snapshot1).await;
        store.store_snapshot(snapshot2.clone()).await;
        
        assert_eq!(store.len().await, 1);
        
        let retrieved = store.get_snapshot("BTC", 1234567890).await;
        assert_eq!(retrieved.unwrap().last_price, Some(43000.0));
    }

    #[tokio::test]
    async fn test_get_history_range_empty() {
        let store = SnapshotStore::new();
        
        let range = store.get_history_range("BTC").await;
        assert!(range.is_none());
    }

    #[tokio::test]
    async fn test_get_history_range() {
        let store = SnapshotStore::new();
        
        store.store_snapshot(Snapshot::new("BTC".to_string(), 1000, None, vec![], vec![])).await;
        store.store_snapshot(Snapshot::new("BTC".to_string(), 2000, None, vec![], vec![])).await;
        store.store_snapshot(Snapshot::new("BTC".to_string(), 1500, None, vec![], vec![])).await;
        
        let range = store.get_history_range("BTC").await;
        assert!(range.is_some());
        let (min, max) = range.unwrap();
        assert_eq!(min, 1000);
        assert_eq!(max, 2000);
    }

    #[tokio::test]
    async fn test_remove_older_than() {
        let store = SnapshotStore::new();
        
        store.store_snapshot(Snapshot::new("BTC".to_string(), 1000, None, vec![], vec![])).await;
        store.store_snapshot(Snapshot::new("BTC".to_string(), 2000, None, vec![], vec![])).await;
        store.store_snapshot(Snapshot::new("BTC".to_string(), 3000, None, vec![], vec![])).await;
        
        let removed = store.remove_older_than(2500, Some("BTC")).await;
        assert_eq!(removed, 2);
        assert_eq!(store.len().await, 1);
        
        assert!(store.get_snapshot("BTC", 1000).await.is_none());
        assert!(store.get_snapshot("BTC", 2000).await.is_none());
        assert!(store.get_snapshot("BTC", 3000).await.is_some());
    }
}

