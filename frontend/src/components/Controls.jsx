/**
 * Controls component for time-travel playback
 * 
 * @param {Object} props
 * @param {boolean} props.isPlaying - Whether playback is currently active
 * @param {number} props.playbackSpeed - Current playback speed multiplier (0.5, 1, 2, 10)
 * @param {Function} props.onPlay - Callback when play button is clicked
 * @param {Function} props.onPause - Callback when pause button is clicked
 * @param {Function} props.onSpeedChange - Callback when speed is changed (speed: number) => void
 * @param {Function} props.onLive - Callback when live button is clicked
 * @param {boolean} props.isLive - Whether currently in live mode
 * @param {boolean} props.isPlayDisabled - Whether the Play button should be disabled
 */
function Controls({ isPlaying, playbackSpeed, onPlay, onPause, onSpeedChange, onLive, isLive, isPlayDisabled }) {
  const speedOptions = [0.5, 1, 2, 10];

  return (
    <div className="flex items-center justify-center gap-4">
      {/* Live Button */}
      <button
        onClick={onLive}
        className={`
          px-6 py-3 font-arcade uppercase text-lg
          border-2 shadow-arcade transition-all
          ${isLive
            ? 'bg-arcade-green text-arcade-white border-arcade-green'
            : 'bg-green-500/30 text-arcade-white border-arcade-green hover:bg-green-500/40'
          }
          active:shadow-none active:translate-x-1 active:translate-y-1
        `}
        aria-label="Return to live"
      >
        ● LIVE
      </button>

      {/* Play/Pause Button */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        disabled={isPlayDisabled}
        className={`
          px-6 py-3 font-arcade uppercase text-lg
          border-2 shadow-arcade transition-all
          ${isPlayDisabled
            ? 'bg-green-500/30 text-arcade-white border-arcade-gray cursor-not-allowed'
            : isPlaying 
              ? 'bg-arcade-red text-arcade-white border-arcade-red hover:bg-arcade-red/80' 
              : 'bg-green-500/30 text-arcade-white border-arcade-green hover:bg-green-500/40'
          }
          ${!isPlayDisabled && 'active:shadow-none active:translate-x-1 active:translate-y-1'}
        `}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
      </button>

      {/* Speed Control Buttons */}
      <div className="flex items-center gap-2">
        <span className="text-arcade-gray text-sm font-arcade uppercase mr-2">
          Speed:
        </span>
        {speedOptions.map((speed) => (
          <button
            key={speed}
            onClick={() => onSpeedChange?.(speed)}
            className={`
              px-4 py-2 font-arcade uppercase text-sm
              border-2 shadow-arcade transition-all
              ${playbackSpeed === speed
                ? 'bg-arcade-yellow text-arcade-bg border-arcade-yellow font-bold'
                : 'bg-arcade-dark text-arcade-white border-arcade-white hover:bg-arcade-dark/80'
              }
              active:shadow-none active:translate-x-1 active:translate-y-1
            `}
            aria-label={`${speed}x speed`}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
}

export default Controls;

