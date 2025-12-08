# Task List: Orderbook Visualizer

Based on PRD: `prd-orderbook-visualizer.md`

## Relevant Files

### Backend Files
- `backend/Cargo.toml` - Rust project configuration with dependencies (tokio, tokio-tungstenite, axum, serde)
- `backend/src/main.rs` - Application entry point, server initialization
- `backend/src/kraken/client.rs` - WebSocket client for connecting to Kraken API
- `backend/src/kraken/types.rs` - Data structures for Kraken WebSocket messages (snapshot, delta, subscription)
- `backend/src/kraken/client.rs` - WebSocket client for connecting to Kraken API
- `backend/src/kraken/mod.rs` - Kraken module organization
- `backend/src/orderbook/engine.rs` - Orderbook state management using BTreeMap, handles snapshot-delta pattern
- `backend/src/orderbook/snapshot.rs` - Snapshot data structure and storage logic
- `backend/src/orderbook/store.rs` - In-memory snapshot storage with timestamp indexing and cleanup
- `backend/src/api/routes.rs` - REST API route handlers (GET /snapshot/{timestamp}, GET /history)
- `backend/src/api/websocket.rs` - WebSocket server endpoint handler for live orderbook streaming
- `backend/src/api/mod.rs` - API module organization and route registration
- `backend/src/config.rs` - Configuration management (snapshot interval, port, trading pair)

### Frontend Files
- `frontend/package.json` - Node.js project configuration with dependencies (React, Vite, framer-motion, TailwindCSS)
- `frontend/vite.config.js` - Vite build configuration
- `frontend/tailwind.config.js` - TailwindCSS configuration with 8-bit retro theme
- `frontend/index.html` - HTML entry point
- `frontend/src/main.jsx` - React application entry point
- `frontend/src/App.jsx` - Main application component, orchestrates orderbook view and controls
- `frontend/src/components/OrderbookView.jsx` - Main visualization component displaying the battle arena
- `frontend/src/components/PriceColumn.jsx` - Component for rendering a single price level with volume icons
- `frontend/src/components/Centerline.jsx` - Component for the dynamic centerline representing last traded price
- `frontend/src/components/TimeSlider.jsx` - Interactive slider for selecting historical timestamps
- `frontend/src/components/Controls.jsx` - Play/pause/speed control buttons for time-travel
- `frontend/src/components/ErrorMessage.jsx` - Component for displaying error messages to users
- `frontend/src/hooks/useWebSocket.js` - Custom hook for managing WebSocket connection to backend
- `frontend/src/hooks/useTimeTravel.js` - Custom hook for managing time-travel state and playback logic
- `frontend/src/utils/api.js` - API client functions for REST endpoints (fetch snapshot, fetch history)
- `frontend/src/utils/format.js` - Utility functions for formatting prices, timestamps, etc.

### Notes
- Backend uses Rust with tokio for async runtime
- Frontend uses React with Vite for build tooling
- All components should be functional components using React hooks
- Error handling should be implemented at both backend and frontend levels
- WebSocket reconnection logic should use exponential backoff

## Tasks

- [ ] 1.0 Backend: Kraken WebSocket Client and Orderbook Engine
  - [x] 1.1 Initialize Rust project with `cargo new backend` and configure `Cargo.toml` with dependencies: tokio, tokio-tungstenite, axum, serde, serde_json, anyhow
  - [x] 1.2 Create `backend/src/kraken/types.rs` with data structures for Kraken WebSocket messages (subscription request, snapshot message, delta message)
  - [x] 1.3 Create `backend/src/kraken/client.rs` with WebSocket client that connects to `wss://ws.kraken.com/`
  - [ ] 1.4 Implement subscription logic in `client.rs` to subscribe to `book` channel for ZEC/USD pair
  - [ ] 1.5 Create `backend/src/orderbook/engine.rs` with `OrderbookEngine` struct using BTreeMap for bids (descending) and asks (ascending)
  - [ ] 1.6 Implement `apply_snapshot()` method in `OrderbookEngine` to process initial snapshot messages and populate full orderbook state
  - [ ] 1.7 Implement `apply_delta()` method in `OrderbookEngine` to process delta messages, update volumes, and remove price levels when volume reaches zero
  - [ ] 1.8 Add `last_price` field to `OrderbookEngine` and update it when trades are detected in delta messages
  - [ ] 1.9 Implement `get_current_state()` method that returns orderbook data in the required JSON format with sorted bids/asks
  - [ ] 1.10 Add error handling for malformed messages and connection failures in `client.rs`

