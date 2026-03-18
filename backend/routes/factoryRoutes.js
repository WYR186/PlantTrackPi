/*
  PlantTrack Pi — Factory Validation Routes

  POST /api/factory/run           — Start a factory validation run
  GET  /api/factory/runs          — List past run IDs
  GET  /api/factory/runs/:runId   — Retrieve a specific run report
  GET  /api/factory/runs/:runId/export — Download run report as JSON file
*/

'use strict';

const express                = require('express');
const router                 = express.Router();
const factoryValidationService = require('../services/factoryValidationService');

// POST /api/factory/run
// Runs the full 4-step factory validation sequence.
// Returns the complete run report including step results and overall verdict.
router.post('/factory/run', async (req, res) => {
  try {
    const report = await factoryValidationService.runFactoryValidation();
    res.json(report);
  } catch (err) {
    console.error('[factoryRoutes] run error:', err.message);
    res.status(500).json({ error: 'Factory validation failed: ' + err.message });
  }
});

// GET /api/factory/runs
// Returns a list of past factory run IDs, newest first.
router.get('/factory/runs', (req, res) => {
  const runs = factoryValidationService.listRuns();
  res.json({ runs, total: runs.length });
});

// GET /api/factory/runs/:runId
// Returns the full report for a specific run.
router.get('/factory/runs/:runId', (req, res) => {
  const report = factoryValidationService.getRunById(req.params.runId);
  if (!report) {
    return res.status(404).json({ error: 'Run not found: ' + req.params.runId });
  }
  res.json(report);
});

// GET /api/factory/runs/:runId/export
// Downloads the run report as a JSON file.
router.get('/factory/runs/:runId/export', (req, res) => {
  const { runId } = req.params;
  const report = factoryValidationService.getRunById(runId);
  if (!report) {
    return res.status(404).json({ error: 'Run not found: ' + runId });
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${runId}.json"`);
  res.send(JSON.stringify(report, null, 2));
});

module.exports = router;
