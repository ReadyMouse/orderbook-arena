use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::orderbook::snapshot::Snapshot;

/// In-memory storage for orderbook snapshots indexed by timestamp
/// 
/// This store maintains snapshots in memory for time-travel functionality.
/// Snapshots are indexed by their timestamp for fast retrieval.
pub struct SnapshotStore {
    /// Map from timestamp (seconds) to snapshot
    snapshots: Arc<RwLock<HashMap<i64, Snapshot>>>,
}

impl SnapshotStore {
    /// Create a new empty snapshot store
    pub fn new() -> Self {
        Self {
            snapshots: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Store a snapshot with its timestamp as the key
    /// 
    /// If a snapshot with the same timestamp already exists, it will be replaced.
    pub async fn store_snapshot(&self, snapshot: Snapshot) {
        let mut snapshots = self.snapshots.write().await;
        snapshots.insert(snapshot.timestamp, snapshot);
    }

    /// Retrieve a snapshot by timestamp
    /// 
    /// Returns `Some(Snapshot)` if found, `None` otherwise.
    pub async fn get_snapshot(&self, timestamp: i64) -> Option<Snapshot> {
        let snapshots = self.snapshots.read().await;
        snapshots.get(&timestamp).cloned()
    }

    /// Get the minimum and maximum timestamps available in the store
    /// 
    /// Returns `Some((min, max))` if there are any snapshots, `None` if the store is empty.
    pub async fn get_history_range(&self) -> Option<(i64, i64)> {
        let snapshots = self.snapshots.read().await;
        if snapshots.is_empty() {
            return None;
        }
        
        let min = snapshots.keys().min().copied()?;
        let max = snapshots.keys().max().copied()?;
        Some((min, max))
    }

    /// Remove snapshots older than the specified cutoff timestamp
    /// 
    /// This is used for cleanup to remove snapshots older than 1 hour.
    pub async fn remove_older_than(&self, cutoff_timestamp: i64) -> usize {
        let mut snapshots = self.snapshots.write().await;
        let initial_len = snapshots.len();
        
        snapshots.retain(|&timestamp, _| timestamp >= cutoff_timestamp);
        
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
            1234567890,
            Some(42000.0),
            vec![],
            vec![],
        );
        
        store.store_snapshot(snapshot.clone()).await;
        
        assert_eq!(store.len().await, 1);
        assert!(!store.is_empty().await);
        
        let retrieved = store.get_snapshot(1234567890).await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().timestamp, 1234567890);
    }

    #[tokio::test]
    async fn test_get_nonexistent_snapshot() {
        let store = SnapshotStore::new();
        
        let retrieved = store.get_snapshot(9999999999).await;
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_store_replaces_existing() {
        let store = SnapshotStore::new();
        
        let snapshot1 = Snapshot::new(1234567890, Some(42000.0), vec![], vec![]);
        let snapshot2 = Snapshot::new(1234567890, Some(43000.0), vec![], vec![]);
        
        store.store_snapshot(snapshot1).await;
        store.store_snapshot(snapshot2.clone()).await;
        
        assert_eq!(store.len().await, 1);
        
        let retrieved = store.get_snapshot(1234567890).await;
        assert_eq!(retrieved.unwrap().last_price, Some(43000.0));
    }

    #[tokio::test]
    async fn test_get_history_range_empty() {
        let store = SnapshotStore::new();
        
        let range = store.get_history_range().await;
        assert!(range.is_none());
    }

    #[tokio::test]
    async fn test_get_history_range() {
        let store = SnapshotStore::new();
        
        store.store_snapshot(Snapshot::new(1000, None, vec![], vec![])).await;
        store.store_snapshot(Snapshot::new(2000, None, vec![], vec![])).await;
        store.store_snapshot(Snapshot::new(1500, None, vec![], vec![])).await;
        
        let range = store.get_history_range().await;
        assert!(range.is_some());
        let (min, max) = range.unwrap();
        assert_eq!(min, 1000);
        assert_eq!(max, 2000);
    }

    #[tokio::test]
    async fn test_remove_older_than() {
        let store = SnapshotStore::new();
        
        store.store_snapshot(Snapshot::new(1000, None, vec![], vec![])).await;
        store.store_snapshot(Snapshot::new(2000, None, vec![], vec![])).await;
        store.store_snapshot(Snapshot::new(3000, None, vec![], vec![])).await;
        
        let removed = store.remove_older_than(2500).await;
        assert_eq!(removed, 2);
        assert_eq!(store.len().await, 1);
        
        assert!(store.get_snapshot(1000).await.is_none());
        assert!(store.get_snapshot(2000).await.is_none());
        assert!(store.get_snapshot(3000).await.is_some());
    }
}

