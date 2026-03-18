/*
  PlantTrack Pi — System Routes
  GET /api/health
  GET /api/system/summary
  GET /api/subsystems
*/

'use strict';

const express           = require('express');
const router            = express.Router();
const simulationService = require('../services/simulationService');
const faultService      = require('../services/faultService');
const networkService    = require('../services/networkService');
const { readJSON }      = require('../utils/fileStore');
const path              = require('path');

const EVENTS_FILE = path.join(__dirname, '..', 'data', 'events.json');

// GET /api/health
router.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/system/summary
router.get('/system/summary', (req, res) => {
  const activeFaults   = faultService.getActiveFaults();
  const subsystems     = simulationService.getSubsystemStatus(activeFaults);
  const activeCount    = subsystems.filter(s => s.status !== 'FAIL').length;
  const faultCount     = activeFaults.length;

  // Determine overall status from subsystem statuses
  const hasFail = subsystems.some(s => s.status === 'FAIL');
  const hasWarn = subsystems.some(s => s.status === 'WARN');
  const overallStatus = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';

  // Try to get last test run from events
  const events     = readJSON(EVENTS_FILE, []);
  const testEvents = events.filter(e => e.type === 'TEST_RUN');
  const lastTestRun = testEvents.length > 0
    ? testEvents[testEvents.length - 1].timestamp
    : null;

  res.json({
    overallStatus:    overallStatus,
    activeSubsystems: activeCount,
    lastTestRun:      lastTestRun,
    faultCount:       faultCount,
    simulationMode:   true,
  });
});

// GET /api/subsystems
router.get('/subsystems', (req, res) => {
  const activeFaults = faultService.getActiveFaults();
  const subsystems   = simulationService.getSubsystemStatus(activeFaults);
  res.json(subsystems);
});

// GET /api/connectivity/status
// Returns detailed Wi-Fi / network interface status snapshot.
router.get('/connectivity/status', (req, res) => {
  res.json(networkService.getStatus());
});

module.exports = router;
