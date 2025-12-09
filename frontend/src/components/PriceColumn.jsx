import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, memo } from 'react';

/**
 * Component for rendering a single price level with volume icons
 * 
 * @param {Object} props
 * @param {number} props.price - Price level
 * @param {number} props.volume - Volume at this price level
 * @param {string} props.side - 'bid' or 'ask' to determine styling
 */

function PriceColumn({ price, volume, side = 'bid' }) {
  const [prevVolume, setPrevVolume] = useState(volume);
  const [exitingIcons, setExitingIcons] = useState([]);

  useEffect(() => {
    if (volume < prevVolume) {
      // Volume decreased - animate icons "walking off"
      const decrease = prevVolume - volume;
      const iconsToRemove = Math.floor(decrease * 10);
      
      // Create exiting icons
      const newExiting = Array.from({ length: Math.min(iconsToRemove, 10) }, (_, i) => ({
        id: Date.now() + i,
        volume: decrease / iconsToRemove,
      }));
      setExitingIcons(newExiting);
      
      // Clear exiting icons after animation
      setTimeout(() => {
        setExitingIcons([]);
      }, 1000);
    }
    setPrevVolume(volume);
  }, [volume, prevVolume]);

  // Calculate number of icons based on volume (simple linear mapping)
  // Scale: 0.1 volume = 1 icon, with a reasonable max limit
  const iconCount = Math.min(Math.floor(volume * 10), 100);
  
  const isBid = side === 'bid';
  const bgColor = isBid ? 'bg-arcade-blue/20' : 'bg-arcade-red/20';
  const textColor = isBid ? 'text-arcade-blue' : 'text-arcade-red';
  const borderColor = isBid ? 'border-arcade-blue' : 'border-arcade-red';
  const exitDirection = isBid ? -100 : 100; // Bids exit left, asks exit right

  return (
    <div className={`${bgColor} ${borderColor} border-2 p-2 m-1 rounded shadow-arcade`}>
      <div className={`${textColor} text-xs font-arcade`}>
        <div className="font-bold text-base">{price.toFixed(2)}</div>
        <div className="text-arcade-gray text-xs">Vol: {volume.toFixed(4)}</div>
      </div>
      {/* Render volume icons using emoji 👤 */}
      <div className="mt-2 flex flex-wrap gap-1 relative">
        <AnimatePresence>
          {Array.from({ length: iconCount }).map((_, i) => (
            <motion.span
              key={`icon-${i}`}
              className="text-lg inline-block"
              role="img"
              aria-label="person"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.2 }}
            >
              👤
            </motion.span>
          ))}
          {/* Animate exiting icons "walking off" */}
          {exitingIcons.map((icon) => (
            <motion.span
              key={icon.id}
              className="text-lg inline-block absolute"
              role="img"
              aria-label="person"
              initial={{ opacity: 1, x: 0, y: 0 }}
              animate={{ 
                opacity: 0, 
                x: exitDirection,
                y: -20,
                scale: 0.5,
              }}
              exit={{ opacity: 0 }}
              transition={{ 
                duration: 0.8,
                ease: "easeOut",
              }}
            >
              👤
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default memo(PriceColumn);

