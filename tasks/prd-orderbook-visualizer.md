# Product Requirements Document: Orderbook Visualizer

## Introduction/Overview

The Orderbook Visualizer is a real-time cryptocurrency orderbook visualization tool with time-travel replay functionality, designed as an engaging demo for the Kraken Forge Hackathon (December 2025). Traditional orderbook displays present intimidating walls of numbers that are difficult to interpret. This visualizer transforms market data into an intuitive, gamified battle scene where buyers and sellers are represented as crowds of people on opposite sides of a boxing ring, meeting in the middle to trade.

The primary goal is to create an engaging, visually appealing demo that showcases real-time market dynamics and allows users to replay historical market events through an interactive time-travel interface. The tool serves both as an educational resource for understanding orderbook mechanics and as a compelling demonstration of real-time data visualization.

## Goals

1. **Real-time Visualization**: Display live orderbook data from Kraken's WebSocket API in an intuitive, visual format
2. **Time-Travel Functionality**: Enable users to scrub through historical orderbook snapshots to analyze past market events
3. **Engaging Demo**: Create a visually appealing, crash-free demo that runs smoothly during hackathon presentation
4. **Performance**: Handle high-frequency market updates (100+ updates/second) without lag or crashes
5. **Responsive Interaction**: Ensure time-travel controls respond within 1 second of user input
6. **Educational Value**: Make orderbook mechanics accessible to users unfamiliar with traditional orderbook displays

## User Stories

1. **As a hackathon judge**, I want to see a visually engaging demo of real-time market data so that I can understand the project's value proposition quickly.

2. **As a demo presenter**, I want the application to run smoothly without crashes so that I can confidently showcase the project during the presentation.

3. **As a user learning about orderbooks**, I want to see buyers and sellers represented visually as crowds so that I can intuitively understand market dynamics.

4. **As a user analyzing market events**, I want to scrub through historical orderbook data so that I can see how the market evolved during pumps, dumps, and sideways movement.

5. **As a user watching live data**, I want to see the centerline move dynamically with price changes so that I can track market sentiment in real-time.

6. **As a user replaying history**, I want to control playback speed and pause/resume so that I can analyze market events at my own pace.

7. **As a user experiencing connection issues**, I want to see clear error messages so that I understand what went wrong and what actions I can take.

## Functional Requirements

### Backend Requirements

1. The system must connect to Kraken's WebSocket API at `wss://ws.kraken.com/`
2. The system must subscribe to the `book` channel for the ZEC/USD trading pair
3. The system must handle the snapshot-delta pattern:
   - Process initial snapshot messages containing full orderbook state
   - Process delta messages containing incremental volume updates at price levels
   - Remove price levels when volume reaches zero
4. The system must maintain local orderbook state using BTreeMap for bids (descending) and asks (ascending)
5. The system must track the last traded price for centerline positioning
6. The system must store orderbook snapshots at configurable intervals (5-10 seconds, default: 5 seconds)
7. The system must retain snapshots for the last 1 hour in memory
8. The system must provide a REST API endpoint `GET /snapshot/{timestamp}` that returns historical orderbook state for a given timestamp
9. The system must provide a REST API endpoint `GET /history` that returns the available timestamp range (min/max timestamps)
10. The system must provide a WebSocket endpoint `WS /live` that streams real-time orderbook updates to connected clients
11. The system must handle WebSocket disconnections gracefully and automatically reconnect to Kraken's API
12. The system must re-request a snapshot from Kraken after reconnection to ensure data consistency
13. The system must display clear error messages when connection failures occur
14. The system must handle high-frequency updates (100+ updates/second) without performance degradation

### Frontend Requirements

15. The system must display the orderbook visualization in a main view area
16. The system must render sellers (asks) on the left side in red color
17. The system must render buyers (bids) on the right side in blue color
18. The system must display price levels as vertical columns, with:
    - Sellers: lowest price closest to center
    - Buyers: highest price closest to center
19. The system must represent order volume at each price level using human icons (start with simple emoji 👤, upgrade to SVG/pixel art later)
20. The system must display a centerline that represents the last traded price
21. The system must position price columns horizontally based on their distance from the last traded price
22. The system must animate the centerline when the last traded price updates
23. The system must animate icon pairs "walking off" when trades execute (volume decreases)
24. The system must display a time-travel slider component below the visualization
25. The system must allow users to scrub through historical snapshots using the time slider
26. The system must display play/pause controls for time-travel playback
27. The system must provide playback speed controls with options: 0.5x, 1x, 2x, 10x
28. The system must pause live updates when time-travel mode is active
29. The system must resume live updates when exiting time-travel mode
30. The system must fetch historical snapshots from the backend when the user selects a timestamp
31. The system must display clear error messages to users when API calls fail or WebSocket connections are lost
32. The system must handle missing snapshots gracefully (e.g., if user selects a timestamp without data)
33. The system must maintain smooth performance during animations (target: 60fps)
34. The system must use framer-motion for smooth animations
35. The system must use TailwindCSS for styling with an 8-bit retro arcade aesthetic theme

### Data Structure Requirements

36. The backend must provide orderbook data in the following JSON format:
```json
{
  "timestamp": 1234567890,
  "lastPrice": 42000,
  "bids": [
    { "price": 41990, "volume": 2.5 },
    { "price": 41980, "volume": 1.2 }
  ],
  "asks": [
    { "price": 42010, "volume": 3.1 },
    { "price": 42020, "volume": 0.8 }
  ]
}
```
37. Bids must be sorted in descending order by price
38. Asks must be sorted in ascending order by price

