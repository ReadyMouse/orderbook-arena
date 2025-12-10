import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchSnapshot } from '../utils/api';

/**
 * Custom hook for managing time-travel state and playback logic
 * 
 * @returns {Object} Time-travel state and control functions
 */
export function useTimeTravel() {
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
    if (currentTimestamp === null && min !== null) {
      setCurrentTimestamp(min);
    }
  }, [currentTimestamp]);

  /**
   * Fetch a historical snapshot by timestamp and update the orderbook view
   * @param {number} timestamp - Unix timestamp in seconds
   */
  const fetchHistoricalSnapshot = useCallback(async (timestamp) => {
    // Validate timestamp
    if (timestamp == null || isNaN(timestamp) || timestamp < 0) {
      setSnapshotError('Invalid timestamp: must be a positive number');
      setIsLoadingSnapshot(false);
      return;
    }

    // Validate timestamp is within history range
    if (minTimestamp != null && timestamp < minTimestamp) {
      setSnapshotError(`Timestamp is before available history (earliest: ${new Date(minTimestamp * 1000).toLocaleString()})`);
      setIsLoadingSnapshot(false);
      return;
    }

    if (maxTimestamp != null && timestamp > maxTimestamp) {
      setSnapshotError(`Timestamp is after available history (latest: ${new Date(maxTimestamp * 1000).toLocaleString()})`);
      setIsLoadingSnapshot(false);
      return;
    }

    setIsLoadingSnapshot(true);
    setSnapshotError(null);

    try {
      const snapshot = await fetchSnapshot(timestamp);
      
      // Snapshot format: { timestamp, lastPrice, bids: [{price, volume}], asks: [{price, volume}] }
      // This matches the orderbook format, so we can use it directly
      const orderbookState = {
        lastPrice: snapshot.lastPrice,
        bids: snapshot.bids || [],
        asks: snapshot.asks || [],
      };

      setHistoricalOrderbook(orderbookState);
      setCurrentTimestamp(timestamp);
      setSnapshotError(null);
    } catch (err) {
      console.error('Failed to fetch historical snapshot:', err);
      // Provide user-friendly error messages
      let errorMessage = 'Failed to fetch snapshot';
      if (err.message.includes('not found') || err.message.includes('404')) {
        errorMessage = `Snapshot not found for timestamp: ${new Date(timestamp * 1000).toLocaleString()}. The snapshot may have been cleaned up or never existed.`;
      } else if (err.message.includes('Invalid timestamp') || err.message.includes('400')) {
        errorMessage = `Invalid timestamp format: ${timestamp}`;
      } else {
        errorMessage = err.message || errorMessage;
      }
      setSnapshotError(errorMessage);
      // Keep previous orderbook state if available, don't clear it
      // setHistoricalOrderbook(null);
    } finally {
      setIsLoadingSnapshot(false);
    }
  }, [minTimestamp, maxTimestamp]);

  /**
   * Step to the next snapshot in the playback sequence
   */
  const stepToNextSnapshot = useCallback(() => {
    if (currentTimestamp == null || maxTimestamp == null) {
      pause();
      setSnapshotError('Cannot step forward: no valid timestamp or history range');
      return;
    }

    const nextTimestamp = currentTimestamp + SNAPSHOT_INTERVAL_SECS;
    
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

    const prevTimestamp = currentTimestamp - SNAPSHOT_INTERVAL_SECS;
    
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

