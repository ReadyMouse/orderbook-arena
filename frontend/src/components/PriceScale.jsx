import { useMemo, memo } from 'react';

/**
 * Price scale component that displays a horizontal scale centered on the last sale price
 * Left side shows negative values (buyers/bids below current price)
 * Right side shows positive values (sellers/asks above current price)
 * 
 * @param {Object} props
 * @param {number|null} props.lastPrice - Last traded price (center of scale)
 * @param {number|null} props.minPrice - Minimum price in the orderbook
 * @param {number|null} props.maxPrice - Maximum price in the orderbook
 * @param {number} props.increment - Fixed increment for tick marks (default: 10)
 * @param {number|null} props.scaleMin - Fixed scale minimum (from parent)
 * @param {number|null} props.scaleMax - Fixed scale maximum (from parent)
 */

function PriceScale({ lastPrice, minPrice, maxPrice, increment = 10, scaleMin: propScaleMin, scaleMax: propScaleMax }) {
  // Use scale range provided by parent (synced with OrderbookView)
  // This ensures tick marks align with volume columns
  const scaleMin = propScaleMin;
  const scaleMax = propScaleMax;

  // Calculate tick marks using provided scale range
  const { ticks, roundedCenter, tickFontSize } = useMemo(() => {
    if (!lastPrice || scaleMin === null || scaleMax === null) {
      return { ticks: [], roundedCenter: null, tickFontSize: 'text-base' };
    }

    const roundedCenter = Math.round(lastPrice / increment) * increment;
    const totalRange = scaleMax - scaleMin;
    
    // Dynamic font sizing based on price magnitude
    // Count digits in the maximum price to determine appropriate font size
    const maxPrice = Math.max(Math.abs(scaleMin), Math.abs(scaleMax));
    const digitCount = Math.floor(Math.log10(maxPrice)) + 1;
    
    let tickFontSize = 'text-base'; // Default for prices < 3 digits ($0-$99)
    if (digitCount >= 6) {
      tickFontSize = 'text-[10px]'; // Very large numbers (100k+)
    } else if (digitCount >= 5) {
      tickFontSize = 'text-xs'; // Large numbers (10k-99k)
    } else if (digitCount >= 4) {
      tickFontSize = 'text-sm'; // Medium numbers (1k-9.9k)
    }

    // Helper function to convert price to position percentage
    const priceToPosition = (price) => {
      if (totalRange === 0) return 50;
      return ((price - scaleMin) / totalRange) * 100;
    };

    // Generate tick marks at fixed $increment intervals
    const ticks = [];
    
    // Calculate a buffer to prevent ticks from overlapping with the edge
    // Use 0.5% of the total range or one increment, whichever is smaller
    const edgeBuffer = Math.min(totalRange * 0.005, increment);
    const effectiveMax = scaleMax - edgeBuffer;
    
    // Generate ticks from scaleMin to scaleMax at increment intervals
    // Start from scaleMin + increment to avoid the leftmost tick being cut off
    // End before effectiveMax to avoid the rightmost tick being cut off
    for (let price = scaleMin + increment; price < effectiveMax; price += increment) {
      // Round to avoid floating point precision issues
      const roundedPrice = Math.round(price * 100) / 100;
      
      // Show all ticks in the fixed range (don't filter by minPrice/maxPrice to keep scale stable)
      const isLeft = roundedPrice < roundedCenter;
      
      ticks.push({
        price: roundedPrice,
        position: priceToPosition(roundedPrice),
        isLeft: isLeft,
      });
    }

    // Sort by position to ensure correct order
    ticks.sort((a, b) => a.position - b.position);

    return { ticks, roundedCenter, tickFontSize };
  }, [lastPrice, scaleMin, scaleMax, increment]);

  // Calculate dynamic font size for current price label (slightly larger than ticks)
  const currentPriceFontSize = useMemo(() => {
    if (!lastPrice) return 'text-sm';
    const digitCount = Math.floor(Math.log10(Math.abs(lastPrice))) + 1;
    
    if (digitCount >= 6) return 'text-xs';
    if (digitCount >= 5) return 'text-sm';
    if (digitCount >= 4) return 'text-sm';
    return 'text-base';
  }, [lastPrice]);

  // Show loading only when scale range is not available
  if (scaleMin === null || scaleMax === null || ticks.length === 0) {
    return (
      <div className="relative w-full h-14 border-b-2 border-arcade-white bg-arcade-dark z-20 flex items-center justify-center">
        <div className="text-arcade-gray text-xs font-arcade">Loading price scale...</div>
      </div>
    );
  }

  // Calculate position of current price on the scale
  const totalRange = scaleMax - scaleMin;
  const currentPricePosition = lastPrice && totalRange > 0 
    ? Math.max(0, Math.min(100, ((lastPrice - scaleMin) / totalRange) * 100))
    : 50;

  return (
    <div className="relative w-full">
      {/* Price Scale Header - Ruler Style */}
      <div className="relative w-full h-20 border-b-2 border-arcade-white bg-arcade-dark z-20" style={{ minHeight: '80px' }}>
        {/* Main ruler line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-arcade-white transform -translate-y-1/2" />
        
        {/* Current price marker - Yellow box at actual current price position (moves relative to centerline) */}
        {lastPrice != null && (
          <div 
            className="absolute top-0 bottom-0 transform -translate-x-1/2 z-30"
            style={{ left: `${currentPricePosition}%` }}
          >
            {/* Yellow line - only extends above the ruler line */}
            <div className="absolute top-0 bottom-1/2 w-0.5 bg-arcade-yellow" />
            {/* Current price label - always show cents when increment >= 1 */}
            <div className="absolute bottom-1/2 left-1/2 transform -translate-x-1/2 mb-6 whitespace-nowrap">
              <div className={`bg-arcade-yellow text-arcade-bg px-2 py-1 ${currentPriceFontSize} font-arcade font-bold`}>
                Last Price: ${lastPrice.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Ruler notches - extending in both directions from center */}
        {ticks.map((tick, index) => {
          // Check if this is the center tick
          const isCenter = roundedCenter !== null && Math.abs(tick.price - roundedCenter) < increment / 2;
          const isLeft = tick.isLeft;
          
          // Center tick is white, otherwise use side colors
          const labelColor = isCenter ? 'text-arcade-white' : (isLeft ? 'text-arcade-red' : 'text-arcade-blue');
          const tickColor = isCenter ? 'bg-arcade-white' : (isLeft ? 'bg-arcade-red' : 'bg-arcade-blue');
          
          // Calculate distance from center for notch height variation
          const distanceFromCenter = Math.abs(tick.position - 50);
          const notchHeight = distanceFromCenter < 10 ? 8 : distanceFromCenter < 20 ? 6 : 4;
          
          return (
            <div
              key={`tick-${tick.price}-${index}`}
              className="absolute top-1/2 transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${tick.position}%` }}
            >
              {/* Ruler notch - extends both above and below the line */}
              <div 
                className={`w-0.5 ${tickColor}`}
                style={{ 
                  height: `${notchHeight * 2}px`, 
                  marginTop: `-${notchHeight}px` 
                }}
              />
              
              {/* Price label below the line */}
              <div
                className={`absolute left-1/2 transform -translate-x-1/2 ${tickFontSize} font-arcade font-bold ${labelColor} whitespace-nowrap`}
                style={{ top: `${notchHeight + 4}px` }}
              >
                ${increment < 1 ? tick.price.toFixed(2) : tick.price.toFixed(0)}
              </div>
            </div>
          );
        })}
        
        {/* Side labels */}
        {ticks.length > 0 && (
          <>
            <div className="absolute left-2 top-1 text-sm font-arcade font-bold uppercase text-arcade-red whitespace-nowrap">
              BUYERS
            </div>
            <div className="absolute right-2 top-1 text-sm font-arcade font-bold uppercase text-arcade-blue whitespace-nowrap">
              SELLERS
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(PriceScale);