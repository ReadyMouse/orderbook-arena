import { useMemo, useCallback, memo, useRef, useState, useEffect } from 'react';
import PriceScale from './PriceScale';
import CandleDisplay from './CandleDisplay';
import { useAggregatedCandle } from '../hooks/useAggregatedCandle';
import pacManIcon from '../assets/pac-man.png';
import spaceInvaderIcon from '../assets/space_invader.png';
import candlesticksIcon from '../assets/candle_own.png';

/**
 * Main container component for the orderbook visualization
 * 
 * This component displays the battle arena with:
 * - Buyers (bids) on the left side (red) - lower prices
 * - Sellers (asks) on the right side (blue) - higher prices
 * - Centerline representing the last traded price
 */

function OrderbookView({ orderbookState, ohlcData }) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // This ensures hooks are always called in the same order
  
  // Ref for measuring arena height for dynamic scaling
  const arenaRef = useRef(null);
  const [arenaHeight, setArenaHeight] = useState(600); // Default height
  
  // User-controlled price increment for ruler/intervals
  const [priceIncrement, setPriceIncrement] = useState(10);
  
  // User-controlled candle timeframe (in minutes)
  const [candleTimeframe, setCandleTimeframe] = useState(1);
  
  // Animation state for laser battles when centerline shifts
  const [laserAnimation, setLaserAnimation] = useState(null);
  const previousCenterRef = useRef(null);
  
  // Aggregate OHLC data based on selected timeframe
  // Returns both current (in-progress) and last closed candle
  const { currentCandle: rawCurrentCandle, lastClosedCandle: rawLastClosedCandle } = useAggregatedCandle(ohlcData, candleTimeframe);
  
  // Update current candle's close price to match current lastPrice for accurate positioning
  const currentCandle = useMemo(() => {
    if (!rawCurrentCandle || !orderbookState?.lastPrice) {
      return rawCurrentCandle;
    }
    
    // Update close price to current lastPrice and adjust high/low if needed
    const currentPrice = orderbookState.lastPrice;
    return {
      ...rawCurrentCandle,
      close: currentPrice,
      high: Math.max(rawCurrentCandle.high, currentPrice),
      low: Math.min(rawCurrentCandle.low, currentPrice),
    };
  }, [rawCurrentCandle, orderbookState?.lastPrice]);
  
  // Last closed candle doesn't need price adjustment - it's complete
  const lastClosedCandle = rawLastClosedCandle;
  
  // Measure arena height on mount and resize
  useEffect(() => {
    if (!arenaRef.current) return;
    
    const updateHeight = () => {
      if (arenaRef.current) {
        setArenaHeight(arenaRef.current.clientHeight);
      }
    };
    
    // Initial measurement
    updateHeight();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(arenaRef.current);
    
    return () => resizeObserver.disconnect();
  }, []);
  
  // Calculate price range and positioning
  const { minPrice, maxPrice, centerPrice } = useMemo(() => {
    if (!orderbookState) {
      return { minPrice: null, maxPrice: null, centerPrice: null };
    }

    const { bids = [], asks = [], lastPrice } = orderbookState;
    
    // Get all prices
    const allPrices = [
      ...bids.map(b => b.price),
      ...asks.map(a => a.price),
      lastPrice,
    ].filter(p => p != null);

    if (allPrices.length === 0) {
      return { minPrice: null, maxPrice: null, centerPrice: lastPrice };
    }

    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    // Add padding to price range for better visualization
    const padding = (max - min) * 0.1;
    
    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      centerPrice: lastPrice,
    };
  }, [orderbookState]);

  // Extract bids and asks with safe defaults
  const bids = orderbookState?.bids || [];
  const asks = orderbookState?.asks || [];
  const lastPrice = orderbookState?.lastPrice;
  
  // Debug: Log the full orderbook data to see what we're receiving
  if (process.env.NODE_ENV === 'development' && orderbookState) {
    console.log('Full orderbook state received:', {
      bidsCount: bids.length,
      asksCount: asks.length,
      allBids: bids,
      allAsks: asks,
      lastPrice,
      timestamp: orderbookState.timestamp,
    });
  }
  
  // Fallback: if lastPrice is null but we have price data, use midpoint or first available price
  const effectiveLastPrice = useMemo(() => {
    if (lastPrice != null) {
      return lastPrice;
    }
    // If no lastPrice but we have bids/asks, use the first bid price or ask price
    if (bids.length > 0 && bids[0]?.price != null) {
      return bids[0].price;
    }
    if (asks.length > 0 && asks[0]?.price != null) {
      return asks[0].price;
    }
    // Use midpoint of min/max if available
    if (minPrice != null && maxPrice != null) {
      return (minPrice + maxPrice) / 2;
    }
    return null;
  }, [lastPrice, bids, asks, minPrice, maxPrice]);

  // Limit number of price levels displayed for performance (show top 25 each)
  // Always call these hooks, even if orderbookState is null
  const limitedBids = useMemo(() => {
    if (!Array.isArray(bids)) return [];
    return bids.slice(0, 25);
  }, [bids]);
  
  const limitedAsks = useMemo(() => {
    if (!Array.isArray(asks)) return [];
    return asks.slice(0, 25);
  }, [asks]);

  // Calculate horizontal position for a price level based on distance from center
  // Center (50%) = effectiveLastPrice
  // Left (< 50%) = prices below effectiveLastPrice (buyers)
  // Right (> 50%) = prices above effectiveLastPrice (sellers)
  // This must be a stable callback to avoid hook order issues
  const getPositionFromCenter = useCallback((price) => {
    if (!effectiveLastPrice || !minPrice || !maxPrice || minPrice === maxPrice) {
      return 50; // Center if no range
    }
    
    // Calculate range relative to center (effectiveLastPrice)
    const leftRange = effectiveLastPrice - minPrice;  // Distance to leftmost price
    const rightRange = maxPrice - effectiveLastPrice; // Distance to rightmost price
    const maxRange = Math.max(leftRange, rightRange, 0.01); // Ensure non-zero range
    
    // Create symmetric range centered on effectiveLastPrice
    const scaleMin = effectiveLastPrice - maxRange * 1.1;
    const scaleMax = effectiveLastPrice + maxRange * 1.1;
    const totalRange = scaleMax - scaleMin;
    
    // Convert price to percentage position (0% = scaleMin, 50% = effectiveLastPrice, 100% = scaleMax)
    const position = ((price - scaleMin) / totalRange) * 100;
    return Math.max(0, Math.min(100, position));
  }, [effectiveLastPrice, minPrice, maxPrice]);

  // Combine all price levels and sort by price
  // ALWAYS call this hook, even when data is missing
  const allPriceLevels = useMemo(() => {
    const levels = [];
    
    // Safety check - return empty array if no data
    if (!Array.isArray(limitedAsks) || !Array.isArray(limitedBids)) {
      return [];
    }
    
    // Add asks (sellers) - prices above lastPrice
    limitedAsks.forEach((ask) => {
      if (ask && typeof ask.price === 'number' && typeof ask.volume === 'number') {
        levels.push({
          price: ask.price,
          volume: ask.volume,
          side: 'ask',
          isBuyer: false,
        });
      }
    });
    
    // Add bids (buyers) - prices below lastPrice
    limitedBids.forEach((bid) => {
      if (bid && typeof bid.price === 'number' && typeof bid.volume === 'number') {
        levels.push({
          price: bid.price,
          volume: bid.volume,
          side: 'bid',
          isBuyer: true,
        });
      }
    });
    
    // Sort by price (lowest to highest)
    return levels.sort((a, b) => a.price - b.price);
  }, [limitedAsks, limitedBids]);

  // Group by price position - cluster players at similar prices (like yard lines on a football field)
  // Group positions within 0.5% of each other to create natural clumps
  // ALWAYS call this hook, even when data is missing
  const groupedLevels = useMemo(() => {
    // Safety checks - return empty array if no data
    if (!effectiveLastPrice || !minPrice || !maxPrice || minPrice === maxPrice || !Array.isArray(allPriceLevels) || allPriceLevels.length === 0) {
      return [];
    }
    
    // Sort all levels by position
    const sortedLevels = allPriceLevels.map(level => ({
      ...level,
      position: getPositionFromCenter(level.price),
    })).sort((a, b) => a.position - b.position);
    
    // Group levels that are close together (within 0.5% position)
    const groups = [];
    let currentGroup = null;
    const clusterThreshold = 0.5; // 0.5% position difference
    
    sortedLevels.forEach((level) => {
      if (!currentGroup || Math.abs(level.position - currentGroup.position) > clusterThreshold) {
        // Start a new group
        currentGroup = {
          position: level.position,
          levels: [level],
        };
        groups.push(currentGroup);
      } else {
        // Add to existing group, use average position
        const totalPosition = currentGroup.position * currentGroup.levels.length + level.position;
        currentGroup.levels.push(level);
        currentGroup.position = totalPosition / currentGroup.levels.length;
      }
    });
    
    // Sort levels within each group by volume (highest first)
    groups.forEach(group => {
      group.levels.sort((a, b) => b.volume - a.volume);
    });
    
    return groups.sort((a, b) => a.position - b.position);
  }, [allPriceLevels, getPositionFromCenter, effectiveLastPrice, minPrice, maxPrice]);

  // Create a stable string representation of bids/asks to detect actual changes
  const bidsAsksKey = useMemo(() => {
    if (!Array.isArray(bids) || !Array.isArray(asks)) return '';
    // Create a simple hash based on length and first/last prices to detect meaningful changes
    const bidsKey = bids.length > 0 ? `${bids.length}-${bids[0]?.price}-${bids[bids.length - 1]?.price}` : '0';
    const asksKey = asks.length > 0 ? `${asks.length}-${asks[0]?.price}-${asks[asks.length - 1]?.price}` : '0';
    return `${bidsKey}|${asksKey}`;
  }, [bids, asks]);

  // Calculate the shared scale range used by PriceScale, field lines, and volume intervals
  // This ensures all components use the same positioning
  const scaleRange = useMemo(() => {
    if (!effectiveLastPrice || !minPrice || !maxPrice || minPrice === maxPrice) {
      return { scaleMin: null, scaleMax: null, roundedCenter: null };
    }

    const increment = priceIncrement;
    // Round the last price to the nearest tick mark (this becomes the centerline)
    const roundedCenter = Math.round(effectiveLastPrice / increment) * increment;
    
    // Set to exactly 8 increments per side for consistent scale and readability
    const incrementsPerSide = 8;
    
    // Center the scale around the roundedCenter (tick mark), not the actual price
    // This ensures the centerline is always at a tick mark (50% position)
    // The actual lastPrice will move left/right from this centerline
    const rangeHalfWidth = incrementsPerSide * increment;
    const scaleMin = roundedCenter - rangeHalfWidth;
    const scaleMax = roundedCenter + rangeHalfWidth;
    
    return { scaleMin, scaleMax, roundedCenter };
  }, [effectiveLastPrice, minPrice, maxPrice, priceIncrement]);

  // Calculate volume for each price interval using ALL orders (not just limited)
  // Uses the shared scaleRange to ensure alignment with PriceScale
  // IMPORTANT: Keeps buyer and seller volumes SEPARATE to avoid mixing on centerline
  const intervalVolumes = useMemo(() => {
    if (!scaleRange.scaleMin || !scaleRange.scaleMax) {
      return new Map();
    }

    // Use full bids and asks arrays, not limited ones
    if (!Array.isArray(bids) || !Array.isArray(asks)) {
      return new Map();
    }

    const increment = priceIncrement;
    const { scaleMin, scaleMax, roundedCenter } = scaleRange;
    const totalRange = scaleMax - scaleMin;
    
    // Define no-man's-land buffer zone around center (in price units)
    // This creates space around the midline where no icons appear
    const bufferZone = increment * 0.75; // 75% of one increment on each side
    
    const priceToPosition = (price) => {
      if (totalRange === 0) return 50;
      return ((price - scaleMin) / totalRange) * 100;
    };

    // Generate intervals at fixed increments (matching field lines)
    const volumes = new Map();
    
    // Debug: log the range we're checking
    if (process.env.NODE_ENV === 'development') {
      // Find actual min/max from all orders
      const allPrices = [
        ...bids.map(b => b.price),
        ...asks.map(a => a.price)
      ];
      const actualMin = allPrices.length > 0 ? Math.min(...allPrices) : null;
      const actualMax = allPrices.length > 0 ? Math.max(...allPrices) : null;
      
      console.log('Interval calculation:', {
        scaleMin,
        scaleMax,
        minPrice,
        maxPrice,
        roundedCenter,
        bufferZone,
        bidsCount: bids.length,
        asksCount: asks.length,
        actualMinPrice: actualMin,
        actualMaxPrice: actualMax,
        priceRange: actualMin && actualMax ? (actualMax - actualMin).toFixed(2) : null,
      });
    }
    
    // Start from scaleMin + increment to align with PriceScale ticks (avoid leftmost tick)
    // End before scaleMax to avoid rightmost tick being cut off
    for (let price = scaleMin + increment; price < scaleMax; price += increment) {
      const roundedPrice = Math.round(price * 100) / 100;
      
      // Skip intervals in the no-man's-land buffer zone around center
      if (Math.abs(roundedPrice - roundedCenter) < bufferZone) {
        continue;
      }
      
      const intervalStart = roundedPrice;
      const intervalEnd = roundedPrice + increment;
      
      // Determine which side of center this interval is on
      const isLeftSide = roundedPrice < roundedCenter;
      
      // ONLY aggregate volume from the correct side
      let sideVolume = 0;
      let matchedOrders = 0;
      
      if (isLeftSide) {
        // Left side = buyers only
        bids.forEach((bid) => {
          if (bid && typeof bid.price === 'number' && typeof bid.volume === 'number') {
            if (bid.price >= intervalStart && bid.price < intervalEnd) {
              sideVolume += bid.volume;
              matchedOrders++;
            }
          }
        });
      } else {
        // Right side = sellers only
        asks.forEach((ask) => {
          if (ask && typeof ask.price === 'number' && typeof ask.volume === 'number') {
            if (ask.price >= intervalStart && ask.price < intervalEnd) {
              sideVolume += ask.volume;
              matchedOrders++;
            }
          }
        });
      }
      
      // Include interval if it has volume on the correct side
      if (sideVolume > 0) {
        const position = priceToPosition(roundedPrice);
        volumes.set(roundedPrice, {
          volume: sideVolume,
          position: position,
          isLeft: isLeftSide,
        });
        
        // Debug log for intervals with volume
        if (process.env.NODE_ENV === 'development') {
          console.log(`Interval ${intervalStart}-${intervalEnd}: volume=${sideVolume.toFixed(4)}, side=${isLeftSide ? 'buyers' : 'sellers'}, orders=${matchedOrders}, position=${position.toFixed(2)}%`);
        }
      }
    }
    
    return volumes;
  }, [scaleRange, bidsAsksKey, bids, asks, priceIncrement]);

  // Memoize sorted entries for stable rendering
  const sortedIntervalEntries = useMemo(() => {
    if (intervalVolumes.size === 0) return [];
    return Array.from(intervalVolumes.entries()).sort((a, b) => a[0] - b[0]);
  }, [intervalVolumes]);

  // Reset centerline tracking when price spacing changes
  useEffect(() => {
    previousCenterRef.current = null;
  }, [priceIncrement]);

  // Detect when centerline shifts and trigger laser animation
  useEffect(() => {
    if (scaleRange.roundedCenter == null) return;
    
    const currentCenter = scaleRange.roundedCenter;
    const prevCenter = previousCenterRef.current;
    
    // Initialize on first run or after price spacing change
    if (prevCenter === null) {
      previousCenterRef.current = currentCenter;
      return;
    }
    
    // Check if center has shifted (price crossed a tick boundary)
    if (currentCenter !== prevCenter && sortedIntervalEntries.length > 0) {
      // Determine which side won (price moved toward them)
      const priceMovedRight = currentCenter > prevCenter; // Buyers winning (price rising)
      
      // Find frontmost columns (closest to center on each side)
      let leftmostColumn = null;
      let rightmostColumn = null;
      
      sortedIntervalEntries.forEach(([price, data]) => {
        if (data.isLeft) {
          // Left side buyer - find the rightmost (closest to center)
          if (!leftmostColumn || data.position > leftmostColumn.position) {
            leftmostColumn = { price, ...data };
          }
        } else {
          // Right side seller - find the leftmost (closest to center)
          if (!rightmostColumn || data.position < rightmostColumn.position) {
            rightmostColumn = { price, ...data };
          }
        }
      });
      
      // Trigger animation if we have both sides
      if (leftmostColumn && rightmostColumn) {
        const winningSide = priceMovedRight ? 'buyers' : 'sellers';
        const attackerColumn = priceMovedRight ? leftmostColumn : rightmostColumn;
        const victimColumn = priceMovedRight ? rightmostColumn : leftmostColumn;
        
        setLaserAnimation({
          winningSide,
          attackerPosition: attackerColumn.position,
          victimPosition: victimColumn.position,
          victimPrice: victimColumn.price,
          timestamp: Date.now(),
        });
        
        // Clear animation after completion (0.5s laser + 1s blink/fade)
        setTimeout(() => {
          setLaserAnimation(null);
        }, 1500);
      }
    }
    
    previousCenterRef.current = currentCenter;
  }, [scaleRange.roundedCenter, sortedIntervalEntries]);

  // Calculate dynamic scale based on max volume and available height
  const { maxVolume, volumePerIcon, maxIconCount } = useMemo(() => {
    if (sortedIntervalEntries.length === 0 || arenaHeight === 0) {
      return { maxVolume: 0, volumePerIcon: 0.1, maxIconCount: 0 };
    }
    
    // Find maximum volume across all intervals
    const max = Math.max(...sortedIntervalEntries.map(([_, data]) => data.volume));
    
    // Calculate how many icons can fit vertically (accounting for icon size and gap)
    // Each icon is ~24px tall (w-6 h-6) + 4px gap (gap-1) = ~28px per icon
    // Leave some padding at top/bottom (~40px total)
    const iconHeight = 28; // pixels per icon including gap
    const padding = 40;
    const availableHeight = Math.max(arenaHeight - padding, 200); // Minimum 200px
    const maxIcons = Math.floor(availableHeight / iconHeight);
    
    // Calculate volume per icon so that max volume fills ~70% of available space
    // This leaves some headroom and prevents touching the top
    const targetMaxIcons = Math.max(Math.floor(maxIcons * 0.7), 10); // At least 10 icons for max
    
    // Since we're splitting into 2 columns, each icon should represent half the volume
    // to maintain the same maximum height (2 columns * half volume per icon = same total)
    const volPerIcon = max > 0 ? max / (targetMaxIcons * 2) : 0.1;
    
    return {
      maxVolume: max,
      volumePerIcon: volPerIcon,
      maxIconCount: targetMaxIcons,
    };
  }, [sortedIntervalEntries, arenaHeight]);

  // NOW we can do conditional returns after all hooks
  if (!orderbookState) {
    return (
      <div className="flex items-center justify-center h-full text-arcade-gray">
        Waiting for orderbook data...
      </div>
    );
  }

  // Validate data structure
  if (!Array.isArray(bids) || !Array.isArray(asks)) {
    return (
      <div className="flex items-center justify-center h-full text-arcade-red">
        Invalid orderbook data structure
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-arcade-dark flex flex-col">
      {/* Price Scale Header - always show if we have any price data */}
      <div className="flex-shrink-0 relative">
        {effectiveLastPrice && minPrice != null && maxPrice != null && scaleRange.scaleMin != null ? (
          <PriceScale
            lastPrice={effectiveLastPrice}
            minPrice={minPrice}
            maxPrice={maxPrice}
            increment={priceIncrement}
            scaleMin={scaleRange.scaleMin}
            scaleMax={scaleRange.scaleMax}
          />
        ) : (
          <div className="relative w-full h-16 border-b-2 border-arcade-white bg-arcade-dark flex items-center justify-center">
            <div className="text-arcade-gray text-xs font-arcade">Waiting for price data...</div>
          </div>
        )}
      </div>
      
      {/* Controls Panel */}
      <div className="flex-shrink-0 bg-arcade-dark border-b border-arcade-gray/30 px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Price Spacing Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-arcade text-arcade-gray">Price Spacing:</span>
            <div className="flex gap-2">
              {[0.01, 0.1, 1, 5, 10, 100, 1000, 10000].map((increment) => (
                <button
                  key={increment}
                  onClick={() => setPriceIncrement(increment)}
                  className={`px-3 py-1 text-xs font-arcade rounded transition-colors ${
                    priceIncrement === increment
                      ? 'bg-arcade-yellow text-arcade-dark'
                      : 'bg-arcade-gray/20 text-arcade-gray hover:bg-arcade-gray/30'
                  }`}
                >
                  ${increment >= 1000 ? `${increment / 1000}k` : increment}
                </button>
              ))}
            </div>
          </div>
          
          {/* Candle Timeframe Controls */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col text-right">
              <span className="text-xs font-arcade text-arcade-gray">Last Candle:</span>
              <span className="text-xs font-arcade text-arcade-gray">Current Candle:</span>
            </div>
            <div className="flex gap-2">
              {[
                { label: '1m', value: 1 },
                { label: '5m', value: 5 },
                { label: '15m', value: 15 },
                { label: '1hr', value: 60 },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setCandleTimeframe(value)}
                  className={`px-3 py-1 text-xs font-arcade rounded transition-colors ${
                    candleTimeframe === value
                      ? 'bg-arcade-blue text-arcade-dark'
                      : 'bg-arcade-gray/20 text-arcade-gray hover:bg-arcade-gray/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <img src={candlesticksIcon} alt="candlestick" className="h-6 w-auto opacity-70" />
          </div>
        </div>
      </div>
      
      {/* Football Field - unified visualization area */}
      <div ref={arenaRef} className="relative flex-1 overflow-auto bg-arcade-dark">
        {/* Candle Display - at the very top, showing both last closed and current candles */}
        {currentCandle && scaleRange.scaleMin != null && scaleRange.scaleMax != null && (
          <CandleDisplay
            currentCandle={currentCandle}
            lastClosedCandle={lastClosedCandle}
            scaleMin={scaleRange.scaleMin}
            scaleMax={scaleRange.scaleMax}
            priceIncrement={priceIncrement}
            centerPrice={effectiveLastPrice}
          />
        )}
        
        {/* Show message if no data */}
        {(!effectiveLastPrice || !minPrice || !maxPrice || minPrice === maxPrice || groupedLevels.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center z-30">
            <div className="text-arcade-gray text-sm font-arcade">
              {!effectiveLastPrice ? 'Waiting for orderbook data...' : groupedLevels.length === 0 ? 'No orders to display' : 'Calculating positions...'}
            </div>
          </div>
        )}
        {/* Football field lines - extending from scale tick marks */}
        {scaleRange.scaleMin != null && scaleRange.scaleMax != null && (() => {
          const increment = priceIncrement;
          const { scaleMin, scaleMax, roundedCenter } = scaleRange;
          const totalRange = scaleMax - scaleMin;
          
          const priceToPosition = (price) => {
            if (totalRange === 0) return 50;
            return ((price - scaleMin) / totalRange) * 100;
          };
          
          // Generate field lines at fixed increments (matching PriceScale)
          const fieldLines = [];
          // Calculate a buffer to prevent lines from overlapping with the edge (match PriceScale)
          const edgeBuffer = Math.min(totalRange * 0.005, increment);
          const effectiveMax = scaleMax - edgeBuffer;
          // Start from scaleMin + increment to avoid the leftmost line being cut off
          // End before effectiveMax to avoid the rightmost line being cut off (match PriceScale)
          for (let price = scaleMin + increment; price < effectiveMax; price += increment) {
            const roundedPrice = Math.round(price * 100) / 100;
            if (roundedPrice >= minPrice - increment && roundedPrice <= maxPrice + increment) {
              const isCenter = Math.abs(roundedPrice - roundedCenter) < increment / 2;
              const isLeft = roundedPrice < roundedCenter;
              
              fieldLines.push({
                price: roundedPrice,
                position: priceToPosition(roundedPrice),
                isLeft,
                isCenter,
              });
            }
          }
          
          return (
            <>
              {/* Field lines */}
              {fieldLines.map((line, index) => {
                if (line.isCenter) {
                  return (
                    <div
                      key="center-line"
                      className="absolute top-0 bottom-0 w-0.5 bg-arcade-yellow/40 z-5"
                      style={{ left: '50%', transform: 'translateX(-50%)' }}
                    />
                  );
                }
                
                const lineColor = line.isLeft ? 'bg-arcade-red/15' : 'bg-arcade-blue/15';
                return (
                  <div
                    key={`field-line-${line.price}`}
                    className={`absolute top-0 bottom-0 w-px ${lineColor} pointer-events-none z-5`}
                    style={{ left: `${line.position}%`, transform: 'translateX(-50%)' }}
                  />
                );
              })}
            </>
          );
        })()}
        
        {/* Death Zone - when price scale includes $0 or negative prices */}
        {scaleRange.scaleMin != null && scaleRange.scaleMax != null && scaleRange.scaleMin < 0 && (() => {
          const { scaleMin, scaleMax } = scaleRange;
          const totalRange = scaleMax - scaleMin;
          
          const priceToPosition = (price) => {
            if (totalRange === 0) return 50;
            return ((price - scaleMin) / totalRange) * 100;
          };
          
          // Calculate position of $0
          const zeroPosition = priceToPosition(0);
          
          // Only show if $0 is actually visible on screen (within bounds)
          if (zeroPosition >= 0 && zeroPosition <= 100) {
            return (
              <>
                {/* Shaded area to the left of $0 */}
                <div
                  className="absolute top-0 bottom-0 death-zone-pattern pointer-events-none z-8"
                  style={{
                    left: '0%',
                    width: `${zeroPosition}%`,
                  }}
                />
                
                {/* Red line at $0 */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-arcade-red pointer-events-none z-12"
                  style={{
                    left: `${zeroPosition}%`,
                    transform: 'translateX(-50%)',
                    boxShadow: '0 0 8px rgba(255, 0, 64, 0.8)',
                  }}
                />
                
                {/* DEATH ZONE text */}
                <div
                  className="absolute pointer-events-none z-12"
                  style={{
                    left: `${zeroPosition * 0.5}%`,
                    top: '20%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="bg-arcade-dark/90 border-2 border-arcade-red px-4 py-2">
                    <div className="text-arcade-red text-xl font-arcade font-bold uppercase tracking-wider whitespace-nowrap">
                      ⚠ DEATH ZONE ⚠
                    </div>
                  </div>
                </div>
              </>
            );
          }
          return null;
        })()}
        
        {/* Volume icon columns - aligned with price scale ticks */}
        {effectiveLastPrice && minPrice && maxPrice && sortedIntervalEntries.length > 0 && volumePerIcon > 0 && (
          <div key={`volume-columns-${priceIncrement}`}>
            {sortedIntervalEntries.map(([price, { volume, position, isLeft }]) => {
              // Calculate total number of icons based on dynamic scale
              const totalIconCount = Math.max(2, Math.floor(volume / volumePerIcon));
              
              // Split icons into 2 columns: 60% in front (center), 40% in back
              const frontColumnCount = Math.ceil(totalIconCount * 0.6);
              const backColumnCount = Math.floor(totalIconCount * 0.4);
              
              // Use full price precision and increment in key to avoid collisions and force reset on increment change
              const columnKey = `col-${priceIncrement}-${price.toFixed(4)}`;
              
              // Check if this column is under attack
              const isVictim = laserAnimation && Math.abs(price - laserAnimation.victimPrice) < 0.01;
              
              // Debug log for rendering
              if (process.env.NODE_ENV === 'development') {
                console.log(`Rendering columns at price ${price}, position ${position.toFixed(2)}%, volume ${volume.toFixed(4)}, front ${frontColumnCount}, back ${backColumnCount}, volumePerIcon ${volumePerIcon.toFixed(4)}`);
              }
              
              return (
                <div
                  key={columnKey}
                  className="absolute pointer-events-none z-15"
                  style={{ 
                    left: `${position}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {/* Two columns side by side - order depends on which side of center */}
                  <div className="flex items-center justify-center gap-1">
                    {isLeft ? (
                      // Left side (buyers): back column on left, front column toward center (right)
                      <>
                        {/* Back column (further from center) */}
                        <div className="flex flex-col items-center justify-center gap-1">
                          {Array.from({ length: backColumnCount }).map((_, i) => (
                            <img
                              key={`${columnKey}-back-${i}`}
                              src={pacManIcon}
                              alt="buyer"
                              className={`w-6 h-6 inline-block ${isVictim ? 'dying-icon' : ''}`}
                            />
                          ))}
                        </div>
                        
                        {/* Front column (closer to center) */}
                        <div className="flex flex-col items-center justify-center gap-1">
                          {Array.from({ length: frontColumnCount }).map((_, i) => (
                            <img
                              key={`${columnKey}-front-${i}`}
                              src={pacManIcon}
                              alt="buyer"
                              className={`w-6 h-6 inline-block ${isVictim ? 'dying-icon' : ''}`}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      // Right side (sellers): front column toward center (left), back column on right
                      <>
                        {/* Front column (closer to center) */}
                        <div className="flex flex-col items-center justify-center gap-1">
                          {Array.from({ length: frontColumnCount }).map((_, i) => (
                            <img
                              key={`${columnKey}-front-${i}`}
                              src={spaceInvaderIcon}
                              alt="seller"
                              className={`w-6 h-6 inline-block ${isVictim ? 'dying-icon' : ''}`}
                            />
                          ))}
                        </div>
                        
                        {/* Back column (further from center) */}
                        <div className="flex flex-col items-center justify-center gap-1">
                          {Array.from({ length: backColumnCount }).map((_, i) => (
                            <img
                              key={`${columnKey}-back-${i}`}
                              src={spaceInvaderIcon}
                              alt="seller"
                              className={`w-6 h-6 inline-block ${isVictim ? 'dying-icon' : ''}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Laser beams - when centerline shifts */}
        {laserAnimation && (
          <div className="absolute inset-0 pointer-events-none z-20">
            {/* Horizontal laser beam from attacker to victim */}
            <div
              className="absolute top-1/2"
              style={{
                left: `${Math.min(laserAnimation.attackerPosition, laserAnimation.victimPosition)}%`,
                width: `${Math.abs(laserAnimation.victimPosition - laserAnimation.attackerPosition)}%`,
                transform: 'translateY(-50%)',
              }}
            >
              <div 
                className={`laser-beam ${laserAnimation.winningSide === 'buyers' ? 'laser-red' : 'laser-blue'}`}
                style={{
                  height: '2px',
                  boxShadow: `0 0 10px ${laserAnimation.winningSide === 'buyers' ? '#ff4444' : '#4444ff'}`,
                }}
              />
            </div>
          </div>
        )}
        
        {/* Center line (yard line 50) - prominent */}
        {effectiveLastPrice && (
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-arcade-yellow z-10"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          />
        )}
      </div>
      
      {/* Legend - lower left corner */}
      {volumePerIcon > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-arcade-dark">
          <div className="text-sm font-arcade font-bold text-arcade-gray flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src={pacManIcon} alt="buyer" className="w-5 h-5" />
              <span className="text-arcade-red">Buyers</span>
            </div>
            <div className="flex items-center gap-2">
              <img src={spaceInvaderIcon} alt="seller" className="w-5 h-5" />
              <span className="text-arcade-blue">Sellers</span>
            </div>
            <div className="border-l border-arcade-gray/30 pl-4">
              <span>Each icon = {volumePerIcon >= 1 ? volumePerIcon.toFixed(2) : volumePerIcon.toFixed(4)} volume</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(OrderbookView);
