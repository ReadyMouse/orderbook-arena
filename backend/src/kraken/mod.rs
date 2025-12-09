pub mod types;
pub mod client;

// Re-export commonly used types
pub use types::{
    BookSnapshot, BookDelta, BookMessage, PriceLevel,
    SubscriptionRequest, SubscriptionStatus,
    parse_price_level, parse_book_snapshot, parse_book_delta,
};
pub use client::{
    KrakenClient, KrakenConnection, KrakenMessage,
    DEFAULT_TRADING_PAIR, DEFAULT_BOOK_DEPTH,
};