- [ ] 2.0 Backend: Snapshot Storage System
  - [ ] 2.1 Create `backend/src/orderbook/snapshot.rs` with `Snapshot` struct containing timestamp, lastPrice, bids, and asks
  - [ ] 2.2 Create `backend/src/orderbook/store.rs` with `SnapshotStore` struct using HashMap or Vec for in-memory storage indexed by timestamp
  - [ ] 2.3 Implement `store_snapshot()` method to save snapshots with timestamp as key
  - [ ] 2.4 Implement `get_snapshot(timestamp)` method to retrieve snapshot by timestamp, returning Option<Snapshot>
  - [ ] 2.5 Implement `get_history_range()` method that returns min and max timestamps available
  - [ ] 2.6 Implement cleanup logic to remove snapshots older than 1 hour (run periodically or on each store)
  - [ ] 2.7 Create `backend/src/config.rs` for configuration management with configurable snapshot interval (default: 5 seconds)
  - [ ] 2.8 Integrate snapshot storage with orderbook engine to automatically store snapshots at configured intervals

- [ ] 3.0 Backend: API Server (REST + WebSocket Endpoints)
  - [ ] 3.1 Set up Axum server in `backend/src/main.rs` listening on port 8080
  - [ ] 3.2 Create `backend/src/api/mod.rs` to organize API modules
  - [ ] 3.3 Create `backend/src/api/routes.rs` with REST route handlers
  - [ ] 3.4 Implement `GET /snapshot/{timestamp}` endpoint that retrieves snapshot by timestamp, returns 404 if not found, validates timestamp format
  - [ ] 3.5 Implement `GET /history` endpoint that returns JSON with `minTimestamp` and `maxTimestamp` fields
  - [ ] 3.6 Create `backend/src/api/websocket.rs` with WebSocket handler for `WS /live` endpoint
  - [ ] 3.7 Implement WebSocket server that accepts connections and streams real-time orderbook updates from the engine
  - [ ] 3.8 Add CORS middleware to allow frontend connections (if needed for development)
  - [ ] 3.9 Add error handling middleware for API routes to return appropriate HTTP status codes and error messages
  - [ ] 3.10 Integrate all routes and WebSocket handler in main.rs

- [ ] 4.0 Frontend: Project Setup and Core Structure
  - [ ] 4.1 Initialize React project with Vite: `npm create vite@latest frontend -- --template react`
  - [ ] 4.2 Install dependencies: `npm install framer-motion tailwindcss postcss autoprefixer`
  - [ ] 4.3 Initialize TailwindCSS: `npx tailwindcss init -p`
  - [ ] 4.4 Configure `tailwind.config.js` with 8-bit retro arcade theme colors and fonts
  - [ ] 4.5 Set up TailwindCSS in `frontend/src/index.css` with base styles
  - [ ] 4.6 Create `frontend/src/utils/api.js` with functions: `fetchSnapshot(timestamp)`, `fetchHistory()`
  - [ ] 4.7 Create `frontend/src/hooks/useWebSocket.js` custom hook for managing WebSocket connection to `ws://localhost:8080/live`
  - [ ] 4.8 Implement WebSocket hook with connection management, message parsing, and error state handling
  - [ ] 4.9 Create `frontend/src/utils/format.js` with utility functions for formatting prices and timestamps
  - [ ] 4.10 Set up basic `App.jsx` structure with layout for visualization area and controls section

