import { useMemo } from 'react';

/**
 * CandleDisplay Component
 * 
 * Displays a horizontal (sideways) candlestick at the top of the arena
 * that shows the current OHLC data aligned with the price scale
 * 
 * @param {Object} ohlcData - OHLC data with open, high, low, close, time, etime, vwap, volume, count
 * @param {Number} scaleMin - Minimum price on the scale
 * @param {Number} scaleMax - Maximum price on the scale
 * @param {Number} centerPrice - Center price (for reference)
 */
function CandleDisplay({ ohlcData, scaleMin, scaleMax, centerPrice }) {
  // Calculate positions based on price scale
  const candlePositions = useMemo(() => {
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
      open,
      high,
      low,
      close,
    };
  }, [ohlcData, scaleMin, scaleMax]);

  if (!candlePositions) {
    return null;
  }

  const {
    highPos,
    lowPos,
    bodyLeft,
    bodyWidth,
    isBullish,
    open,
    high,
    low,
    close,
  } = candlePositions;

  // Body and wick colors - same color
  const candleColor = isBullish ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className="absolute top-0 left-0 right-0 h-8 pointer-events-none z-20">
      {/* Candlestick - horizontal layout */}
      <div className="absolute top-1/2 left-0 right-0 transform -translate-y-1/2">
        {/* Full wick line from low to high */}
        <div
          className={`absolute ${candleColor}`}
          style={{
            left: `${lowPos}%`,
            width: `${Math.max(0.1, highPos - lowPos)}%`,
            height: '3px',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />

        {/* Candle body - solid box from open to close */}
        <div
          className={`absolute h-4 ${candleColor}`}
          style={{
            left: `${bodyLeft}%`,
            width: bodyWidth > 0.1 ? `${bodyWidth}%` : '3px', // Minimum width for doji
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />
      </div>
    </div>
  );
}

export default CandleDisplay;

