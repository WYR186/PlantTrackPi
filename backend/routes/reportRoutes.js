/*
  PlantTrack Pi — Report Routes
  GET /api/reports/latest
*/

'use strict';

const express        = require('express');
const router         = express.Router();
const reportService  = require('../services/reportService');

// GET /api/reports/latest
router.get('/reports/latest', (req, res) => {
  const report = reportService.getLatestReport();
  res.json(report);
});

module.exports = router;
