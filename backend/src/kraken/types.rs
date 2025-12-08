use serde::{Deserialize, Serialize};

/// Subscription request to Kraken WebSocket API
#[derive(Debug, Serialize)]
pub struct SubscriptionRequest {
    pub event: String,
    pub pair: Vec<String>,
    pub subscription: SubscriptionDetails,
}

#[derive(Debug, Serialize)]
pub struct SubscriptionDetails {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth: Option<u32>,
}

/// Subscription status response from Kraken
#[derive(Debug, Deserialize)]
pub struct SubscriptionStatus {
    pub event: String,
    pub status: String,
    #[serde(rename = "channelID")]
    pub channel_id: Option<u64>,
    pub pair: Option<String>,
    pub subscription: Option<SubscriptionDetailsResponse>,
    pub errorMessage: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SubscriptionDetailsResponse {
    pub name: String,
    pub depth: Option<u32>,
}

/// Price level in the orderbook
#[derive(Debug, Clone, PartialEq)]
pub struct PriceLevel {
    pub price: f64,
    pub volume: f64,
    pub timestamp: Option<f64>,
}

/// Orderbook snapshot data structure
/// Kraken sends snapshots as: [channelID, {bids: [...], asks: [...]}, "book-25", "ZEC/USD"]
#[derive(Debug, Deserialize)]
pub struct BookSnapshot {
    pub bids: Vec<[String; 3]>, // [price, volume, timestamp]
    pub asks: Vec<[String; 3]>, // [price, volume, timestamp]
}

/// Orderbook delta/update data structure
/// Kraken sends deltas as: [channelID, {bids: [...], asks: [...]}, "book-25", "ZEC/USD"]
#[derive(Debug, Deserialize)]
pub struct BookDelta {
    pub bids: Vec<[String; 3]>, // [price, volume, timestamp] - volume "0" means remove
    pub asks: Vec<[String; 3]>, // [price, volume, timestamp] - volume "0" means remove
}

/// Complete book message (snapshot or delta) as received from Kraken
/// Format: [channelID, {bids: [...], asks: [...]}, "book-25", "ZEC/USD"]
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum BookMessage {
    /// Array format: [channelID, data, channelName, pair]
    ArrayFormat(Vec<serde_json::Value>),
}

impl BookMessage {
    /// Extract channel ID from the message
    pub fn channel_id(&self) -> Option<u64> {
        match self {
            BookMessage::ArrayFormat(arr) => {
                if arr.len() > 0 {
                    arr[0].as_u64()
                } else {
                    None
                }
            }
        }
    }

    /// Extract the book data (snapshot or delta) from the message
    pub fn book_data(&self) -> Option<serde_json::Value> {
        match self {
            BookMessage::ArrayFormat(arr) => {
                if arr.len() > 1 {
                    Some(arr[1].clone())
                } else {
                    None
                }
            }
        }
    }

    /// Check if this is a snapshot (first message after subscription)
    pub fn is_snapshot(&self) -> bool {
        // Snapshots typically have more price levels than deltas
        // We'll determine this based on the data size when processing
        true // Will be determined by context in the client
    }
}

/// Helper function to parse price level from Kraken format [price, volume, timestamp]
pub fn parse_price_level(level: &[String; 3]) -> Result<PriceLevel, anyhow::Error> {
    let price = level[0].parse::<f64>()?;
    let volume = level[1].parse::<f64>()?;
    let timestamp = if !level[2].is_empty() {
        Some(level[2].parse::<f64>()?)
    } else {
        None
    };

    Ok(PriceLevel {
        price,
        volume,
        timestamp,
    })
}

/// Helper function to parse book snapshot from JSON value
pub fn parse_book_snapshot(value: &serde_json::Value) -> Result<BookSnapshot, anyhow::Error> {
    let snapshot: BookSnapshot = serde_json::from_value(value.clone())?;
    Ok(snapshot)
}

/// Helper function to parse book delta from JSON value
pub fn parse_book_delta(value: &serde_json::Value) -> Result<BookDelta, anyhow::Error> {
    let delta: BookDelta = serde_json::from_value(value.clone())?;
    Ok(delta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_price_level() {
        let level = ["42000.5".to_string(), "1.25".to_string(), "1234567890.123".to_string()];
        let price_level = parse_price_level(&level).unwrap();
        assert_eq!(price_level.price, 42000.5);
        assert_eq!(price_level.volume, 1.25);
        assert_eq!(price_level.timestamp, Some(1234567890.123));
    }

    #[test]
    fn test_parse_price_level_empty_timestamp() {
        let level = ["42000.5".to_string(), "1.25".to_string(), "".to_string()];
        let price_level = parse_price_level(&level).unwrap();
        assert_eq!(price_level.price, 42000.5);
        assert_eq!(price_level.volume, 1.25);
        assert_eq!(price_level.timestamp, None);
    }

    #[test]
    fn test_subscription_request_serialization() {
        let request = SubscriptionRequest {
            event: "subscribe".to_string(),
            pair: vec!["ZEC/USD".to_string()],
            subscription: SubscriptionDetails {
                name: "book".to_string(),
                depth: Some(25),
            },
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("subscribe"));
        assert!(json.contains("ZEC/USD"));
        assert!(json.contains("book"));
    }
}

