import { useMemo, memo, useRef, useEffect, useState, useCallback } from 'react';

// Calculate positions for a single candle (moved outside component to avoid recreation)
const calculateCandlePositions = (ohlcData, useScaleMin, useScaleMax) => {
  if (!ohlcData || useScaleMin == null || useScaleMax == null) {
    return null;
  }

  const { open, high, low, close } = ohlcData;
  const totalRange = useScaleMax - useScaleMin;

  if (totalRange === 0) {
    return null;
  }

  // Convert price to horizontal position (0-100%)
  const priceToPosition = (price) => {
    return ((price - useScaleMin) / totalRange) * 100;
  };

  const highPos = priceToPosition(high);
  const lowPos = priceToPosition(low);
  const openPos = priceToPosition(open);
  const closePos = priceToPosition(close);

  // Body is between open and close
  const bodyLeft = Math.min(openPos, closePos);
  const bodyRight = Math.max(openPos, closePos);
  const bodyWidth = bodyRight - bodyLeft;

  // Determine color (green if close > open, red otherwise)
  const isBullish = close >= open;

  return {
    highPos,
    lowPos,
    openPos,
    closePos,
    bodyLeft,
    bodyRight,
    bodyWidth,
    isBullish,
  };
};

/**
 * CandleDisplay Component
 * 
 * Displays two stacked horizontal (sideways) candlesticks at the top of the arena:
 * - Top: Last closed/completed candle
 * - Bottom: Current in-progress candle
 * Both aligned with the price scale
 * 
 * @param {Object} currentCandle - Current (in-progress) OHLC data
 * @param {Object} lastClosedCandle - Last completed OHLC data (optional)
 * @param {Number} scaleMin - Minimum price on the scale (for current candle)
 * @param {Number} scaleMax - Maximum price on the scale (for current candle)
 * @param {Number} priceIncrement - Price increment used for the scale
 * @param {Number} centerPrice - Center price (for reference)
 */
