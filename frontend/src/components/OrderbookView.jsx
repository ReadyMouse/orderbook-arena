import { useMemo, memo } from 'react';
import PriceColumn from './PriceColumn';
import Centerline from './Centerline';

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

  // Calculate horizontal position for a price level
  const getPosition = (price) => {
    if (!minPrice || !maxPrice || minPrice === maxPrice) {
      return 50; // Center if no range
    }
    const priceRange = maxPrice - minPrice;
    return ((price - minPrice) / priceRange) * 100;
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-arcade-dark">
      {/* Render asks (sellers) on left side */}
      <div className="absolute left-0 top-0 bottom-0 w-1/2 border-r-2 border-arcade-white bg-arcade-red/10">
        <div className="text-arcade-red text-xs p-2 font-arcade uppercase">
          Sellers (Asks)
        </div>
        <div className="relative h-full overflow-y-auto">
          {limitedAsks.map((ask, index) => {
            if (!ask || typeof ask.price !== 'number' || typeof ask.volume !== 'number') {
              return null;
            }
            const position = getPosition(ask.price);
            // Position from center (50%) towards left (0%)
            const leftPercent = Math.max(0, 50 - position);
            
            return (
              <div
                key={`ask-${ask.price}-${index}`}
                className="absolute"
                style={{
                  left: `${leftPercent}%`,
                  top: `${index * 80}px`, // Stack vertically
                }}
              >
                <PriceColumn price={ask.price} volume={ask.volume} side="ask" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Render bids (buyers) on right side */}
      <div className="absolute right-0 top-0 bottom-0 w-1/2 border-l-2 border-arcade-white bg-arcade-blue/10">
        <div className="text-arcade-blue text-xs p-2 font-arcade uppercase text-right">
          Buyers (Bids)
        </div>
        <div className="relative h-full overflow-y-auto">
          {limitedBids.map((bid, index) => {
            if (!bid || typeof bid.price !== 'number' || typeof bid.volume !== 'number') {
              return null;
            }
            const position = getPosition(bid.price);
            // Position from center (50%) towards right (100%)
            const leftPercent = Math.min(100, 50 + (position - 50));
            
            return (
              <div
                key={`bid-${bid.price}-${index}`}
                className="absolute"
                style={{
                  left: `${leftPercent}%`,
                  top: `${index * 80}px`, // Stack vertically
                }}
              >
                <PriceColumn price={bid.price} volume={bid.volume} side="bid" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Centerline */}
      {lastPrice && minPrice && maxPrice && (
        <Centerline
          lastPrice={lastPrice}
          minPrice={minPrice}
          maxPrice={maxPrice}
          width={100}
        />
      )}
    </div>
  );
}

export default memo(OrderbookView);
