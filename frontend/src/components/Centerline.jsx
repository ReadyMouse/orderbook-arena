import { motion } from 'framer-motion';
import { memo } from 'react';

/**
 * Component that displays a vertical line representing the last traded price
 * 
 * @param {Object} props
 * @param {number|null} props.lastPrice - Last traded price
 * @param {number} props.minPrice - Minimum price in the orderbook
 * @param {number} props.maxPrice - Maximum price in the orderbook
 * @param {number} props.width - Width of the container (for positioning)
 */

function Centerline({ lastPrice, minPrice, maxPrice, width = 100 }) {
  if (!lastPrice || !minPrice || !maxPrice || minPrice === maxPrice) {
    return null;
  }

  // Calculate horizontal position as percentage
  // Price range spans the width, with lastPrice positioned proportionally
  const priceRange = maxPrice - minPrice;
  const positionPercent = ((lastPrice - minPrice) / priceRange) * 100;

  return (
    <motion.div
      className="absolute top-0 bottom-0 w-1 bg-arcade-yellow z-10"
      style={{
        left: `${positionPercent}%`,
      }}
      initial={{ opacity: 0 }}
      animate={{ 
        left: `${positionPercent}%`,
        opacity: 1,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
    >
      {/* Price label */}
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 bg-arcade-yellow text-arcade-bg px-2 py-1 text-xs font-arcade font-bold">
        {lastPrice.toFixed(2)}
      </div>
    </motion.div>
  );
}

export default memo(Centerline);