function CandleDisplay({ currentCandle, lastClosedCandle, scaleMin, scaleMax, priceIncrement, centerPrice }) {
  // Track the wick range (high/low) for the current candle
  // Only update when price exceeds these bounds
  const [wickRange, setWickRange] = useState({ high: null, low: null, candleTime: null });
  const prevCandleTimeRef = useRef(null);
  
  // Update wick range only when current price exceeds existing high/low or candle changes
  useEffect(() => {
    if (!currentCandle) return;
    
    const currentHigh = currentCandle.high;
    const currentLow = currentCandle.low;
    const currentTime = currentCandle.time;
    
    // Reset if this is a new candle (different time)
    if (prevCandleTimeRef.current !== currentTime) {
      prevCandleTimeRef.current = currentTime;
      setWickRange({
        high: currentHigh,
        low: currentLow,
        candleTime: currentTime,
      });
      return;
    }
    
    // Only update if price exceeds existing bounds
    setWickRange(prev => {
      let updated = false;
      let newHigh = prev.high;
      let newLow = prev.low;
      
      if (currentHigh > prev.high) {
        newHigh = currentHigh;
        updated = true;
      }
      if (currentLow < prev.low) {
        newLow = currentLow;
        updated = true;
      }
      
      if (updated) {
        return {
          high: newHigh,
          low: newLow,
          candleTime: currentTime,
        };
      }
      return prev;
    });
  }, [currentCandle]);

  // Calculate wick positions (only updates when wick range changes or scale changes)
  const currentWickPositions = useMemo(() => {
    if (!currentCandle || wickRange.high == null || wickRange.low == null) {
      return null;
    }
    
    const totalRange = scaleMax - scaleMin;
    if (totalRange === 0) return null;
    
    const priceToPosition = (price) => {
      return ((price - scaleMin) / totalRange) * 100;
    };
    
    return {
      highPos: priceToPosition(wickRange.high),
      lowPos: priceToPosition(wickRange.low),
    };
  }, [wickRange.high, wickRange.low, scaleMin, scaleMax]);

  // Calculate body positions dynamically (updates on every price change)
  const currentBodyPositions = useMemo(() => {
    if (!currentCandle || scaleMin == null || scaleMax == null) {
      return null;
    }
    
    const totalRange = scaleMax - scaleMin;
    if (totalRange === 0) return null;
    
    const priceToPosition = (price) => {
      return ((price - scaleMin) / totalRange) * 100;
    };
    
    const openPos = priceToPosition(currentCandle.open);
    const closePos = priceToPosition(currentCandle.close);
    
    const bodyLeft = Math.min(openPos, closePos);
    const bodyRight = Math.max(openPos, closePos);
    const bodyWidth = bodyRight - bodyLeft;
    const isBullish = currentCandle.close >= currentCandle.open;
    
    return {
      bodyLeft,
      bodyRight,
      bodyWidth,
      isBullish,
    };
  }, [currentCandle, scaleMin, scaleMax]);
  
  // Last closed candle uses a scale range centered on its close price (rounded to nearest increment)
  // This prevents it from moving when the current price moves, but allows repositioning when increment changes
  const lastClosedPositions = useMemo(() => {
    if (!lastClosedCandle || priceIncrement == null) {
      return null;
    }
    
    // Calculate a scale range centered on the last closed candle's close price
    // Use the same logic as the main scale: round to nearest increment, then 8 increments per side
    const candleClosePrice = lastClosedCandle.close;
    const roundedCenter = Math.round(candleClosePrice / priceIncrement) * priceIncrement;
    const incrementsPerSide = 8;
    const rangeHalfWidth = incrementsPerSide * priceIncrement;
    const lastClosedScaleMin = roundedCenter - rangeHalfWidth;
    const lastClosedScaleMax = roundedCenter + rangeHalfWidth;
    
    return calculateCandlePositions(lastClosedCandle, lastClosedScaleMin, lastClosedScaleMax);
  }, [lastClosedCandle, priceIncrement]);

  // Render wicks separately (only updates when wick range changes)
  const renderedCurrentWicks = useMemo(() => {
    if (!currentWickPositions || !currentBodyPositions) return null;

    const { highPos, lowPos } = currentWickPositions;
    const { bodyLeft, bodyRight, isBullish } = currentBodyPositions;
    const candleColor = isBullish ? 'bg-green-500' : 'bg-red-500';

    return (
      <>
        {/* Lower wick: from low to body (if low extends beyond body) */}
        {lowPos < bodyLeft && (
          <div
            className={`absolute ${candleColor}`}
            style={{
              left: `${lowPos}%`,
              width: `${bodyLeft - lowPos}%`,
              height: '2px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
            }}
          />
        )}

        {/* Upper wick: from body to high (if high extends beyond body) */}
        {highPos > bodyRight && (
          <div
            className={`absolute ${candleColor}`}
            style={{
              left: `${bodyRight}%`,
              width: `${highPos - bodyRight}%`,
              height: '2px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
            }}
          />
        )}
      </>
    );
  }, [currentWickPositions, currentBodyPositions]);

  // Render body separately (updates dynamically with price)
  const renderedCurrentBody = useMemo(() => {
    if (!currentBodyPositions) return null;

    const { bodyLeft, bodyWidth, isBullish } = currentBodyPositions;
    const candleColor = isBullish ? 'bg-green-500' : 'bg-red-500';

    return (
      <div
        className={`absolute ${candleColor}`}
        style={{
          left: `${bodyLeft}%`,
          width: bodyWidth > 0.1 ? `${bodyWidth}%` : '2px', // Minimum width for doji
          height: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 1,
        }}
      />
    );
  }, [currentBodyPositions]);

  const renderedLastClosedCandle = useMemo(() => {
    if (!lastClosedPositions) return null;

    const { highPos, lowPos, bodyLeft, bodyRight, bodyWidth, isBullish } = lastClosedPositions;
    const candleColor = isBullish ? 'bg-green-500' : 'bg-red-500';

    return (
      <div className="absolute top-1/2 left-0 right-0 transform -translate-y-1/2" style={{ opacity: 0.7 }}>
        {/* Lower wick: from low to body (if low extends beyond body) */}
        {lowPos < bodyLeft && (
          <div
            className={`absolute ${candleColor}`}
            style={{
              left: `${lowPos}%`,
              width: `${bodyLeft - lowPos}%`,
              height: '2px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
            }}
          />
        )}

        {/* Upper wick: from body to high (if high extends beyond body) */}
        {highPos > bodyRight && (
          <div
            className={`absolute ${candleColor}`}
            style={{
              left: `${bodyRight}%`,
              width: `${highPos - bodyRight}%`,
              height: '2px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
            }}
          />
        )}

        {/* Candle body - solid box from open to close */}
        <div
          className={`absolute ${candleColor}`}
          style={{
            left: `${bodyLeft}%`,
            width: bodyWidth > 0.1 ? `${bodyWidth}%` : '2px', // Minimum width for doji
            height: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1,
          }}
        />
      </div>
    );
  }, [lastClosedPositions]);

  if (!currentBodyPositions) {
    return null;
  }

  // Log candle states (less verbose)
  if (process.env.NODE_ENV === 'development' && lastClosedCandle) {
    console.log('🕯️ Candles:', { 
      hasLast: !!lastClosedPositions, 
      hasCurrent: !!currentBodyPositions,
      wickRange: wickRange,
      lastCandle: lastClosedCandle,
    });
  }

  return (
    <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-20">
      {/* Last closed candle (top half) - slightly transparent */}
      {renderedLastClosedCandle && (
        <div className="absolute top-0 left-0 right-0 h-8">
          {renderedLastClosedCandle}
        </div>
      )}
      
      {/* Current candle (bottom half) - full opacity */}
      <div className="absolute bottom-0 left-0 right-0 h-8">
        <div className="absolute top-1/2 left-0 right-0 transform -translate-y-1/2">
          {renderedCurrentWicks}
          {renderedCurrentBody}
        </div>
      </div>
    </div>
  );
}

export default memo(CandleDisplay);

