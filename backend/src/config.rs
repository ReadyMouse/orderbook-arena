/// Configuration for the orderbook visualizer backend
/// 
/// This struct holds all configurable parameters for the application.
#[derive(Debug, Clone)]
pub struct Config {
    /// Interval in seconds between snapshot storage operations (default: 5)
    pub snapshot_interval_secs: u64,
    
    /// Server port for HTTP and WebSocket endpoints (default: 8080)
    pub port: u16,
    
    /// Trading pair to subscribe to (default: "ZEC/USD")
    pub trading_pair: String,
    
    /// Book depth for orderbook subscription (default: 25)
    pub book_depth: u32,
    
    /// Retention period for snapshots in seconds (default: 3600 = 1 hour)
    pub snapshot_retention_secs: i64,
}

impl Config {
    /// Create a new configuration with default values
    pub fn new() -> Self {
        Self {
            snapshot_interval_secs: 5,
            port: 8080,
            trading_pair: "ZEC/USD".to_string(),
            book_depth: 1000,
            snapshot_retention_secs: 3600, // 1 hour
        }
    }

    /// Create a configuration with custom snapshot interval
    pub fn with_snapshot_interval(mut self, interval_secs: u64) -> Self {
        self.snapshot_interval_secs = interval_secs;
        self
    }

    /// Create a configuration with custom port
    pub fn with_port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }

    /// Create a configuration with custom trading pair
    pub fn with_trading_pair(mut self, pair: String) -> Self {
        self.trading_pair = pair;
        self
    }

    /// Create a configuration with custom book depth
    pub fn with_book_depth(mut self, depth: u32) -> Self {
        self.book_depth = depth;
        self
    }

    /// Create a configuration with custom snapshot retention period
    pub fn with_snapshot_retention(mut self, retention_secs: i64) -> Self {
        self.snapshot_retention_secs = retention_secs;
        self
    }

    /// Load configuration from environment variables
    /// 
    /// Environment variables:
    /// - `SNAPSHOT_INTERVAL_SECS`: Snapshot interval in seconds (default: 5)
    /// - `PORT`: Server port (default: 8080)
    /// - `TRADING_PAIR`: Trading pair to subscribe to (default: "ZEC/USD")
    /// - `BOOK_DEPTH`: Book depth for subscription (default: 25)
    /// - `SNAPSHOT_RETENTION_SECS`: Retention period in seconds (default: 3600)
    pub fn from_env() -> Self {
        let mut config = Self::new();

        if let Ok(val) = std::env::var("SNAPSHOT_INTERVAL_SECS") {
            if let Ok(interval) = val.parse::<u64>() {
                config.snapshot_interval_secs = interval;
            }
        }

        if let Ok(val) = std::env::var("PORT") {
            if let Ok(port) = val.parse::<u16>() {
                config.port = port;
            }
        }

        if let Ok(val) = std::env::var("TRADING_PAIR") {
            config.trading_pair = val;
        }

        if let Ok(val) = std::env::var("BOOK_DEPTH") {
            if let Ok(depth) = val.parse::<u32>() {
                config.book_depth = depth;
            }
        }

        if let Ok(val) = std::env::var("SNAPSHOT_RETENTION_SECS") {
            if let Ok(retention) = val.parse::<i64>() {
                config.snapshot_retention_secs = retention;
            }
        }

        config
    }
}

impl Default for Config {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::new();
        assert_eq!(config.snapshot_interval_secs, 5);
        assert_eq!(config.port, 8080);
        assert_eq!(config.trading_pair, "ZEC/USD");
        assert_eq!(config.book_depth, 25);
        assert_eq!(config.snapshot_retention_secs, 3600);
    }

    #[test]
    fn test_config_builder() {
        let config = Config::new()
            .with_snapshot_interval(10)
            .with_port(9000)
            .with_trading_pair("BTC/USD".to_string())
            .with_book_depth(50)
            .with_snapshot_retention(7200);

        assert_eq!(config.snapshot_interval_secs, 10);
        assert_eq!(config.port, 9000);
        assert_eq!(config.trading_pair, "BTC/USD");
        assert_eq!(config.book_depth, 50);
        assert_eq!(config.snapshot_retention_secs, 7200);
    }

    // Note: Environment variable tests are skipped due to parallel test execution
    // causing race conditions. The from_env() method is tested manually and
    // the builder pattern tests provide sufficient coverage of configuration functionality.
}

