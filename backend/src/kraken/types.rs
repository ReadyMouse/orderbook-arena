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
#[allow(non_snake_case)] // errorMessage matches Kraken API format
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
/// Kraken sends snapshots as: [channelID, {b: [...], a: [...]}, "book-25", "ZEC/USD"]
/// Note: "b" = bids, "a" = asks. Either field may be missing in individual messages.
#[derive(Debug, Deserialize)]
pub struct BookSnapshot {
    #[serde(rename = "b", default)]
    pub bids: Vec<serde_json::Value>, // Can be [price, volume, timestamp] or [price, volume, timestamp, "r"]
    #[serde(rename = "a", default)]
    pub asks: Vec<serde_json::Value>, // Can be [price, volume, timestamp] or [price, volume, timestamp, "r"]
}

/// Orderbook delta/update data structure
/// Kraken sends deltas as: [channelID, {b: [...], a: [...]}, "book-25", "ZEC/USD"]
/// Note: "b" = bids, "a" = asks. Either field may be missing in individual messages.
#[derive(Debug, Deserialize)]
pub struct BookDelta {
    #[serde(rename = "b", default)]
    pub bids: Vec<serde_json::Value>, // Can be [price, volume, timestamp] or [price, volume, timestamp, "r"] - volume "0" means remove
    #[serde(rename = "a", default)]
    pub asks: Vec<serde_json::Value>, // Can be [price, volume, timestamp] or [price, volume, timestamp, "r"] - volume "0" means remove
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

/// Helper function to parse price level from Kraken format
/// Format: [price, volume, timestamp] or [price, volume, timestamp, "r"]
/// where price and volume are strings, timestamp is a string (can be empty), and "r" is optional
pub fn parse_price_level(level: &serde_json::Value) -> Result<PriceLevel, anyhow::Error> {
    let arr = level.as_array()
        .ok_or_else(|| anyhow::anyhow!("Price level must be an array"))?;
    
    if arr.len() < 3 {
        return Err(anyhow::anyhow!("Price level array must have at least 3 elements"));
    }

    let price = arr[0].as_str()
        .ok_or_else(|| anyhow::anyhow!("Price must be a string"))?
        .parse::<f64>()?;
    
    let volume = arr[1].as_str()
        .ok_or_else(|| anyhow::anyhow!("Volume must be a string"))?
        .parse::<f64>()?;
    
    let timestamp = if arr.len() > 2 {
        let ts_str = arr[2].as_str().unwrap_or("");
        if !ts_str.is_empty() {
            Some(ts_str.parse::<f64>()?)
        } else {
            None
        }
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
        let level = serde_json::json!(["42000.5", "1.25", "1234567890.123"]);
        let price_level = parse_price_level(&level).unwrap();
        assert_eq!(price_level.price, 42000.5);
        assert_eq!(price_level.volume, 1.25);
        assert_eq!(price_level.timestamp, Some(1234567890.123));
    }

    #[test]
    fn test_parse_price_level_empty_timestamp() {
        let level = serde_json::json!(["42000.5", "1.25", ""]);
        let price_level = parse_price_level(&level).unwrap();
        assert_eq!(price_level.price, 42000.5);
        assert_eq!(price_level.volume, 1.25);
        assert_eq!(price_level.timestamp, None);
    }

    #[test]
    fn test_parse_price_level_with_replace_flag() {
        let level = serde_json::json!(["42000.5", "1.25", "1234567890.123", "r"]);
        let price_level = parse_price_level(&level).unwrap();
        assert_eq!(price_level.price, 42000.5);
        assert_eq!(price_level.volume, 1.25);
        assert_eq!(price_level.timestamp, Some(1234567890.123));
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

