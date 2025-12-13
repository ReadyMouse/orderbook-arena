import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useTimeTravel } from './hooks/useTimeTravel';
import { fetchHistory } from './utils/api';
import OrderbookView from './components/OrderbookView';
import TimeSlider from './components/TimeSlider';
import Controls from './components/Controls';
import './App.css';

// Available ticker symbols
const TICKERS = [
  { symbol: 'ZEC', pair: 'ZEC/USD', label: 'ZEC/USD' },
  { symbol: 'BTC', pair: 'BTC/USD', label: 'BTC/USD' },
  { symbol: 'ETH', pair: 'ETH/USD', label: 'ETH/USD' },
  { symbol: 'XMR', pair: 'XMR/USD', label: 'XMR/USD' },
];

function App() {
  // Ticker selection state
  const [selectedTicker, setSelectedTicker] = useState('ZEC');
  
  // Time-travel hook
  const timeTravel = useTimeTravel();
  const {
    isTimeTravelMode,
    currentTimestamp,
    playbackSpeed,
    isPlaying,
    minTimestamp,
    maxTimestamp,
    historicalOrderbook,
    isLoadingSnapshot,
    snapshotError,
    enterTimeTravelMode,
    exitTimeTravelMode,
    setTimestamp,
    play,
    pause,
    setSpeed,
    setHistoryRange,
    fetchHistoricalSnapshot,
  } = timeTravel;

  // WebSocket hook - pause updates when in time-travel mode, pass selected ticker
  const { orderbookState, error, isConnected } = useWebSocket(isTimeTravelMode, selectedTicker);

  // Fetch history range on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await fetchHistory();
        setHistoryRange(history.minTimestamp, history.maxTimestamp);
      } catch (err) {
        console.error('Failed to fetch history:', err);
        // Don't show error if no history is available yet (backend might not have snapshots)
      }
    };
    loadHistory();
  }, [setHistoryRange]);

  // Handle timestamp changes from slider (when not playing)
  useEffect(() => {
    if (!isPlaying && isTimeTravelMode && currentTimestamp != null) {
      fetchHistoricalSnapshot(currentTimestamp);
    }
  }, [currentTimestamp, isPlaying, isTimeTravelMode, fetchHistoricalSnapshot]);

  // Determine which orderbook state to display
  const displayOrderbook = isTimeTravelMode ? historicalOrderbook : orderbookState;

  // Handle entering time-travel mode
  const handleEnterTimeTravel = () => {
    // Check if history is available
    if (minTimestamp == null || maxTimestamp == null) {
      // Try to fetch history first
      fetchHistory()
        .then((history) => {
          setHistoryRange(history.minTimestamp, history.maxTimestamp);
          enterTimeTravelMode();
          // Start at the beginning of history
          if (history.minTimestamp != null) {
            fetchHistoricalSnapshot(history.minTimestamp);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch history:', err);
          // Still enter time-travel mode, but show error
          enterTimeTravelMode();
        });
    } else {
      enterTimeTravelMode();
      // Fetch initial snapshot if we have a current timestamp
      if (currentTimestamp != null) {
        fetchHistoricalSnapshot(currentTimestamp);
      } else if (minTimestamp != null) {
        // Start at the beginning of history
        fetchHistoricalSnapshot(minTimestamp);
      }
    }
  };

  // Handle exiting time-travel mode
  const handleExitTimeTravel = () => {
    exitTimeTravelMode();
  };

  // Handle timestamp change from slider
  const handleTimestampChange = (timestamp) => {
    // Validate timestamp before setting
    if (timestamp == null || isNaN(timestamp)) {
      return;
    }

    // Clamp to valid range (TimeSlider should handle this, but double-check)
    let clampedTimestamp = timestamp;
    if (minTimestamp != null && clampedTimestamp < minTimestamp) {
      clampedTimestamp = minTimestamp;
    }
    if (maxTimestamp != null && clampedTimestamp > maxTimestamp) {
      clampedTimestamp = maxTimestamp;
    }

    setTimestamp(clampedTimestamp);
    // If not playing, fetch immediately
    if (!isPlaying) {
      fetchHistoricalSnapshot(clampedTimestamp);
    }
  };

  return (
    <div className="min-h-screen bg-arcade-bg text-arcade-white">
      {/* Header */}
      <header className="p-4 border-b-2 border-arcade-white">
        <div className="flex items-center justify-center gap-4 mb-2">
          <h1 className="text-3xl font-arcade uppercase">
            Orderbook Arena:
          </h1>
          <select
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="px-4 py-2 text-xl font-arcade bg-arcade-dark border-2 border-arcade-white text-arcade-white cursor-pointer hover:bg-arcade-gray/20 focus:outline-none focus:ring-2 focus:ring-arcade-yellow"
          >
            {TICKERS.map((ticker) => (
              <option key={ticker.symbol} value={ticker.symbol}>
                {ticker.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-center items-center gap-4 mt-2">
          <div className={`text-sm ${isTimeTravelMode ? 'text-arcade-yellow' : isConnected ? 'text-arcade-green' : 'text-arcade-red'}`}>
            {isTimeTravelMode ? '⏱ TIME TRAVEL' : isConnected ? '● LIVE' : '○ OFFLINE'}
          </div>
          {error && !isTimeTravelMode && (
            <div className="text-sm text-arcade-red">
              Error: {error}
            </div>
          )}
          {snapshotError && isTimeTravelMode && (
            <div className="text-sm text-arcade-red font-arcade">
              ⚠ {snapshotError}
            </div>
          )}
          {isTimeTravelMode && currentTimestamp === minTimestamp && minTimestamp != null && (
            <div className="text-sm text-arcade-yellow font-arcade">
              ⏪ At beginning of history
            </div>
          )}
          {isTimeTravelMode && currentTimestamp === maxTimestamp && maxTimestamp != null && (
            <div className="text-sm text-arcade-yellow font-arcade">
              ⏩ At end of history
            </div>
          )}
          {isLoadingSnapshot && (
            <div className="text-sm text-arcade-yellow">
              Loading snapshot...
            </div>
          )}
        </div>
      </header>

      {/* Main visualization area */}
      <main className="flex-1 p-4">
        <div className="w-full h-[calc(100vh-200px)] border-2 border-arcade-white">
          <OrderbookView orderbookState={displayOrderbook} />
        </div>
      </main>

      {/* Controls section */}
      <footer className="p-4 border-t-2 border-arcade-white">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Mode toggle */}
          <div className="flex justify-center">
            {!isTimeTravelMode ? (
              <button
                onClick={handleEnterTimeTravel}
                className="px-6 py-2 font-arcade uppercase text-sm
                           bg-arcade-purple text-arcade-white border-2 border-arcade-purple
                           shadow-arcade hover:bg-arcade-purple/80
                           active:shadow-none active:translate-x-1 active:translate-y-1"
              >
                ⏱ Enter Time Travel Mode
              </button>
            ) : (
              <button
                onClick={handleExitTimeTravel}
                className="px-6 py-2 font-arcade uppercase text-sm
                           bg-arcade-gray text-arcade-white border-2 border-arcade-gray
                           shadow-arcade hover:bg-arcade-gray/80
                           active:shadow-none active:translate-x-1 active:translate-y-1"
              >
                ← Return to Live
              </button>
            )}
          </div>

          {/* Time-travel controls (only shown in time-travel mode) */}
          {isTimeTravelMode && (
            <>
              {/* Time slider */}
              <TimeSlider
                minTimestamp={minTimestamp}
                maxTimestamp={maxTimestamp}
                currentTimestamp={currentTimestamp}
                onChange={handleTimestampChange}
              />

              {/* Playback controls */}
              <Controls
                isPlaying={isPlaying}
                playbackSpeed={playbackSpeed}
                onPlay={play}
                onPause={pause}
                onSpeedChange={setSpeed}
              />
            </>
          )}
        </div>
      </footer>
    </div>
  )
}

export default App
