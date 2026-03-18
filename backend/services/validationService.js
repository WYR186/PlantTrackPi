/*
  PlantTrack Pi — Validation Service
  Runs all subsystem tests and generates a report.
*/

'use strict';

const { nowISO }        = require('../utils/time');
const simulationService = require('./simulationService');
const faultService      = require('./faultService');
const { appendToArray } = require('../utils/fileStore');
const path              = require('path');

const EVENTS_FILE = path.join(__dirname, '..', 'data', 'events.json');

/**
 * Runs all subsystem validation tests.
 * Uses simulation service to get current subsystem status.
 * Generates a report and logs a test-run event.
 *
 * @returns {object} results
 */
async function runAllTests() {
  const timestamp    = nowISO();
  const activeFaults = faultService.getActiveFaults();
  const subsystems   = simulationService.getSubsystemStatus(activeFaults);

  // Calculate summary
  let passed = 0, failed = 0, warned = 0;
  subsystems.forEach(s => {
    if (s.status === 'PASS') passed++;
    else if (s.status === 'FAIL') failed++;
    else if (s.status === 'WARN') warned++;
  });

  const total         = subsystems.length;
  const overallStatus = failed > 0 ? 'FAIL' : warned > 0 ? 'WARN' : 'PASS';

  const results = {
    timestamp:      timestamp,
    subsystems:     subsystems,
    summary:        { total, passed, failed, warned },
    overallStatus:  overallStatus,
    simulationMode: true,
  };

  // Generate report (lazy-require to avoid circular dependency at load time)
  const reportService = require('./reportService');
  reportService.generateReport(results);

  // Log test-run event
  const event = {
    timestamp:   timestamp,
    type:        'TEST_RUN',
    subsystem:   'all',
    faultType:   null,
    details:     `Validation run complete — ${overallStatus}. Passed: ${passed}, Failed: ${failed}, Warned: ${warned}.`,
    description: `Overall: ${overallStatus}`,
    message:     `Test run at ${timestamp}`,
  };
  appendToArray(EVENTS_FILE, event, 100);

  // Log individual FAIL/WARN events
  subsystems
    .filter(s => s.status !== 'PASS')
    .forEach(s => {
      appendToArray(EVENTS_FILE, {
        timestamp:   timestamp,
        type:        s.status === 'FAIL' ? 'FAULT_DETECTED' : 'WARNING',
        subsystem:   s.id,
        faultType:   activeFaults.find(f => f.startsWith(s.id.split('_')[0])) || null,
        details:     s.notes || `${s.name} ${s.status}`,
        description: s.notes || '',
        message:     `${s.name}: ${s.status}`,
      }, 100);
    });

  return results;
}

module.exports = { runAllTests };
