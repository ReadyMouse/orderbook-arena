use crate::kraken::types::{
    BookMessage, SubscriptionRequest, SubscriptionStatus,
};
use anyhow::{Context, Result, bail};
use futures_util::{SinkExt, StreamExt};
use serde_json;
use std::time::Duration;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const KRAKEN_WS_URL: &str = "wss://ws.kraken.com/";

/// Default trading pair for the orderbook visualizer
#[allow(dead_code)] // Will be used when integrating client
pub const DEFAULT_TRADING_PAIR: &str = "ZEC/USD";

/// Default book depth for orderbook subscription
/// Kraken supports: 10, 25, 100, 500, 1000
/// Using maximum depth for full orderbook visibility
#[allow(dead_code)] // Will be used when integrating client
pub const DEFAULT_BOOK_DEPTH: u32 = 1000;

/// WebSocket client for connecting to Kraken API
pub struct KrakenClient {
    url: String,
}

impl KrakenClient {
    /// Create a new Kraken client
    pub fn new() -> Self {
        Self {
            url: KRAKEN_WS_URL.to_string(),
        }
    }

    /// Create a new Kraken client with custom URL (for testing)
    pub fn with_url(url: String) -> Self {
        Self { url }
    }

    /// Connect to Kraken WebSocket and return a handle to send/receive messages
    /// 
    /// # Errors
    /// 
    /// Returns an error if:
    /// - DNS resolution fails
    /// - TCP connection cannot be established
    /// - TLS handshake fails
    /// - WebSocket handshake fails
    pub async fn connect(&self) -> Result<KrakenConnection> {
        let (ws_stream, _) = connect_async(&self.url)
            .await
            .with_context(|| format!(
                "Failed to connect to Kraken WebSocket at {}: check network connection and URL",
                self.url
            ))?;

        let (write, read) = ws_stream.split();

        Ok(KrakenConnection {
            write,
            read,
            url: self.url.clone(),
        })
    }
}

/// Active WebSocket connection to Kraken
pub struct KrakenConnection {
    write: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    read: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
    url: String,
}

impl KrakenConnection {
    /// Subscribe to the book channel for a trading pair
    /// 
    /// # Errors
    /// 
    /// Returns an error if:
    /// - Subscription request cannot be serialized
    /// - Message cannot be sent over the WebSocket connection
    /// - Connection is closed or lost
    pub async fn subscribe_book(
        &mut self,
        pair: &str,
        depth: Option<u32>,
    ) -> Result<()> {
        let subscription = SubscriptionRequest {
            event: "subscribe".to_string(),
            pair: vec![pair.to_string()],
            subscription: crate::kraken::types::SubscriptionDetails {
                name: "book".to_string(),
                depth,
            },
        };

        let message = serde_json::to_string(&subscription)
            .context("Failed to serialize subscription request: invalid subscription data")?;

        self.write
            .send(Message::Text(message))
            .await
            .context("Failed to send subscription request: connection may be closed")?;

        Ok(())
    }

    /// Subscribe to the book channel for ZEC/USD pair (default configuration)
    pub async fn subscribe_zec_usd(&mut self) -> Result<()> {
        self.subscribe_book(DEFAULT_TRADING_PAIR, Some(DEFAULT_BOOK_DEPTH))
            .await
    }