- [ ] 5.0 Frontend: Orderbook Visualization Components
  - [ ] 5.1 Create `frontend/src/components/OrderbookView.jsx` as main container component
  - [ ] 5.2 Implement layout with sellers (asks) on left side (red) and buyers (bids) on right side (blue)
  - [ ] 5.3 Create `frontend/src/components/PriceColumn.jsx` component that takes price and volume props
  - [ ] 5.4 Implement icon rendering in `PriceColumn.jsx` using emoji 👤, mapping volume to number of icons (start with simple linear mapping)
  - [ ] 5.5 Create `frontend/src/components/Centerline.jsx` component that displays a vertical line representing last traded price
  - [ ] 5.6 Implement horizontal positioning logic in `OrderbookView.jsx` to position price columns based on distance from lastPrice
  - [ ] 5.7 Add framer-motion animation to `Centerline.jsx` for smooth movement when lastPrice updates
  - [ ] 5.8 Implement trade execution animation in `PriceColumn.jsx` - animate icon pairs "walking off" when volume decreases (use framer-motion exit animations)
  - [ ] 5.9 Style components with TailwindCSS using 8-bit retro arcade aesthetic (pixelated fonts, retro colors)
  - [ ] 5.10 Optimize rendering performance by memoizing components and limiting number of price levels displayed if needed

- [ ] 6.0 Frontend: Time-Travel Controls and Integration
  - [ ] 6.1 Create `frontend/src/components/TimeSlider.jsx` component with range input for timestamp selection
  - [ ] 6.2 Implement slider that displays current timestamp and allows scrubbing through available time range
  - [ ] 6.3 Create `frontend/src/components/Controls.jsx` with play, pause, and speed control buttons (0.5x, 1x, 2x, 10x)
  - [ ] 6.4 Create `frontend/src/hooks/useTimeTravel.js` custom hook for managing time-travel state
  - [ ] 6.5 Implement time-travel state management: `isTimeTravelMode`, `currentTimestamp`, `playbackSpeed`, `isPlaying`
  - [ ] 6.6 Implement `fetchHistoricalSnapshot(timestamp)` function that calls API and updates orderbook view
  - [ ] 6.7 Implement playback logic that steps through snapshots at selected speed when play is active
  - [ ] 6.8 Add logic to pause live WebSocket updates when time-travel mode is active
  - [ ] 6.9 Add logic to resume live updates when exiting time-travel mode (returning to live mode)
  - [ ] 6.10 Integrate time-travel controls with `OrderbookView` to display historical data when in time-travel mode
  - [ ] 6.11 Handle edge cases: beginning/end of history, missing snapshots, invalid timestamps

- [ ] 7.0 Error Handling, Reconnection Logic, and Polish
  - [ ] 7.1 Create `frontend/src/components/ErrorMessage.jsx` component for displaying user-friendly error messages
  - [ ] 7.2 Implement error state management in `useWebSocket.js` hook to track connection errors
  - [ ] 7.3 Display error messages in UI when WebSocket connection fails or API calls fail
  - [ ] 7.4 Implement automatic WebSocket reconnection logic in backend `kraken/client.rs` with exponential backoff
  - [ ] 7.5 Implement re-request snapshot logic after reconnection to ensure data consistency
  - [ ] 7.6 Add error handling in frontend API calls (`api.js`) to catch and display network errors
  - [ ] 7.7 Handle missing snapshot gracefully in frontend - show message instead of crashing
  - [ ] 7.8 Add loading states for initial data fetch and snapshot retrieval
  - [ ] 7.9 Test high-frequency update scenarios to ensure smooth performance (100+ updates/second)
  - [ ] 7.10 Test reconnection scenarios: disconnect backend from Kraken, verify reconnection and snapshot re-request
  - [ ] 7.11 Polish UI: ensure consistent styling, proper spacing, responsive layout for demo presentation
  - [ ] 7.12 Add basic error logging in backend for debugging (use tracing or log crate)
  - [ ] 7.13 Verify time-travel responsiveness: snapshot retrieval should respond within 1 second

