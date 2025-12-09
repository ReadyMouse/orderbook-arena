/**
 * Utility functions for formatting prices, timestamps, etc.
 */

/**
 * Format a price to a fixed number of decimal places
 * @param {number} price - Price to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted price string
 */
export function formatPrice(price, decimals = 2) {
  if (price == null || isNaN(price)) {
    return 'N/A';
  }
  return price.toFixed(decimals);
}

/**
 * Format a timestamp to a readable date/time string
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date/time string
 */
export function formatTimestamp(timestamp) {
  if (timestamp == null) {
    return 'N/A';
  }
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

/**
 * Format a timestamp to a relative time string (e.g., "2 minutes ago")
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Relative time string
 */
export function formatRelativeTime(timestamp) {
  if (timestamp == null) {
    return 'N/A';
  }
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) {
    return `${diff} second${diff !== 1 ? 's' : ''} ago`;
  } else if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diff / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Format volume to a readable string
 * @param {number} volume - Volume to format
 * @param {number} decimals - Number of decimal places (default: 4)
 * @returns {string} Formatted volume string
 */
export function formatVolume(volume, decimals = 4) {
  if (volume == null || isNaN(volume)) {
    return '0';
  }
  return volume.toFixed(decimals);
}