    /// Receive the next message from the WebSocket
    /// 
    /// # Errors
    /// 
    /// Returns an error if:
    /// - WebSocket connection error occurs
    /// - Subscription status contains an error message from Kraken
    /// - Message is malformed and cannot be parsed (for critical messages)
    /// - Pong response cannot be sent
    pub async fn next_message(&mut self) -> Result<Option<KrakenMessage>> {
        match self.read.next().await {
            Some(Ok(Message::Text(text))) => {
                // Validate that the text is valid JSON first
                let json_value: serde_json::Value = serde_json::from_str(&text)
                    .with_context(|| format!(
                        "Received malformed JSON message from Kraken: {}",
                        if text.len() > 200 { format!("{}...", &text[..200]) } else { text.clone() }
                    ))?;

                // Try to parse as subscription status first
                if let Ok(status) = serde_json::from_value::<SubscriptionStatus>(json_value.clone()) {
                    // Check for subscription errors
                    if let Some(error_msg) = &status.errorMessage {
                        bail!(
                            "Kraken subscription error: {} (event: {}, status: {})",
                            error_msg,
                            status.event,
                            status.status
                        );
                    }
                    
                    // Check if subscription was rejected
                    if status.status == "error" {
                        bail!(
                            "Kraken subscription rejected: {} (event: {})",
                            status.errorMessage.as_deref().unwrap_or("Unknown error"),
                            status.event
                        );
                    }
                    
                    return Ok(Some(KrakenMessage::SubscriptionStatus(status)));
                }

                // Try to parse as book message (array format)
                if let Ok(book_msg) = serde_json::from_value::<BookMessage>(json_value) {
                    return Ok(Some(KrakenMessage::Book(book_msg)));
                }

                // If we can't parse it as a known message type, log and return None
                // This allows the system to continue processing other messages
                eprintln!(
                    "Warning: Received unparseable message from Kraken (not subscription or book): {}",
                    if text.len() > 200 { format!("{}...", &text[..200]) } else { text }
                );
                Ok(None)
            }
            Some(Ok(Message::Close(close_frame))) => {
                if let Some(frame) = close_frame {
                    eprintln!(
                        "WebSocket closed by server: code={:?}, reason={:?}",
                        frame.code,
                        frame.reason
                    );
                } else {
                    eprintln!("WebSocket closed by server (no close frame)");
                }
                Ok(Some(KrakenMessage::Close))
            }
            Some(Ok(Message::Ping(data))) => {
                // Respond to ping with pong to keep connection alive
                self.write
                    .send(Message::Pong(data))
                    .await
                    .context("Failed to send pong response: connection may be closed")?;
                Ok(None)
            }
            Some(Ok(_)) => {
                // Ignore other message types (Binary, Pong, etc.)
                Ok(None)
            }
            Some(Err(e)) => {
                Err(anyhow::anyhow!(
                    "WebSocket connection error: {}. Connection may be lost or network issue occurred",
                    e
                ))
            }
            None => {
                // Stream ended (connection closed)
                eprintln!("WebSocket stream ended (connection closed)");
                Ok(Some(KrakenMessage::Close))
            }
        }
    }

    /// Close the connection gracefully
    /// 
    /// # Errors
    /// 
    /// Returns an error if the close frame cannot be sent
    pub async fn close(&mut self) -> Result<()> {
        self.write
            .close()
            .await
            .context("Failed to send close frame: connection may already be closed")?;
        Ok(())
    }
}

/// Types of messages received from Kraken
#[derive(Debug)]
pub enum KrakenMessage {
    SubscriptionStatus(SubscriptionStatus),
    Book(BookMessage),
    Close,
}

/// Reconnect with exponential backoff
#[allow(dead_code)] // Will be used in task 7.4 for reconnection logic
pub async fn reconnect_with_backoff(
    client: &KrakenClient,
    max_retries: usize,
) -> Result<KrakenConnection> {
    let mut retry_count = 0;
    let mut delay = Duration::from_secs(1);

    loop {
        match client.connect().await {
            Ok(conn) => {
                return Ok(conn);
            }
            Err(e) => {
                if retry_count >= max_retries {
                    return Err(anyhow::anyhow!(
                        "Failed to reconnect after {} retries: {}",
                        max_retries,
                        e
                    ));
                }

                eprintln!(
                    "Connection failed (attempt {}/{}): {}. Retrying in {:?}...",
                    retry_count + 1,
                    max_retries,
                    e,
                    delay
                );

                sleep(delay).await;
                retry_count += 1;
                delay = delay * 2; // Exponential backoff
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kraken::types::SubscriptionStatus;

    #[tokio::test]
    #[ignore] // Requires network connection
    async fn test_connect() {
        let client = KrakenClient::new();
        let result = client.connect().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    #[ignore] // Requires network connection
    async fn test_subscribe() {
        let client = KrakenClient::new();
        let mut conn = client.connect().await.unwrap();
        let result = conn.subscribe_book("ZEC/USD", Some(25)).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_subscription_status_error_parsing() {
        // Test that subscription status with error message is properly detected
        let error_status_json = r#"{
            "event": "subscriptionStatus",
            "status": "error",
            "errorMessage": "Invalid trading pair"
        }"#;
        
        let status: SubscriptionStatus = serde_json::from_str(error_status_json).unwrap();
        assert_eq!(status.status, "error");
        assert_eq!(status.errorMessage, Some("Invalid trading pair".to_string()));
    }

    #[test]
    fn test_subscription_status_success_parsing() {
        // Test that successful subscription status parses correctly
        let success_status_json = r#"{
            "event": "subscriptionStatus",
            "status": "subscribed",
            "channelID": 123,
            "pair": "ZEC/USD"
        }"#;
        
        let status: SubscriptionStatus = serde_json::from_str(success_status_json).unwrap();
        assert_eq!(status.status, "subscribed");
        assert_eq!(status.errorMessage, None);
        assert_eq!(status.channel_id, Some(123));
    }
}

