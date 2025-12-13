/**
 * API client functions for REST endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

/**
 * Fetch a snapshot by ticker and timestamp
 * @param {string} ticker - Ticker symbol (e.g., "BTC", "ETH", "ZEC", "XMR")
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {Promise<Object>} Snapshot object with ticker, timestamp, lastPrice, bids, and asks
 */
export async function fetchSnapshot(ticker, timestamp) {
  const response = await fetch(`${API_BASE_URL}/snapshot/${ticker}/${timestamp}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Snapshot not found for ticker ${ticker} at timestamp: ${timestamp}`);
    }
    if (response.status === 400) {
      throw new Error(`Invalid timestamp format: ${timestamp}`);
    }
    throw new Error(`Failed to fetch snapshot: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Fetch the history range (min and max timestamps) for a specific ticker
 * @param {string} ticker - Ticker symbol (e.g., "BTC", "ETH", "ZEC", "XMR")
 * @returns {Promise<Object>} Object with minTimestamp and maxTimestamp
 */
export async function fetchHistory(ticker) {
  const response = await fetch(`${API_BASE_URL}/history/${ticker}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`No history available for ticker ${ticker}. No snapshots have been stored yet.`);
    }
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }
  
  return await response.json();
}

