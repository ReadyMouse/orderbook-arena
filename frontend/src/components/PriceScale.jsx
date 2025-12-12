import { useMemo, memo, useState, useEffect } from 'react';

/**
 * Price scale component that displays a horizontal scale centered on the last sale price
 * Left side shows negative values (buyers/bids below current price)
 * Right side shows positive values (sellers/asks above current price)
 * 
 * The scale remains fixed until the current price deviates by more than the threshold
 * from the fixed center, preventing flashing on each update.
 * 
 * @param {Object} props
 * @param {number|null} props.lastPrice - Last traded price (center of scale)
 * @param {number|null} props.minPrice - Minimum price in the orderbook
 * @param {number|null} props.maxPrice - Maximum price in the orderbook
 * @param {number} props.increment - Fixed increment for tick marks (default: 10)
 * @param {number} props.deviationThreshold - Price deviation threshold to recenter scale (default: 5)
 */

function PriceScale({ lastPrice, minPrice, maxPrice, increment = 10, deviationThreshold = 5 }) {
  // Track the fixed scale center and range - only updates when price deviates beyond threshold
  const [fixedScaleCenter, setFixedScaleCenter] = useState(null);
  const [fixedScaleRange, setFixedScaleRange] = useState({ scaleMin: null, scaleMax: null });

  // Update fixed scale center when price deviates beyond threshold
  useEffect(() => {
    if (!lastPrice) return;

    const roundedCurrentCenter = Math.round(lastPrice / increment) * increment;

    // Initialize fixed center and range if not set
    if (fixedScaleCenter === null) {
      // Calculate initial range based on available data or use defaults
      const initialIncrementsPerSide = 10; // Show 10 increments on each side initially
      const initialScaleMin = roundedCurrentCenter - (initialIncrementsPerSide * increment);
      const initialScaleMax = roundedCurrentCenter + (initialIncrementsPerSide * increment);
      
      setFixedScaleCenter(roundedCurrentCenter);
      setFixedScaleRange({ scaleMin: initialScaleMin, scaleMax: initialScaleMax });
      return;
    }

    // Check if current price deviates by more than threshold from fixed center
    const deviation = Math.abs(lastPrice - fixedScaleCenter);
    if (deviation > deviationThreshold) {
      // Recenter the scale - keep the same range size
      setFixedScaleRange(prevRange => {
        if (prevRange.scaleMin === null || prevRange.scaleMax === null) {
          // Fallback if range not set
          const incrementsPerSide = 10;
          return {
            scaleMin: roundedCurrentCenter - (incrementsPerSide * increment),
            scaleMax: roundedCurrentCenter + (incrementsPerSide * increment),
          };
        }
        
        const currentRange = prevRange.scaleMax - prevRange.scaleMin;
        const incrementsPerSide = Math.ceil((currentRange / 2) / increment);
        
        return {
          scaleMin: roundedCurrentCenter - (incrementsPerSide * increment),
          scaleMax: roundedCurrentCenter + (incrementsPerSide * increment),
        };
      });
      
      setFixedScaleCenter(roundedCurrentCenter);
    }
  }, [lastPrice, increment, deviationThreshold, fixedScaleCenter]);

  // Calculate tick marks using fixed scale range
  const { ticks } = useMemo(() => {
    if (fixedScaleCenter === null || fixedScaleRange.scaleMin === null || fixedScaleRange.scaleMax === null) {
      return { ticks: [] };
    }

    const roundedCenter = fixedScaleCenter;
    const scaleMin = fixedScaleRange.scaleMin;
    const scaleMax = fixedScaleRange.scaleMax;
    const totalRange = scaleMax - scaleMin;

    // Helper function to convert price to position percentage
    const priceToPosition = (price) => {
      if (totalRange === 0) return 50;
      return ((price - scaleMin) / totalRange) * 100;
    };

    // Generate tick marks at fixed $increment intervals
    const ticks = [];
    
    // Generate ticks from scaleMin to scaleMax at increment intervals
    for (let price = scaleMin; price <= scaleMax; price += increment) {
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

    return { ticks };
  }, [fixedScaleCenter, fixedScaleRange, increment]);

  // Show loading only on initial mount when fixedScaleCenter is not set
  if (fixedScaleCenter === null || fixedScaleRange.scaleMin === null || fixedScaleRange.scaleMax === null || ticks.length === 0) {
    return (
      <div className="relative w-full h-14 border-b-2 border-arcade-white bg-arcade-dark z-20 flex items-center justify-center">
        <div className="text-arcade-gray text-xs font-arcade">Loading price scale...</div>
      </div>
    );
  }

  // Calculate position of current price on the fixed scale
  const scaleMin = fixedScaleRange.scaleMin;
  const scaleMax = fixedScaleRange.scaleMax;
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
        
        {/* Current price marker - Yellow line at actual current price position */}
        {lastPrice != null && (
          <div 
            className="absolute top-0 bottom-0 transform -translate-x-1/2 z-30"
            style={{ left: `${currentPricePosition}%` }}
          >
            {/* Yellow center line */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-arcade-yellow" />
            {/* Current price label */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              <div className="bg-arcade-yellow text-arcade-bg px-2 py-1 text-xs font-arcade font-bold">
                {lastPrice.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Ruler notches - extending in both directions from center */}
        {ticks.map((tick, index) => {
          const isLeft = tick.isLeft;
          const labelColor = isLeft ? 'text-arcade-blue' : 'text-arcade-red';
          const tickColor = isLeft ? 'bg-arcade-blue' : 'bg-arcade-red';
          
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
                className={`absolute left-1/2 transform -translate-x-1/2 text-[10px] font-arcade ${labelColor} whitespace-nowrap`}
                style={{ top: `${notchHeight + 4}px` }}
              >
                ${tick.price.toFixed(0)}
              </div>
            </div>
          );
        })}
        
        {/* Side labels */}
        {ticks.length > 0 && (
          <>
            <div className="absolute left-2 top-1 text-[10px] font-arcade uppercase text-arcade-blue whitespace-nowrap">
              BUYERS
            </div>
            <div className="absolute right-2 top-1 text-[10px] font-arcade uppercase text-arcade-red whitespace-nowrap">
              SELLERS
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(PriceScale);