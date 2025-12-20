import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to aggregate 1-minute OHLC candles into higher timeframes
 * Returns both the current (in-progress) candle and the last completed candle
 * @param {Object} ohlcData - Raw 1-minute OHLC data from WebSocket
 * @param {Number} timeframeMinutes - Target timeframe in minutes (1, 5, 15, 60, 240)
 * @returns {Object} { currentCandle, lastClosedCandle } - Both aggregated OHLC data
 */
export function useAggregatedCandle(ohlcData, timeframeMinutes) {
  const [currentCandle, setCurrentCandle] = useState(null);
  const [lastClosedCandle, setLastClosedCandle] = useState(null);
  const candleHistoryRef = useRef([]);
  const completedCandlesRef = useRef([]);
  const lastTimeframeRef = useRef(timeframeMinutes);
  const currentPeriodStartRef = useRef(null);
  const previousCandleRef = useRef(null); // Store previous candle for closing
  
  useEffect(() => {
    if (!ohlcData) {
      return;
    }
    
    // Calculate which aggregated period this candle belongs to
    const timeframeSeconds = timeframeMinutes * 60;
    const periodStart = Math.floor(ohlcData.time / timeframeSeconds) * timeframeSeconds;
    
    // Check if we've moved to a new aggregated period
    const isNewPeriod = currentPeriodStartRef.current !== null && currentPeriodStartRef.current !== periodStart;
    
    if (isNewPeriod) {
      console.log('🔄 New period detected!', {
        oldPeriod: new Date(currentPeriodStartRef.current * 1000).toISOString(),
        newPeriod: new Date(periodStart * 1000).toISOString(),
        timeframeMinutes,
      });
      
      // The previous current candle is now completed
      if (previousCandleRef.current) {
        console.log('✅ Setting last closed candle:', previousCandleRef.current);
        setLastClosedCandle(previousCandleRef.current);
        completedCandlesRef.current.push(previousCandleRef.current);
        // Keep only the last few completed candles
        if (completedCandlesRef.current.length > 10) {
          completedCandlesRef.current.shift();
        }
      } else {
        console.log('⚠️ No current candle to close');
      }
      
      // Clear history to start fresh for the new period
      candleHistoryRef.current = [];
    }
    
    currentPeriodStartRef.current = periodStart;
    
    // Check if we already have this 1-minute candle in our history (avoid duplicates)
    const lastCandle = candleHistoryRef.current[candleHistoryRef.current.length - 1];
    if (lastCandle && lastCandle.time === ohlcData.time) {
      // Update the last candle instead of adding a new one
      candleHistoryRef.current[candleHistoryRef.current.length - 1] = ohlcData;
    } else {
      // Add new candle to history
      candleHistoryRef.current.push(ohlcData);
    }
    
    // Keep only candles within the timeframe window
    const cutoffTime = ohlcData.time - timeframeSeconds;
    
    // Filter out old candles but keep at least the last 2
    const filtered = candleHistoryRef.current.filter(
      candle => candle.time >= cutoffTime
    );
    candleHistoryRef.current = filtered.length > 0 ? filtered : [ohlcData];
    
    const candles = candleHistoryRef.current;
    
    // Calculate aggregated OHLC for current period
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
    
    // Store the current candle for next iteration
    previousCandleRef.current = aggregated;
    setCurrentCandle(aggregated);
  }, [ohlcData, timeframeMinutes]);
  
  // Only clear history when timeframe actually changes (not on mount)
  useEffect(() => {
    if (lastTimeframeRef.current !== timeframeMinutes) {
      candleHistoryRef.current = [];
      completedCandlesRef.current = [];
      currentPeriodStartRef.current = null;
      previousCandleRef.current = null;
      // Don't clear candles - keep showing last candles until new ones arrive
      lastTimeframeRef.current = timeframeMinutes;
    }
  }, [timeframeMinutes]);
  
  return { currentCandle, lastClosedCandle };
}

