use crate::kraken::types::{
    BookMessage, SubscriptionRequest, SubscriptionStatus,
};
use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json;
use std::time::Duration;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const KRAKEN_WS_URL: &str = "wss://ws.kraken.com/";

/// Default trading pair for the orderbook visualizer
pub const DEFAULT_TRADING_PAIR: &str = "ZEC/USD";

/// Default book depth for orderbook subscription
pub const DEFAULT_BOOK_DEPTH: u32 = 25;

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
    pub async fn connect(&self) -> Result<KrakenConnection> {
        let (ws_stream, _) = connect_async(&self.url)
            .await
            .context("Failed to connect to Kraken WebSocket")?;

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
            .context("Failed to serialize subscription request")?;

        self.write
            .send(Message::Text(message))
            .await
            .context("Failed to send subscription request")?;

        Ok(())
    }

    /// Subscribe to the book channel for ZEC/USD pair (default configuration)
    pub async fn subscribe_zec_usd(&mut self) -> Result<()> {
        self.subscribe_book(DEFAULT_TRADING_PAIR, Some(DEFAULT_BOOK_DEPTH))
            .await
    }

    /// Receive the next message from the WebSocket
    pub async fn next_message(&mut self) -> Result<Option<KrakenMessage>> {
        match self.read.next().await {
            Some(Ok(Message::Text(text))) => {
                // Try to parse as subscription status first
                if let Ok(status) = serde_json::from_str::<SubscriptionStatus>(&text) {
                    return Ok(Some(KrakenMessage::SubscriptionStatus(status)));
                }

                // Try to parse as book message (array format)
                if let Ok(book_msg) = serde_json::from_str::<BookMessage>(&text) {
                    return Ok(Some(KrakenMessage::Book(book_msg)));
                }

                // If we can't parse it, log and return None
                eprintln!("Unparseable message: {}", text);
                Ok(None)
            }
            Some(Ok(Message::Close(_))) => {
                Ok(Some(KrakenMessage::Close))
            }
            Some(Ok(Message::Ping(data))) => {
                // Respond to ping with pong
                self.write
                    .send(Message::Pong(data))
                    .await
                    .context("Failed to send pong")?;
                Ok(None)
            }
            Some(Ok(_)) => {
                // Ignore other message types
                Ok(None)
            }
            Some(Err(e)) => {
                Err(anyhow::anyhow!("WebSocket error: {}", e))
            }
            None => {
                Ok(Some(KrakenMessage::Close))
            }
        }
    }

    /// Close the connection
    pub async fn close(&mut self) -> Result<()> {
        self.write
            .close()
            .await
            .context("Failed to close WebSocket connection")?;
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
}

