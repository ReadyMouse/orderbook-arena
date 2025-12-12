import { useMemo, useCallback, memo } from 'react';
import PriceColumn from './PriceColumn';
import Centerline from './Centerline';
import PriceScale from './PriceScale';

/**
 * Main container component for the orderbook visualization
 * 
 * This component displays the battle arena with:
 * - Sellers (asks) on the left side (red)
 * - Buyers (bids) on the right side (blue)
 * - Centerline representing the last traded price
 */

function OrderbookView({ orderbookState }) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // This ensures hooks are always called in the same order
  
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
        {effectiveLastPrice && minPrice != null && maxPrice != null ? (
          <PriceScale
            lastPrice={effectiveLastPrice}
            minPrice={minPrice}
            maxPrice={maxPrice}
            increment={10}
          />
        ) : (
          <div className="relative w-full h-16 border-b-2 border-arcade-white bg-arcade-dark flex items-center justify-center">
            <div className="text-arcade-gray text-xs font-arcade">Waiting for price data...</div>
          </div>
        )}
      </div>
      
      {/* Football Field - unified visualization area */}
      <div className="relative flex-1 overflow-auto bg-arcade-dark">
        {/* Debug info - remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute top-2 left-2 text-xs text-arcade-gray z-50 bg-arcade-dark/80 p-2">
            <div>lastPrice: {lastPrice?.toFixed(2) || 'null'}</div>
            <div>effectiveLastPrice: {effectiveLastPrice?.toFixed(2) || 'null'}</div>
            <div>minPrice: {minPrice?.toFixed(2) || 'null'}</div>
            <div>maxPrice: {maxPrice?.toFixed(2) || 'null'}</div>
            <div>bids: {bids.length}</div>
            <div>asks: {asks.length}</div>
            <div>groupedLevels: {groupedLevels.length}</div>
            <div>allPriceLevels: {allPriceLevels.length}</div>
          </div>
        )}
        
        {/* Show message if no data */}
        {(!effectiveLastPrice || !minPrice || !maxPrice || minPrice === maxPrice || groupedLevels.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center z-30">
            <div className="text-arcade-gray text-sm font-arcade">
              {!effectiveLastPrice ? 'Waiting for orderbook data...' : groupedLevels.length === 0 ? 'No orders to display' : 'Calculating positions...'}
            </div>
          </div>
        )}
        {/* Football field lines - extending from scale tick marks (using same $10 increments) */}
        {effectiveLastPrice && minPrice && maxPrice && (() => {
          const increment = 10; // Match PriceScale increment
          
          // Round center to nearest increment (same as PriceScale)
          const roundedCenter = Math.round(effectiveLastPrice / increment) * increment;
          
          // Calculate range needed
          const leftRange = effectiveLastPrice - minPrice;
          const rightRange = maxPrice - effectiveLastPrice;
          const maxRange = Math.max(leftRange, rightRange);
          const incrementsPerSide = Math.max(5, Math.ceil(maxRange / increment) + 2);
          
          const scaleMin = roundedCenter - (incrementsPerSide * increment);
          const scaleMax = roundedCenter + (incrementsPerSide * increment);
          const totalRange = scaleMax - scaleMin;
          
          const priceToPosition = (price) => {
            if (totalRange === 0) return 50;
            return ((price - scaleMin) / totalRange) * 100;
          };
          
          // Generate field lines at fixed $10 increments (matching PriceScale)
          const fieldLines = [];
          for (let price = scaleMin; price <= scaleMax; price += increment) {
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
          
          return fieldLines.map((line, index) => {
            if (line.isCenter) {
              return (
                <div
                  key="center-line"
                  className="absolute top-0 bottom-0 w-0.5 bg-arcade-yellow/40 z-5"
                  style={{ left: '50%', transform: 'translateX(-50%)' }}
                />
              );
            }
            
            const lineColor = line.isLeft ? 'bg-arcade-blue/15' : 'bg-arcade-red/15';
            return (
              <div
                key={`field-line-${line.price}`}
                className={`absolute top-0 bottom-0 w-px ${lineColor} pointer-events-none z-5`}
                style={{ left: `${line.position}%`, transform: 'translateX(-50%)' }}
              />
            );
          });
        })()}
        
        {/* Center line (yard line 50) - prominent */}
        {effectiveLastPrice && (
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-arcade-yellow z-10"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          />
        )}
        
        {/* Render all price levels as "players" on the field */}
        {groupedLevels.map((group, groupIndex) => {
          return group.levels.map((level, levelIndex) => {
            const isLeft = level.isBuyer; // Buyers on left, sellers on right
            const position = group.position;
            
            // Stack vertically within the same price group
            // Each PriceColumn is roughly 120-150px tall depending on volume
            // Start from top and stack down
            const verticalOffset = levelIndex * 120;
            
            return (
              <div
                key={`${level.side}-${level.price}-${levelIndex}`}
                className="absolute z-20"
                style={{
                  left: `${position}%`,
                  top: `${verticalOffset}px`,
                  transform: 'translateX(-50%)', // Center the player group on the position
                }}
              >
                <PriceColumn 
                  price={level.price} 
                  volume={level.volume} 
                  side={level.side}
                />
              </div>
            );
          });
        }).flat()}
      </div>
    </div>
  );
}

export default memo(OrderbookView);
