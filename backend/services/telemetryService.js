/*
  PlantTrack Pi — Telemetry Service
  Collects, stores, and retrieves telemetry snapshots.
  Auto-collects on a 10-second interval.
*/

'use strict';

const path              = require('path');
const simulationService = require('./simulationService');
const faultService      = require('./faultService');
const { appendToArray, readJSON } = require('../utils/fileStore');

const METRICS_FILE = path.join(__dirname, '..', 'data', 'metrics.json');
const COLLECTION_INTERVAL_MS = 10000;

let _latestSnapshot = null;

/**
 * Collects a new telemetry snapshot using the simulation service.
 * @returns {object}
 */
function collectSnapshot() {
  const activeFaults = faultService.getActiveFaults();
  const snapshot     = simulationService.getSimulatedTelemetry(activeFaults);
  _latestSnapshot    = snapshot;
  return snapshot;
}

/**
 * Appends a snapshot to the persistent metrics history file.
 * Keeps the last 100 entries.
 * @param {object} snapshot
 */
function appendToHistory(snapshot) {
  appendToArray(METRICS_FILE, snapshot, 100);
}

/**
 * Returns up to the last 100 snapshots from persistent history.
 * @returns {object[]}
 */
function getHistory() {
  return readJSON(METRICS_FILE, []);
}

/**
 * Returns the most recently collected snapshot.
 * If none collected yet, collects one immediately.
 * @returns {object}
 */
function getLatest() {
  if (!_latestSnapshot) {
    return collectSnapshot();
  }
  return _latestSnapshot;
}

// ── Auto-collection interval ────────────────────────────────

function startAutoCollection() {
  // Collect once immediately on startup
  const initial = collectSnapshot();
  appendToHistory(initial);
  console.log('[telemetryService] Initial snapshot collected.');

  setInterval(() => {
    const snapshot = collectSnapshot();
    appendToHistory(snapshot);
  }, COLLECTION_INTERVAL_MS);

  console.log(`[telemetryService] Auto-collection started every ${COLLECTION_INTERVAL_MS / 1000}s.`);
}

// Start auto-collection when the module is first loaded
startAutoCollection();

module.exports = { collectSnapshot, appendToHistory, getHistory, getLatest };
