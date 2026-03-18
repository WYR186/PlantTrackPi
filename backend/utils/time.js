/*
  PlantTrack Pi — time utilities
*/

'use strict';

/**
 * Returns the current time as an ISO 8601 string.
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 9999) return 'TIMEOUT';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms.toFixed(0) + 'ms';
}

module.exports = { nowISO, formatDuration };
