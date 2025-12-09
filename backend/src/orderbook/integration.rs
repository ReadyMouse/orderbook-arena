use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration, MissedTickBehavior};
use crate::orderbook::engine::OrderbookEngine;
use crate::orderbook::snapshot::Snapshot;
use crate::orderbook::store::SnapshotStore;
use crate::config::Config;
use std::time::{SystemTime, UNIX_EPOCH};

/// Start a background task that periodically stores snapshots from the orderbook engine
/// 
/// This function spawns a tokio task that:
/// 1. Stores a snapshot of the current orderbook state at the configured interval
/// 2. Cleans up snapshots older than the retention period
/// 
/// Returns a handle that can be used to abort the task.
pub fn start_snapshot_storage_task(
    engine: Arc<RwLock<OrderbookEngine>>,
    store: Arc<SnapshotStore>,
    config: Config,
) -> tokio::task::JoinHandle<()> {
    let interval_secs = config.snapshot_interval_secs;
    let retention_secs = config.snapshot_retention_secs;

    tokio::spawn(async move {
        let mut interval_timer = interval(Duration::from_secs(interval_secs));
        interval_timer.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            interval_timer.tick().await;

            // Get current state from engine
            let state = {
                let engine_guard = engine.read().await;
                engine_guard.get_current_state()
            };

            // Convert to snapshot and store
            let snapshot = Snapshot::from_orderbook_state(state);
            store.store_snapshot(snapshot).await;

            // Clean up old snapshots
            let cutoff_timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64 - retention_secs;

            let removed_count = store.remove_older_than(cutoff_timestamp).await;
            if removed_count > 0 {
                eprintln!("Cleaned up {} old snapshots", removed_count);
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orderbook::engine::OrderbookEngine;
    use crate::kraken::types::BookSnapshot;

    #[tokio::test]
    async fn test_snapshot_storage_task_stores_snapshots() {
        let engine = Arc::new(RwLock::new(OrderbookEngine::new()));
        let store = Arc::new(SnapshotStore::new());
        let config = Config::new().with_snapshot_interval(1); // 1 second for faster test

        // Populate engine with some data
        {
            let mut engine_guard = engine.write().await;
            let snapshot = BookSnapshot {
                bids: vec![
                    ["41990.0".to_string(), "2.5".to_string(), "1234567890.0".to_string()],
                ],
                asks: vec![
                    ["42010.0".to_string(), "3.1".to_string(), "1234567890.0".to_string()],
                ],
            };
            engine_guard.apply_snapshot(&snapshot).unwrap();
            engine_guard.set_last_price(42000.0);
        }

        // Start the snapshot storage task
        let handle = start_snapshot_storage_task(engine.clone(), store.clone(), config);

        // Wait a bit for at least one snapshot to be stored
        tokio::time::sleep(tokio::time::Duration::from_millis(1100)).await;

        // Abort the task
        handle.abort();

        // Verify that at least one snapshot was stored
        assert!(!store.is_empty().await);
        assert!(store.len().await >= 1);

        // Verify we can retrieve a snapshot
        let range = store.get_history_range().await;
        assert!(range.is_some());
        if let Some((min, _max)) = range {
            let snapshot = store.get_snapshot(min).await;
            assert!(snapshot.is_some());
            let snapshot = snapshot.unwrap();
            assert_eq!(snapshot.last_price, Some(42000.0));
            assert_eq!(snapshot.bids.len(), 1);
            assert_eq!(snapshot.asks.len(), 1);
        }
    }
}

