/*
  PlantTrack Pi — Fault Service
  Manages active fault injections in-memory.
*/

'use strict';

const { nowISO } = require('../utils/time');

const VALID_FAULT_TYPES = new Set([
  'camera_failure',
  'sensor_timeout',
  'network_disconnect',
  'storage_failure',
]);

// In-memory set of currently active faults
const _activeFaults = new Set();

/**
 * Returns the list of currently active fault type strings.
 * @returns {string[]}
 */
function getActiveFaults() {
  return Array.from(_activeFaults);
}

/**
 * Injects a fault of the specified type.
 * @param {string} faultType
 * @returns {{ success: boolean, faultType?: string, timestamp?: string, error?: string }}
 */
function injectFault(faultType) {
  if (!VALID_FAULT_TYPES.has(faultType)) {
    return {
      success: false,
      error: `Unknown fault type "${faultType}". Valid types: ${Array.from(VALID_FAULT_TYPES).join(', ')}`,
    };
  }

  _activeFaults.add(faultType);

  return {
    success:   true,
    faultType: faultType,
    timestamp: nowISO(),
  };
}

/**
 * Clears all active faults.
 * @returns {{ success: boolean, cleared: number }}
 */
function clearFaults() {
  const count = _activeFaults.size;
  _activeFaults.clear();
  return {
    success: true,
    cleared: count,
  };
}

module.exports = { getActiveFaults, injectFault, clearFaults, VALID_FAULT_TYPES };