## Non-Goals (Out of Scope)

The following features are explicitly **not** included in the MVP:

1. **Trading Functionality**: Users cannot place orders or execute trades through this application
2. **Multiple Trading Pairs**: Only ZEC/USD is supported in MVP (other pairs may be added later)
3. **Wall Detector**: Highlighting unusually large orders (whale orders) is a stretch goal, not MVP
4. **Event Bookmarks**: Ability to bookmark specific market events for quick navigation is a stretch goal
5. **Advanced Analytics**: Price charts, indicators, or technical analysis tools are not included
6. **User Authentication**: No user accounts, login, or personalization features
7. **Data Persistence**: Historical data is only kept in memory for 1 hour; no database or file storage
8. **Mobile Responsiveness**: Focus is on desktop/laptop viewing for demo purposes
9. **Accessibility Features**: Screen reader support, keyboard navigation, and other accessibility features are not prioritized for MVP
10. **Multi-language Support**: English only for MVP

## Design Considerations

### Visual Design
- **Theme**: 8-bit retro arcade aesthetic
- **Color Scheme**: 
  - Red for sellers (asks) - left side
  - Blue for buyers (bids) - right side
  - Dynamic centerline (color may change based on price movement direction)
- **Icons**: Start with simple emoji icons (👤) for MVP, with plans to upgrade to SVG sprites or pixel art later
- **Layout**: 
  - Main visualization area takes center stage
  - Time slider positioned below the visualization
  - Controls (play/pause/speed) positioned near the time slider

### UI Components
- **OrderbookView**: Main visualization component displaying the battle arena
- **PriceColumn**: Component for rendering price levels with volume icons
- **TimeSlider**: Interactive slider for selecting historical timestamps
- **Controls**: Play/pause/speed control buttons

### Animation Guidelines
- Animations should be basic but smooth (performance priority over visual complexity)
- Centerline shifts should animate smoothly when price changes
- Trade execution animations (pairs walking off) should be visible but not overly complex
- Target: 60fps during normal operation

## Technical Considerations

### Backend Architecture
- **Language**: Rust
- **Async Runtime**: tokio
- **WebSocket Client**: tokio-tungstenite
- **Web Framework**: axum
- **Serialization**: serde
- **Data Structures**: BTreeMap for maintaining sorted orderbook state
- **Snapshot Storage**: In-memory storage (HashMap or Vec with timestamp indexing)
- **Server Port**: 8080 (default)

### Frontend Architecture
- **Framework**: React
- **Animation Library**: framer-motion
- **Styling**: TailwindCSS
- **Build Tool**: Vite (implied from port 5173)
- **WebSocket Client**: Native WebSocket API or library
- **State Management**: React hooks (useState, useEffect, custom hooks)

### Performance Considerations
- Backend must handle 100+ WebSocket messages per second during high volatility
- Frontend must render updates smoothly without lag
- Snapshot storage should be memory-efficient (consider limiting number of price levels stored)
- Time-travel queries should respond within 1 second

### Error Handling
- WebSocket disconnections: Automatic reconnection with exponential backoff
- Missing snapshots: Return appropriate error message or empty state
- API failures: Display user-friendly error messages
- Invalid timestamps: Validate and return error response

### Testing Considerations
- Record live WebSocket data to file for offline replay during development
- Test with high-frequency update scenarios
- Test reconnection logic
- Test time-travel edge cases (beginning/end of history, missing snapshots)

## Success Metrics

1. **Demo Stability**: Application runs without crashes during the entire hackathon presentation (target: 100% uptime during demo)
2. **Performance**: System handles 100+ updates/second without noticeable lag or frame drops
3. **Time-Travel Responsiveness**: Historical snapshot retrieval responds within 1 second of user request
4. **User Engagement**: Demo successfully communicates the visual metaphor and engages the audience
5. **Technical Demonstration**: Successfully showcases real-time WebSocket data processing and time-travel functionality

## Open Questions

1. **Snapshot Granularity**: Should snapshots be stored at fixed intervals or on-demand? (Resolved: Configurable 5-10 seconds, default 5)
2. **Price Level Limits**: Should we limit the number of price levels displayed in the UI? If so, how many levels on each side?
3. **Animation Performance**: What is the maximum number of icons that can be rendered smoothly? Should we implement level-of-detail (LOD) rendering?
4. **Error Recovery**: When WebSocket reconnects, should we automatically resume live mode or keep user in time-travel mode?
5. **Data Validation**: How should we handle invalid or corrupted data from Kraken's API?
6. **Browser Compatibility**: Which browsers must be supported? (Chrome/Firefox/Safari/Edge?)
7. **Deployment**: Will this be deployed for the demo, or run locally? If deployed, what hosting platform?
8. **Icon Scaling**: How should icon size scale with volume? Linear, logarithmic, or capped at maximum?
9. **Centerline Movement**: Should centerline movement be constrained to prevent it from going off-screen during extreme price movements?
10. **Time Slider Granularity**: What is the minimum time step users can select? (1 second? 5 seconds?)

---

**Document Version**: 1.0  
**Last Updated**: December 2025  
**Author**: Mylo Benett (Ready Mouse)  
**Project**: Kraken Forge Hackathon - Orderbook Visualizer

