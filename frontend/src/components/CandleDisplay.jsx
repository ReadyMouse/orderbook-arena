import { useMemo } from 'react';

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
 * @param {Number} scaleMin - Minimum price on the scale
 * @param {Number} scaleMax - Maximum price on the scale
 * @param {Number} centerPrice - Center price (for reference)
 */
function CandleDisplay({ currentCandle, lastClosedCandle, scaleMin, scaleMax, centerPrice }) {
  // Calculate positions for a single candle
  const calculateCandlePositions = (ohlcData) => {
    if (!ohlcData || scaleMin == null || scaleMax == null) {
      return null;
    }

    const { open, high, low, close } = ohlcData;
    const totalRange = scaleMax - scaleMin;

    if (totalRange === 0) {
      return null;
    }

    // Convert price to horizontal position (0-100%)
    const priceToPosition = (price) => {
      return ((price - scaleMin) / totalRange) * 100;
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
      bodyWidth,
      isBullish,
    };
  };

  // Calculate positions for both candles
  const currentPositions = useMemo(() => 
    calculateCandlePositions(currentCandle), 
    [currentCandle, scaleMin, scaleMax]
  );
  
  const lastClosedPositions = useMemo(() => 
    calculateCandlePositions(lastClosedCandle), 
    [lastClosedCandle, scaleMin, scaleMax]
  );

  // Helper to render a single candle
  const renderCandle = (positions, opacity = 1) => {
    if (!positions) return null;

    const { highPos, lowPos, bodyLeft, bodyWidth, isBullish } = positions;
    const candleColor = isBullish ? 'bg-green-500' : 'bg-red-500';

    return (
      <div className="absolute top-1/2 left-0 right-0 transform -translate-y-1/2" style={{ opacity }}>
        {/* Full wick line from low to high - thin line on top */}
        <div
          className={`absolute ${candleColor}`}
          style={{
            left: `${lowPos}%`,
            width: `${Math.max(0.1, highPos - lowPos)}%`,
            height: '2px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 2,
          }}
        />

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
  };

  if (!currentPositions) {
    return null;
  }

  // Log candle states (less verbose)
  if (process.env.NODE_ENV === 'development' && lastClosedCandle) {
    console.log('🕯️ Candles:', { 
      hasLast: !!lastClosedPositions, 
      hasCurrent: !!currentPositions,
      lastCandle: lastClosedCandle,
    });
  }

  return (
    <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-20">
      {/* Last closed candle (top half) - slightly transparent */}
      {lastClosedPositions && (
        <div className="absolute top-0 left-0 right-0 h-8">
          {renderCandle(lastClosedPositions, 0.7)}
        </div>
      )}
      
      {/* Current candle (bottom half) - full opacity */}
      <div className="absolute bottom-0 left-0 right-0 h-8">
        {renderCandle(currentPositions, 1.0)}
      </div>
    </div>
  );
}

export default CandleDisplay;

