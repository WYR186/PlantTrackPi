/*
  PlantTrack Pi — Fault Routes
  POST /api/faults/inject
  POST /api/faults/clear
*/

'use strict';

const express          = require('express');
const router           = express.Router();
const faultService     = require('../services/faultService');
const networkService   = require('../services/networkService');
const { appendToArray } = require('../utils/fileStore');
const { nowISO }       = require('../utils/time');
const path             = require('path');

const EVENTS_FILE = path.join(__dirname, '..', 'data', 'events.json');

// POST /api/faults/inject
router.post('/faults/inject', (req, res) => {
  const { faultType } = req.body;

  if (!faultType) {
    return res.status(400).json({ success: false, error: 'faultType is required in request body.' });
  }

  const result = faultService.injectFault(faultType);

  if (!result.success) {
    return res.status(400).json(result);
  }

  // Immediately notify networkService so connectivity state + events update
  // without waiting for the next 10s telemetry tick.
  if (faultType === 'network_disconnect') {
    networkService.notifyFaultChange(faultService.getActiveFaults());
  }

  // Log injection event
  appendToArray(EVENTS_FILE, {
    timestamp:   result.timestamp,
    type:        'FAULT_INJECTED',
    subsystem:   faultType.split('_')[0],
    faultType:   faultType,
    details:     `Fault injected: ${faultType}`,
    description: `Fault injection triggered by user`,
    message:     `FAULT_INJECTED: ${faultType}`,
  }, 100);

  res.json(result);
});

// POST /api/faults/clear
router.post('/faults/clear', (req, res) => {
  const result = faultService.clearFaults();

  // Immediately notify networkService of fault clearance so NETWORK_RECOVERED
  // fires right away without waiting for the next 10s telemetry tick.
  networkService.notifyFaultChange(faultService.getActiveFaults());

  // Log clear event
  appendToArray(EVENTS_FILE, {
    timestamp:   nowISO(),
    type:        'FAULTS_CLEARED',
    subsystem:   'all',
    faultType:   null,
    details:     `Cleared ${result.cleared} active fault(s)`,
    description: 'All faults cleared by user',
    message:     `FAULTS_CLEARED: ${result.cleared} removed`,
  }, 100);

  res.json(result);
});

module.exports = router;
