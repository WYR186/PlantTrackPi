/*
  PlantTrack Pi — Test Routes
  POST /api/tests/run
*/

'use strict';

const express           = require('express');
const router            = express.Router();
const validationService = require('../services/validationService');

// POST /api/tests/run
router.post('/tests/run', async (req, res) => {
  try {
    const results = await validationService.runAllTests();
    res.json(results);
  } catch (err) {
    console.error('[testRoutes] runAllTests error:', err.message);
    res.status(500).json({ error: 'Validation run failed: ' + err.message });
  }
});

module.exports = router;
