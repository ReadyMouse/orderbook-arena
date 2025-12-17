# Candle Display Feature

## Overview
Added a real-time candlestick visualization to the orderbook arena that shows the current OHLC (Open, High, Low, Close) data aligned with the price scale.

## What Was Implemented

### Backend Changes

1. **OHLC Data Types** (`backend/src/kraken/types.rs`)
   - Added `OhlcData` struct to represent candlestick data
   - Added `OhlcMessage` enum for parsing Kraken OHLC messages
   - Added `parse_ohlc_data()` helper function
   - Extended `SubscriptionDetails` to support `interval` parameter

2. **Kraken Client** (`backend/src/kraken/client.rs`)
   - Added `subscribe_ohlc()` method to subscribe to OHLC channel
   - Extended `KrakenMessage` enum to handle OHLC messages
   - Updated message parsing to handle OHLC data

3. **Main Server** (`backend/src/main.rs`)
   - Subscribe to 1-minute OHLC feed from Kraken for all tickers
   - Process and broadcast OHLC data through WebSocket

4. **WebSocket Handler** (`backend/src/api/websocket.rs`)
   - Added `WebSocketMessage` wrapper to distinguish message types
   - Stream both orderbook and OHLC data to clients
   - Messages are tagged with `type: "orderbook"` or `type: "ohlc"`

5. **Routes** (`backend/src/api/routes.rs`)
   - Extended `TickerData` to include OHLC broadcast channel

### Frontend Changes

1. **WebSocket Hook** (`frontend/src/hooks/useWebSocket.js`)
   - Updated to handle typed WebSocket messages
   - Added `ohlcData` state for OHLC updates
   - Returns both `orderbookState` and `ohlcData`

2. **Candle Aggregation Hook** (`frontend/src/hooks/useAggregatedCandle.js`)
   - NEW: Aggregates 1-minute candles into higher timeframes
   - Supports 1m, 5m, 15m, and 1hr timeframes
   - Maintains history and calculates aggregated OHLC values

3. **Candle Display Component** (`frontend/src/components/CandleDisplay.jsx`)
   - NEW: Renders a horizontal (sideways) candlestick
   - Shows candle body (open/close) and wicks (high/low)
   - Color-coded: green for bullish, red for bearish
   - Aligned with the vertical price scale
   - Displays price labels and current O/C values

4. **Orderbook View** (`frontend/src/components/OrderbookView.jsx`)
   - Added candle timeframe selector (1m, 5m, 15m, 1hr)
   - Integrated `CandleDisplay` at the top of the arena
   - Passes aggregated candle data and scale ranges

5. **App Component** (`frontend/src/App.jsx`)
   - Updated to pass `ohlcData` from WebSocket to OrderbookView

## How It Works

1. **Data Flow**:
   - Kraken sends 1-minute OHLC updates via WebSocket
   - Backend processes and broadcasts to all connected clients
   - Frontend receives updates and aggregates into selected timeframe
   - CandleDisplay renders the current candle horizontally

2. **Candle Positioning**:
   - Uses the same price scale as the orderbook visualization
   - Candle body spans between open and close prices
   - Wicks extend to high and low prices
   - All positions are calculated as percentages based on `scaleMin` and `scaleMax`

3. **Timeframe Selection**:
   - User can select 1m, 5m, 15m, or 1hr
   - Frontend aggregates 1-minute candles on-the-fly
   - Aggregation rules:
     - Open = first candle's open
     - High = maximum of all highs
     - Low = minimum of all lows
     - Close = last candle's close
     - Volume = sum of all volumes

4. **Visual Design**:
   - Positioned at the top of the arena, just below controls
   - Horizontal layout (sideways candle) matching the price scale
   - Traditional candlestick colors (green/red)
   - Shows price labels for high/low
   - Displays open/close values at the bottom

## Usage

1. Start the backend: `cd backend && cargo run`
2. Start the frontend: `cd frontend && npm run dev`
3. Open the app in a browser
4. Select a ticker (ZEC, BTC, ETH, XMR)
5. Use the "Candle" selector to choose a timeframe
6. Watch the candle update in real-time at the top of the arena

## Notes

- The backend subscribes to 1-minute OHLC from Kraken
- Higher timeframes (5m, 15m, 1hr) are calculated client-side
- The candle updates continuously as new data arrives
- The visualization aligns perfectly with the orderbook price scale
- The feature works alongside existing orderbook visualization

