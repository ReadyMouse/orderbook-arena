import { formatTimestamp } from '../utils/format';

/**
 * TimeSlider component for selecting historical timestamps
 * 
 * @param {Object} props
 * @param {number} props.minTimestamp - Minimum available timestamp (Unix seconds)
 * @param {number} props.maxTimestamp - Maximum available timestamp (Unix seconds)
 * @param {number} props.currentTimestamp - Currently selected timestamp (Unix seconds)
 * @param {Function} props.onChange - Callback when timestamp changes (timestamp: number) => void
 */
function TimeSlider({ minTimestamp, maxTimestamp, currentTimestamp, onChange }) {
  // Handle edge cases
  if (minTimestamp == null || maxTimestamp == null || minTimestamp >= maxTimestamp) {
    return (
      <div className="text-arcade-gray text-sm font-arcade">
        No history available
      </div>
    );
  }

  // Normalize currentTimestamp to be within range
  // When currentTimestamp is null (Live Mode), default to maxTimestamp (right side)
  const normalizedTimestamp = Math.max(
    minTimestamp,
    Math.min(maxTimestamp, currentTimestamp ?? maxTimestamp)
  );

  // Calculate slider value (0-100)
  const range = maxTimestamp - minTimestamp;
  const sliderValue = range > 0 
    ? ((normalizedTimestamp - minTimestamp) / range) * 100 
    : 0;

  const handleChange = (e) => {
    const value = parseFloat(e.target.value);
    // Convert slider value (0-100) back to timestamp
    const newTimestamp = minTimestamp + (value / 100) * range;
    // Round to nearest integer (timestamps are in seconds)
    const roundedTimestamp = Math.round(newTimestamp);
    onChange?.(roundedTimestamp);
  };

  // Also handle onInput for smoother real-time updates while dragging
  const handleInput = (e) => {
    const value = parseFloat(e.target.value);
    const newTimestamp = minTimestamp + (value / 100) * range;
    const roundedTimestamp = Math.round(newTimestamp);
    onChange?.(roundedTimestamp);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-arcade-gray text-xs font-arcade">
          {formatTimestamp(minTimestamp)}
        </div>
        <div className="text-arcade-white text-sm font-arcade font-bold">
          {formatTimestamp(normalizedTimestamp)}
        </div>
        <div className="text-arcade-gray text-xs font-arcade">
          {formatTimestamp(maxTimestamp)}
        </div>
      </div>
      
      <input
        type="range"
        min="0"
        max="100"
        step="0.01"
        value={sliderValue}
        onChange={handleChange}
        onInput={handleInput}
        className="w-full h-2 bg-arcade-dark rounded-lg appearance-none cursor-pointer 
                   accent-arcade-yellow hover:accent-arcade-green
                   [&::-webkit-slider-thumb]:appearance-none 
                   [&::-webkit-slider-thumb]:w-4 
                   [&::-webkit-slider-thumb]:h-4 
                   [&::-webkit-slider-thumb]:rounded-full 
                   [&::-webkit-slider-thumb]:bg-arcade-yellow 
                   [&::-webkit-slider-thumb]:border-2 
                   [&::-webkit-slider-thumb]:border-arcade-white
                   [&::-webkit-slider-thumb]:shadow-arcade
                   [&::-moz-range-thumb]:w-4 
                   [&::-moz-range-thumb]:h-4 
                   [&::-moz-range-thumb]:rounded-full 
                   [&::-moz-range-thumb]:bg-arcade-yellow 
                   [&::-moz-range-thumb]:border-2 
                   [&::-moz-range-thumb]:border-arcade-white
                   [&::-moz-range-thumb]:shadow-arcade
                   [&::-moz-range-thumb]:cursor-pointer"
      />
    </div>
  );
}

export default TimeSlider;

