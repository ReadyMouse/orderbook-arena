import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchSnapshot } from '../utils/api';

/**
 * Custom hook for managing time-travel state and playback logic
 * 
 * @param {string} ticker - The ticker symbol for which to fetch snapshots
 * @returns {Object} Time-travel state and control functions
 */
export function useTimeTravel(ticker) {
  // Time-travel state
  const [isTimeTravelMode, setIsTimeTravelMode] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.5, 1, 2, 10
  const [isPlaying, setIsPlaying] = useState(false);
  
  // History range
  const [minTimestamp, setMinTimestamp] = useState(null);
  const [maxTimestamp, setMaxTimestamp] = useState(null);
  
  // Historical snapshot state
  const [historicalOrderbook, setHistoricalOrderbook] = useState(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState(null);
  
  // Playback interval ref
  const playbackIntervalRef = useRef(null);
  
  // Snapshot interval in seconds (matches backend config default)
  const SNAPSHOT_INTERVAL_SECS = 5;

  // Control functions
  const enterTimeTravelMode = useCallback(() => {
    setIsTimeTravelMode(true);
  }, []);

  const exitTimeTravelMode = useCallback(() => {
    setIsTimeTravelMode(false);
    setIsPlaying(false);
    setCurrentTimestamp(null);
    // Clear historical orderbook state to allow live updates to resume
    setHistoricalOrderbook(null);
    setSnapshotError(null);
    // Clear playback interval
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
  }, []);

  const setTimestamp = useCallback((timestamp) => {
    // Validate timestamp is within range before setting
    if (timestamp == null || isNaN(timestamp)) {
      return;
    }

    // Clamp timestamp to valid range
    let clampedTimestamp = timestamp;
    if (minTimestamp != null && clampedTimestamp < minTimestamp) {
      clampedTimestamp = minTimestamp;
    }
    if (maxTimestamp != null && clampedTimestamp > maxTimestamp) {
      clampedTimestamp = maxTimestamp;
    }

    setCurrentTimestamp(clampedTimestamp);
  }, [minTimestamp, maxTimestamp]);

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    // Clear playback interval
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
  }, []);

  const setSpeed = useCallback((speed) => {
    setPlaybackSpeed(speed);
  }, []);

  const setHistoryRange = useCallback((min, max) => {
    setMinTimestamp(min);
    setMaxTimestamp(max);
    // Initialize currentTimestamp to min if not set
    setCurrentTimestamp(prev => {
      if (prev === null && min !== null) {
        return min;
      }
      return prev;
    });
  }, []);

  /**
   * Fetch a historical snapshot by timestamp and update the orderbook view
   * @param {number} timestamp - Unix timestamp in seconds
   */
  const fetchHistoricalSnapshot = useCallback(async (timestamp) => {
    // Validate ticker
    if (!ticker) {
      setSnapshotError('No ticker specified');
      setIsLoadingSnapshot(false);
      return;
    }

    // Validate timestamp
    if (timestamp == null || isNaN(timestamp) || timestamp < 0) {
      setSnapshotError('Invalid timestamp: must be a positive number');
      setIsLoadingSnapshot(false);
      return;
    }

    // Round timestamp to nearest 5-second interval based on when snapshots actually exist
    // Use minTimestamp as the reference point since that's when snapshots started
    let roundedTimestamp = timestamp;
    if (minTimestamp != null) {
      // Calculate offset from minTimestamp and round to nearest interval
      const offset = timestamp - minTimestamp;
      const roundedOffset = Math.round(offset / SNAPSHOT_INTERVAL_SECS) * SNAPSHOT_INTERVAL_SECS;
      roundedTimestamp = minTimestamp + roundedOffset;
    } else {
      // Fallback: round to absolute 5-second intervals
      roundedTimestamp = Math.round(timestamp / SNAPSHOT_INTERVAL_SECS) * SNAPSHOT_INTERVAL_SECS;
    }

    // Validate timestamp is within history range
    if (minTimestamp != null && roundedTimestamp < minTimestamp) {
      setSnapshotError(`Timestamp is before available history (earliest: ${new Date(minTimestamp * 1000).toLocaleString()})`);
      setIsLoadingSnapshot(false);
      return;
    }

    if (maxTimestamp != null && roundedTimestamp > maxTimestamp) {
      setSnapshotError(`Timestamp is after available history (latest: ${new Date(maxTimestamp * 1000).toLocaleString()})`);
      setIsLoadingSnapshot(false);
      return;
    }

    setIsLoadingSnapshot(true);
    setSnapshotError(null);

    try {
      const snapshot = await fetchSnapshot(ticker, roundedTimestamp);
      
      // Snapshot format: { ticker, timestamp, lastPrice, bids: [{price, volume}], asks: [{price, volume}] }
      // This matches the orderbook format, so we can use it directly
      const orderbookState = {
        lastPrice: snapshot.lastPrice,
        bids: snapshot.bids || [],
        asks: snapshot.asks || [],
      };

      // Only update the display if we have actual orderbook data (at least some bids or asks)
      // This prevents showing empty frames - we keep the last frame until new data arrives
      const hasData = orderbookState.bids.length > 0 || orderbookState.asks.length > 0;
      
      if (hasData) {
        setHistoricalOrderbook(orderbookState);
        setSnapshotError(null);
      }
      // Always update timestamp even if snapshot is empty, to keep playback moving
      setCurrentTimestamp(roundedTimestamp);
    } catch (err) {
      console.error('Failed to fetch historical snapshot:', err);
      // Provide user-friendly error messages
      let errorMessage = 'Failed to fetch snapshot';
      if (err.message.includes('not found') || err.message.includes('404')) {
        errorMessage = `Snapshot not found for ${ticker} at timestamp: ${new Date(roundedTimestamp * 1000).toLocaleString()}. The snapshot may have been cleaned up or never existed.`;
      } else if (err.message.includes('Invalid timestamp') || err.message.includes('400')) {
        errorMessage = `Invalid timestamp format: ${roundedTimestamp}`;
      } else {
        errorMessage = err.message || errorMessage;
      }
      setSnapshotError(errorMessage);
      // Keep previous orderbook state if available, don't clear it
      // setHistoricalOrderbook(null);
    } finally {
      setIsLoadingSnapshot(false);
    }
  }, [ticker, minTimestamp, maxTimestamp]);

  /**
   * Step to the next snapshot in the playback sequence
   */
  const stepToNextSnapshot = useCallback(() => {
    if (currentTimestamp == null || maxTimestamp == null) {
      pause();
      setSnapshotError('Cannot step forward: no valid timestamp or history range');
      return;
    }

    // Round current timestamp to nearest interval first (in case it's not aligned)
    const alignedCurrent = Math.round(currentTimestamp / SNAPSHOT_INTERVAL_SECS) * SNAPSHOT_INTERVAL_SECS;
    const nextTimestamp = alignedCurrent + SNAPSHOT_INTERVAL_SECS;
    
    // Stop if we've reached the end
    if (nextTimestamp > maxTimestamp) {
      pause();
      setSnapshotError(null); // Clear any previous errors
      // Set timestamp to max to show we're at the end
      setCurrentTimestamp(maxTimestamp);
      return;
    }

    fetchHistoricalSnapshot(nextTimestamp);
  }, [currentTimestamp, maxTimestamp, fetchHistoricalSnapshot, pause]);

  /**
   * Step to the previous snapshot in the playback sequence
   */
  const stepToPreviousSnapshot = useCallback(() => {
    if (currentTimestamp == null || minTimestamp == null) {
      return;
    }

    // Round current timestamp to nearest interval first (in case it's not aligned)
    const alignedCurrent = Math.round(currentTimestamp / SNAPSHOT_INTERVAL_SECS) * SNAPSHOT_INTERVAL_SECS;
    const prevTimestamp = alignedCurrent - SNAPSHOT_INTERVAL_SECS;
    
    // Stop if we've reached the beginning
    if (prevTimestamp < minTimestamp) {
      return;
    }

    fetchHistoricalSnapshot(prevTimestamp);
  }, [currentTimestamp, minTimestamp, fetchHistoricalSnapshot]);

  // Playback effect: step through snapshots when playing
  useEffect(() => {
    if (!isPlaying || !isTimeTravelMode) {
      // Clear interval if not playing
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      return;
    }

    // Calculate interval based on playback speed
    // At 1x speed, we want to show each snapshot for 1 second (real-time feel)
    // At 2x speed, we show each snapshot for 0.5 seconds (2x faster)
    // At 0.5x speed, we show each snapshot for 2 seconds (0.5x slower)
    // At 10x speed, we show each snapshot for 0.1 seconds (10x faster)
    const baseIntervalMs = 1000; // 1 second per snapshot at 1x speed
    const intervalMs = baseIntervalMs / playbackSpeed;

    // Set up interval to step through snapshots
    playbackIntervalRef.current = setInterval(() => {
      stepToNextSnapshot();
    }, intervalMs);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    };
  }, [isPlaying, isTimeTravelMode, playbackSpeed, stepToNextSnapshot]);

  return {
    // State
    isTimeTravelMode,
    currentTimestamp,
    playbackSpeed,
    isPlaying,
    minTimestamp,
    maxTimestamp,
    historicalOrderbook,
    isLoadingSnapshot,
    snapshotError,
    
    // Control functions
    enterTimeTravelMode,
    exitTimeTravelMode,
    setTimestamp,
    play,
    pause,
    setSpeed,
    setHistoryRange,
    fetchHistoricalSnapshot,
    stepToPreviousSnapshot,
  };
}

