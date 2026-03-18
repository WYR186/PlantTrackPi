/*
  PlantTrack Pi — Telemetry Routes
  GET /api/telemetry/latest
  GET /api/telemetry/history
*/

'use strict';

const express           = require('express');
const router            = express.Router();
const telemetryService  = require('../services/telemetryService');

// GET /api/telemetry/latest
router.get('/telemetry/latest', (req, res) => {
  const snapshot = telemetryService.getLatest();
  res.json(snapshot);
});

// GET /api/telemetry/history
router.get('/telemetry/history', (req, res) => {
  const history = telemetryService.getHistory();
  // Return last 20 snapshots
  const last20  = history.slice(-20);
  res.json(last20);
});

module.exports = router;
