/*
  PlantTrack Pi — Event Routes
  GET /api/events
*/

'use strict';

const express      = require('express');
const router       = express.Router();
const { readJSON } = require('../utils/fileStore');
const path         = require('path');

const EVENTS_FILE = path.join(__dirname, '..', 'data', 'events.json');

// GET /api/events — returns last 50 events
router.get('/events', (req, res) => {
  const events = readJSON(EVENTS_FILE, []);
  const last50 = events.slice(-50);
  res.json(last50);
});

module.exports = router;
