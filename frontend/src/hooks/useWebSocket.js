import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/live';

/**
 * Custom hook for managing WebSocket connection to the backend
 * @param {boolean} pauseUpdates - If true, WebSocket messages won't update orderbookState (connection stays alive)
 * @param {string} ticker - Trading pair symbol (e.g., 'ZEC', 'BTC', 'ETH', 'XMR')
 * @returns {Object} { orderbookState, ohlcData, error, isConnected }
 */
export function useWebSocket(pauseUpdates = false, ticker = 'ZEC') {
  const [orderbookState, setOrderbookState] = useState(null);
  const [ohlcData, setOhlcData] = useState(null);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const pauseUpdatesRef = useRef(pauseUpdates);
  const tickerRef = useRef(ticker);
  const isIntentionalCloseRef = useRef(false); // Track if we're intentionally closing (e.g., ticker change)
  const lastValidStateRef = useRef(null); // Keep last valid state to prevent flashing
  const accumulatedOrderbookRef = useRef({ bids: new Map(), asks: new Map(), lastPrice: null, timestamp: null }); // Accumulate full orderbook
  const isFirstMessageRef = useRef(true); // Track if this is the first message after connection

  const connect = useCallback(() => {
    try {
      // Append ticker as query parameter
      const wsUrlWithTicker = `${WS_URL}?ticker=${tickerRef.current}`;
      const ws = new WebSocket(wsUrlWithTicker);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        // Reset accumulated orderbook on new connection
        accumulatedOrderbookRef.current = { bids: new Map(), asks: new Map(), lastPrice: null, timestamp: null };
        // First message after connection is always a full snapshot
        isFirstMessageRef.current = true;
      };

      ws.onmessage = (event) => {
        // Don't update state if updates are paused (time-travel mode)
        if (pauseUpdatesRef.current) {
          return;
        }
        
        try {
          const message = JSON.parse(event.data);
          
          // Handle different message types
          if (message.type === 'ohlc') {
            // OHLC candlestick data
            setOhlcData(message.data);
            return;
          }
          
          // Handle orderbook data (either with type wrapper or legacy format)
          const data = message.type === 'orderbook' ? message.data : message;
          
          if (data && (data.bids || data.asks)) {
            const accumulated = accumulatedOrderbookRef.current;
            const incomingOrderCount = (data.bids?.length || 0) + (data.asks?.length || 0);
            
            // First message after connection is ALWAYS a full snapshot from the backend
            // All subsequent messages are deltas
            console.log('Processing message:', { 
              isFirst: isFirstMessageRef.current, 
              bids: data.bids?.length || 0, 
              asks: data.asks?.length || 0, 
              total: incomingOrderCount,
              currentBids: accumulated.bids.size,
              currentAsks: accumulated.asks.size
            });
            
            if (isFirstMessageRef.current) {
              // Full snapshot: REPLACE the accumulated state
              console.log('Received initial full snapshot:', { bids: data.bids?.length || 0, asks: data.asks?.length || 0, total: incomingOrderCount });
              accumulated.bids.clear();
              accumulated.asks.clear();
              
              // Populate from snapshot
              if (Array.isArray(data.bids)) {
                data.bids.forEach(bid => {
                  if (bid && typeof bid.price === 'number' && bid.volume > 0) {
                    accumulated.bids.set(bid.price, bid.volume);
                  }
                });
              }
              
              if (Array.isArray(data.asks)) {
                data.asks.forEach(ask => {
                  if (ask && typeof ask.price === 'number' && ask.volume > 0) {
                    accumulated.asks.set(ask.price, ask.volume);
                  }
                });
              }
              
              isFirstMessageRef.current = false;
            } else {
              // Delta update: MERGE into accumulated state
              if (Array.isArray(data.bids)) {
                data.bids.forEach(bid => {
                  if (bid && typeof bid.price === 'number') {
                    if (bid.volume > 0) {
                      accumulated.bids.set(bid.price, bid.volume);
                    } else {
                      // Volume 0 means remove this price level
                      accumulated.bids.delete(bid.price);
                    }
                  }
                });
              }
              
              if (Array.isArray(data.asks)) {
                data.asks.forEach(ask => {
                  if (ask && typeof ask.price === 'number') {
                    if (ask.volume > 0) {
                      accumulated.asks.set(ask.price, ask.volume);
                    } else {
                      // Volume 0 means remove this price level
                      accumulated.asks.delete(ask.price);
                    }
                  }
                });
              }
            }
            
            // Update lastPrice and timestamp
            if (data.lastPrice != null) {
              accumulated.lastPrice = data.lastPrice;
            }
            if (data.timestamp != null) {
              accumulated.timestamp = data.timestamp;
            }
            
            // Convert accumulated Maps back to arrays for state
            const fullState = {
              bids: Array.from(accumulated.bids.entries())
                .map(([price, volume]) => ({ price, volume }))
                .sort((a, b) => b.price - a.price), // Descending for bids
              asks: Array.from(accumulated.asks.entries())
                .map(([price, volume]) => ({ price, volume }))
                .sort((a, b) => a.price - b.price), // Ascending for asks
              lastPrice: accumulated.lastPrice,
              timestamp: accumulated.timestamp,
            };
            
            lastValidStateRef.current = fullState;
            setOrderbookState(fullState);
            setError(null);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
          setError('Failed to parse orderbook update');
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        console.error('WebSocket URL:', WS_URL);
        console.error('WebSocket readyState:', ws.readyState);
        setError(`WebSocket connection error (state: ${ws.readyState})`);
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          isIntentional: isIntentionalCloseRef.current
        });
        setIsConnected(false);
        
        // Don't clear orderbookState on disconnect - keep last valid state to prevent flashing
        // The state will update when reconnected and new data arrives
        
        // Don't reconnect if it was intentional (ticker change) or a clean close
        if (isIntentionalCloseRef.current || event.wasClean) {
          isIntentionalCloseRef.current = false; // Reset flag
          return;
        }
        
        // Exponential backoff reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
          connect();
        }, delay);
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to establish WebSocket connection');
      setIsConnected(false);
    }
  }, []);

  // Update pauseUpdatesRef when pauseUpdates changes
  useEffect(() => {
    pauseUpdatesRef.current = pauseUpdates;
  }, [pauseUpdates]);

  // Connect on mount and reconnect when ticker changes
  useEffect(() => {
    console.log('Ticker changed to:', ticker);
    tickerRef.current = ticker;
    
    // Close existing connection if ticker changed (mark as intentional)
    if (wsRef.current) {
      console.log('Closing existing WebSocket connection for ticker change');
      isIntentionalCloseRef.current = true;
      wsRef.current.close();
    }
    
    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Reset accumulated state when ticker changes
    accumulatedOrderbookRef.current = { bids: new Map(), asks: new Map(), lastPrice: null, timestamp: null };
    lastValidStateRef.current = null;
    setOrderbookState(null);
    reconnectAttemptsRef.current = 0;
    
    // Connect with current ticker
    console.log('Establishing new connection for ticker:', ticker);
    connect();

    // Cleanup on unmount
    return () => {
      isIntentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [ticker, connect]);

  // Return last valid state if current state is null (to prevent flashing during reconnects)
  const displayState = orderbookState || lastValidStateRef.current;
  
  return { orderbookState: displayState, ohlcData, error, isConnected };
}

