import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/live';

/**
 * Custom hook for managing WebSocket connection to the backend
 * @param {boolean} pauseUpdates - If true, WebSocket messages won't update orderbookState (connection stays alive)
 * @returns {Object} { orderbookState, error, isConnected }
 */
export function useWebSocket(pauseUpdates = false) {
  const [orderbookState, setOrderbookState] = useState(null);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const pauseUpdatesRef = useRef(pauseUpdates);
  const lastValidStateRef = useRef(null); // Keep last valid state to prevent flashing

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        // Don't update state if updates are paused (time-travel mode)
        if (pauseUpdatesRef.current) {
          return;
        }
        
        try {
          const data = JSON.parse(event.data);
          // Store valid state in ref to preserve it during disconnects
          if (data && (data.bids || data.asks)) {
            lastValidStateRef.current = data;
          }
          setOrderbookState(data);
          setError(null);
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
          wasClean: event.wasClean
        });
        setIsConnected(false);
        
        // Don't clear orderbookState on disconnect - keep last valid state to prevent flashing
        // The state will update when reconnected and new data arrives
        
        // Don't reconnect if it was a clean close or if we're shutting down
        if (event.wasClean) {
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

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Return last valid state if current state is null (to prevent flashing during reconnects)
  const displayState = orderbookState || lastValidStateRef.current;
  
  return { orderbookState: displayState, error, isConnected };
}

