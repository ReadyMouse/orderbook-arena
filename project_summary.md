# Orderbook Visualizer - Hackathon Project

## Project Overview
Build a real-time orderbook visualizer that connects to Kraken's WebSocket API with time-travel replay functionality. Visual metaphor: buyers and sellers as crowds of people on opposite sides of a boxing ring, meeting in the middle to trade.

## Technical Stack
- **Backend**: Rust (tokio, tokio-tungstenite, axum/warp)
- **Frontend**: React (framer-motion for animations)
- **Data Source**: Kraken WebSocket API (public book channel)

## Core Features (MVP - 2 weeks)

### Visual Design
- **Left side (red)**: Sellers in vertical price columns, lowest price closest to center (sprites)
- **Right side (blue)**: Buyers in vertical price columns, highest price closest to center (pac-man)
- **Center line**: Pinned to last traded price
- **Crowd size**: Number of human icons per price level = order volume at that price
- **Trade animation**: When trades execute, pairs walk off screen together
- **Aggressive crossing**: Market orders cross the centerline into opponent territory, causing centerline to shift
- **Theme**: 8-byte retro arcade aesthetic 

### Functionality
1. Real-time orderbook visualization for ZEC/USD
2. Time-travel slider to scrub through historical data
3. Play/pause/speed controls (0.5x, 1x, 2x, 10x)
4. Centerline moves with last price (left = price up, right = price down)
5. Re-usable technical components (data handling + databse, backend, frontend, etc.)

## Technical Implementation Details

### Rust Backend
**Kraken WebSocket Integration:**
- Connect to `wss://ws.kraken.com/`
- Subscribe to `book` channel for ZEC/USD pair
- Handle snapshot-delta pattern:
  - Initial snapshot = full orderbook state
  - Deltas = incremental updates (+/- volume at price levels)
- Maintain local orderbook state (BTreeMap for bids/asks)

**State Management:**
- Store snapshots every 5-10 seconds for time travel
- Keep last 1 hour in memory (can extend later)
- Track last traded price for centerline positioning

**API Endpoints:**
- `GET /snapshot/{timestamp}` - retrieve historical orderbook
- `WS /live` - stream real-time orderbook updates
- `GET /history` - available timestamp range

### React Frontend
**Data Structure Expected:**
```javascript
{
  timestamp: 1234567890,
  lastPrice: 42000,
  bids: [
    { price: 41990, volume: 2.5 },
    { price: 41980, volume: 1.2 },
    // ... descending
  ],
  asks: [
    { price: 42010, volume: 3.1 },
    { price: 42020, volume: 0.8 },
    // ... ascending
  ]
}
```

**Rendering:**
- Map volume to number of 👤 icons (or SVG sprites)
- Position price columns horizontally based on distance from lastPrice
- Animate centerline shifts when lastPrice updates
- Animate icon pairs "walking off" when volume decreases

**Time Travel:**
- Slider component below animated arena to select timestamp
- Fetch snapshot from backend
- Pause live updates during replay
- Play button steps through snapshots at selected speed

## Implementation Priority
1. **Days 1-7**: Rust backend - WS connection, orderbook state, snapshot storage, API
2. **Days 8-12**: React frontend - basic rendering, live updates, human icons
3. **Days 13-14**: Time travel UI, animations, polish

## Key Technical Considerations
- **Delta application**: Volume at price level can go to zero (remove from orderbook)
- **Reconnection**: Handle WS disconnects gracefully, re-request snapshot
- **Data volume**: BTC/USD can have hundreds of updates/sec during volatility
- **Testing**: Record live WS data to file for offline replay during development

## Deliverables
- Working demo showing live ZEC/USD orderbook
- Time-travel slider with 1-hour history
- Trade animations (pairs walking off)
- Centerline tracking last price
- Demo video showing key features

## Stretch Goals (if time permits)
- "Wall detector" - highlight unusually large orders
- Event bookmarks
- Multiple trading pairs
- Speed up/slow down playback