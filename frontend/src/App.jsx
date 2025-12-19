import { useEffect, useState, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useTimeTravel } from './hooks/useTimeTravel';
import { fetchHistory } from './utils/api';
import OrderbookView from './components/OrderbookView';
import TimeSlider from './components/TimeSlider';
import Controls from './components/Controls';
import pacManIcon from './assets/pac-man.png';
import spaceInvaderIcon from './assets/space_invader.png';
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
  
  // Track if user tried to enter time travel but no history available
  const [noHistoryError, setNoHistoryError] = useState(false);
  
  // Time-travel hook (pass the selected ticker)
  const timeTravel = useTimeTravel(selectedTicker);
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
  const { orderbookState, ohlcData, error, isConnected } = useWebSocket(isTimeTravelMode, selectedTicker);

  // Fetch history range when ticker changes
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await fetchHistory(selectedTicker);
        setHistoryRange(history.minTimestamp, history.maxTimestamp);
        setNoHistoryError(false); // Clear error when history becomes available
      } catch (err) {
        console.error('Failed to fetch history:', err);
        // Don't show error if no history is available yet (backend might not have snapshots)
      }
    };
    loadHistory();
  }, [selectedTicker, setHistoryRange]);

  // Handle timestamp changes from slider (when not playing)
  useEffect(() => {
    if (!isPlaying && isTimeTravelMode && currentTimestamp != null) {
      fetchHistoricalSnapshot(currentTimestamp);
    }
  }, [currentTimestamp, isPlaying, isTimeTravelMode, fetchHistoricalSnapshot]);

  // Determine which orderbook state to display
  const displayOrderbook = isTimeTravelMode ? historicalOrderbook : orderbookState;

  // Calculate total volumes for health meters
  const { buyerPercent, sellerPercent } = useMemo(() => {
    if (!displayOrderbook) {
      return { buyerPercent: 0, sellerPercent: 0 };
    }

    const bids = displayOrderbook.bids || [];
    const asks = displayOrderbook.asks || [];

    let buyerVol = 0;
    let sellerVol = 0;

    bids.forEach(bid => {
      if (bid && typeof bid.volume === 'number') {
        buyerVol += bid.volume;
      }
    });

    asks.forEach(ask => {
      if (ask && typeof ask.volume === 'number') {
        sellerVol += ask.volume;
      }
    });

    const totalVol = buyerVol + sellerVol;
    const buyerPct = totalVol > 0 ? (buyerVol / totalVol) * 100 : 0;
    const sellerPct = totalVol > 0 ? (sellerVol / totalVol) * 100 : 0;

    return {
      buyerPercent: buyerPct,
      sellerPercent: sellerPct,
    };
  }, [displayOrderbook]);

  // Handle entering time-travel mode
  const handleEnterTimeTravel = () => {
    // Always fetch fresh history when entering time travel mode
    // This ensures we get the latest snapshot range from the server
    fetchHistory(selectedTicker)
      .then((history) => {
        setHistoryRange(history.minTimestamp, history.maxTimestamp);
        setNoHistoryError(false);
        enterTimeTravelMode();
        // Start at the beginning of history
        if (history.minTimestamp != null) {
          fetchHistoricalSnapshot(history.minTimestamp);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch history:', err);
        // Don't enter time-travel mode if no history is available
        setNoHistoryError(true);
        // Clear the error after 5 seconds
        setTimeout(() => setNoHistoryError(false), 5000);
      });
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

    // If not in time-travel mode, enter it automatically when scrubbing
    if (!isTimeTravelMode) {
      enterTimeTravelMode();
    }

    setTimestamp(clampedTimestamp);
    // If not playing, fetch immediately
    if (!isPlaying) {
      fetchHistoricalSnapshot(clampedTimestamp);
    }
  };

  return (
    <div className="h-screen bg-arcade-bg text-arcade-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="p-4 border-b-2 border-arcade-white relative flex-shrink-0">
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
        <div className="flex justify-center mb-2">
          <p className="text-sm font-arcade text-arcade-gray italic">
            Watch the Players Battle over the Price
          </p>
        </div>
        
        {/* Health Meters - upper left corner */}
        {displayOrderbook && (buyerPercent > 0 || sellerPercent > 0) && (
          <div className="absolute top-4 left-4 flex flex-col gap-1">
            {/* Label */}
            <div className="text-[10px] font-arcade text-arcade-white uppercase mb-0.5">
              Relative Volume
            </div>
            
            {/* Buyers Health Meter */}
            <div className="flex items-center gap-2">
              <img src={pacManIcon} alt="buyer" className="w-4 h-4" />
              <div className="relative w-28 h-5 bg-arcade-dark border-2 border-arcade-red/60 rounded">
                {/* Battery juice - red for buyers */}
                <div 
                  className="absolute top-0 left-0 h-full bg-arcade-red transition-all duration-300 rounded-sm"
                  style={{ width: `${buyerPercent}%` }}
                />
                {/* Percentage text */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-arcade font-bold text-arcade-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {buyerPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
            
            {/* Sellers Health Meter */}
            <div className="flex items-center gap-2">
              <img src={spaceInvaderIcon} alt="seller" className="w-4 h-4" />
              <div className="relative w-28 h-5 bg-arcade-dark border-2 border-arcade-blue/60 rounded">
                {/* Battery juice - blue for sellers */}
                <div 
                  className="absolute top-0 left-0 h-full bg-arcade-blue transition-all duration-300 rounded-sm"
                  style={{ width: `${sellerPercent}%` }}
                />
                {/* Percentage text */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-arcade font-bold text-arcade-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {sellerPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-center items-center gap-4 mt-2">
          <div className={`text-sm ${isTimeTravelMode ? 'text-arcade-yellow' : isConnected ? 'text-arcade-green' : 'text-arcade-red'}`}>
            {isTimeTravelMode ? '⏱ TIME TRAVEL' : isConnected ? '● LIVE' : '○ OFFLINE'}
          </div>
          {error && !isTimeTravelMode && (
            <div className="text-sm text-arcade-red">
              Error: {error}
            </div>
          )}
          {noHistoryError && !isTimeTravelMode && (
            <div className="text-sm text-arcade-yellow font-arcade">
              ⚠ No history yet. Wait ~10 seconds for snapshots to accumulate.
            </div>
          )}
          {snapshotError && isTimeTravelMode && (
            <div className="text-sm text-arcade-red font-arcade">
              ⚠ {snapshotError}
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

      {/* Main visualization area - takes remaining space */}
      <main className="flex-1 p-4 min-h-0 overflow-hidden">
        <div className="w-full h-full border-2 border-arcade-white">
          <OrderbookView orderbookState={displayOrderbook} ohlcData={ohlcData} />
        </div>
      </main>

      {/* Controls section */}
      <footer className="p-4 border-t-2 border-arcade-white flex-shrink-0">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Info message for history collection */}
          {(minTimestamp == null || maxTimestamp == null) && (
            <div className="flex justify-center">
              <div className="text-xs text-arcade-gray font-arcade">
                Collecting history... snapshots available in ~10 seconds
              </div>
            </div>
          )}

          {/* Time slider - always shown */}
          <TimeSlider
            minTimestamp={minTimestamp}
            maxTimestamp={maxTimestamp}
            currentTimestamp={currentTimestamp}
            onChange={handleTimestampChange}
          />

          {/* Playback controls - always shown */}
          <Controls
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            onPlay={() => {
              // Enter time-travel mode if not already in it
              if (!isTimeTravelMode) {
                handleEnterTimeTravel();
              }
              play();
            }}
            onPause={pause}
            onSpeedChange={setSpeed}
            onLive={handleExitTimeTravel}
            isLive={!isTimeTravelMode}
            isPlayDisabled={!isTimeTravelMode && (currentTimestamp === null || currentTimestamp === maxTimestamp)}
          />
        </div>
      </footer>
    </div>
  )
}

export default App
