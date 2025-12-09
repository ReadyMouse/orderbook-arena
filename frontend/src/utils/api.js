/**
 * API client functions for REST endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

/**
 * Fetch a snapshot by timestamp
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {Promise<Object>} Snapshot object with timestamp, lastPrice, bids, and asks
 */
export async function fetchSnapshot(timestamp) {
  const response = await fetch(`${API_BASE_URL}/snapshot/${timestamp}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Snapshot not found for timestamp: ${timestamp}`);
    }
    if (response.status === 400) {
      throw new Error(`Invalid timestamp format: ${timestamp}`);
    }
    throw new Error(`Failed to fetch snapshot: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Fetch the history range (min and max timestamps)
 * @returns {Promise<Object>} Object with minTimestamp and maxTimestamp
 */
export async function fetchHistory() {
  const response = await fetch(`${API_BASE_URL}/history`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No history available. No snapshots have been stored yet.');
    }
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }
  
  return await response.json();
}

