import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to aggregate 1-minute OHLC candles into higher timeframes
 * @param {Object} ohlcData - Raw 1-minute OHLC data from WebSocket
 * @param {Number} timeframeMinutes - Target timeframe in minutes (1, 5, 15, 60, 240)
 * @returns {Object} Aggregated OHLC data for the selected timeframe
 */
export function useAggregatedCandle(ohlcData, timeframeMinutes) {
  const [aggregatedCandle, setAggregatedCandle] = useState(null);
  const candleHistoryRef = useRef([]);
  const lastTimeframeRef = useRef(timeframeMinutes);
  
  useEffect(() => {
    if (!ohlcData) {
      return;
    }
    
    // For 1-minute timeframe, just return the raw data immediately
    if (timeframeMinutes === 1) {
      setAggregatedCandle(ohlcData);
      return;
    }
    
    // Check if we already have this candle (avoid duplicates)
    const lastCandle = candleHistoryRef.current[candleHistoryRef.current.length - 1];
    if (lastCandle && lastCandle.time === ohlcData.time) {
      // Update the last candle instead of adding a new one
      candleHistoryRef.current[candleHistoryRef.current.length - 1] = ohlcData;
    } else {
      // Add new candle to history
      candleHistoryRef.current.push(ohlcData);
    }
    
    // Keep only candles within the timeframe window (plus a buffer)
    const timeframeSeconds = timeframeMinutes * 60;
    const cutoffTime = ohlcData.time - timeframeSeconds;
    
    // Filter out old candles but keep at least the last 2
    const filtered = candleHistoryRef.current.filter(
      candle => candle.time >= cutoffTime
    );
    candleHistoryRef.current = filtered.length > 0 ? filtered : [ohlcData];
    
    const candles = candleHistoryRef.current;
    
    // Calculate aggregated OHLC
    const aggregated = {
      time: candles[0].time,
      etime: ohlcData.etime,
      open: candles[0].open,
      high: Math.max(...candles.map(c => c.high)),
      low: Math.min(...candles.map(c => c.low)),
      close: ohlcData.close, // Always use latest close
      vwap: ohlcData.vwap,
      volume: candles.reduce((sum, c) => sum + c.volume, 0),
      count: candles.reduce((sum, c) => sum + c.count, 0),
    };
    
    setAggregatedCandle(aggregated);
  }, [ohlcData, timeframeMinutes]);
  
  // Only clear history when timeframe actually changes (not on mount)
  useEffect(() => {
    if (lastTimeframeRef.current !== timeframeMinutes) {
      candleHistoryRef.current = [];
      // Don't clear aggregatedCandle - keep showing last candle until new one arrives
      lastTimeframeRef.current = timeframeMinutes;
    }
  }, [timeframeMinutes]);
  
  return aggregatedCandle;
}

