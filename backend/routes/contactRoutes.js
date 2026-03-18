/*
  PlantTrack Pi — Contact Routes
  POST /api/contact
*/

'use strict';

const express           = require('express');
const router            = express.Router();
const { appendToArray } = require('../utils/fileStore');
const { nowISO }        = require('../utils/time');
const path              = require('path');

const EVENTS_FILE = path.join(__dirname, '..', 'data', 'events.json');

// POST /api/contact
router.post('/contact', (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: 'name, email, and message are required.',
    });
  }

  const timestamp = nowISO();

  // Log to events file (no email address stored in message for privacy)
  appendToArray(EVENTS_FILE, {
    timestamp:   timestamp,
    type:        'CONTACT_FORM',
    subsystem:   'ui',
    faultType:   null,
    details:     `Contact form submission from ${name} (${email})`,
    description: message.substring(0, 200),
    message:     `Contact: ${name}`,
  }, 100);

  console.log(`[contactRoutes] Contact form submission from: ${name} <${email}>`);

  res.json({ success: true, timestamp });
});

module.exports = router;
