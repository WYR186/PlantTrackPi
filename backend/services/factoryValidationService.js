/*
  PlantTrack Pi — Factory Validation Service

  Runs a fixed, sequential 4-step validation workflow with explicit
  pass/fail thresholds and a traceable run identifier.

  This mode is designed to feel like a production board-bring-up test:
    Step 1 — Camera Module       (CSI frame capture latency)
    Step 2 — Environmental Sensors (I2C read latency)
    Step 3 — SD Storage          (write probe latency)
    Step 4 — Network Connectivity (ICMP round-trip time)

  Each step is evaluated against published thresholds:
    PASS  — latency within acceptable range
    WARN  — latency elevated but within tolerance
    FAIL  — latency exceeds tolerance or hardware not responding

  Run IDs follow the format: PTK-YYYYMMDD-HHMMSS-XXXX
  Results are persisted to data/factory_runs/<runId>.json
*/

'use strict';

const path              = require('path');
const fs                = require('fs');
const { nowISO }        = require('../utils/time');
const { writeJSON, readJSON } = require('../utils/fileStore');
const simulationService = require('./simulationService');
const faultService      = require('./faultService');
const networkService    = require('./networkService');

const FACTORY_RUNS_DIR = path.join(__dirname, '..', 'data', 'factory_runs');

// ── Thresholds ────────────────────────────────────────────────
// Defined in milliseconds. Values chosen to match realistic Pi hardware behavior.
const THRESHOLDS = {
  camera:       { pass: 40,  warn: 60  },  // CSI frame capture latency
  sensors:      { pass: 15,  warn: 20  },  // I2C read response time
  storage:      { pass: 30,  warn: 40  },  // SD write probe latency
  connectivity: { pass: 150, warn: 200 },  // ICMP round-trip time
};

// Step definitions — fixed order, not configurable
const STEPS = [
  {
    step:      1,
    id:        'camera',
    name:      'Camera Module',
    interface: 'CSI / V4L2',
    metric:    'Frame capture latency',
  },
  {
    step:      2,
    id:        'sensors',
    name:      'Environmental Sensors',
    interface: 'I2C (GPIO 2/3)',
    metric:    'Bus read latency',
  },
  {
    step:      3,
    id:        'storage',
    name:      'SD Storage',
    interface: 'mmcblk0',
    metric:    'Write probe latency',
  },
  {
    step:      4,
    id:        'connectivity',
    name:      'Network Connectivity',
    interface: 'wlan0',
    metric:    'ICMP round-trip time',
  },
];

// ── Helpers ───────────────────────────────────────────────────

/**
 * Generates a unique factory run identifier.
 * Format: PTK-YYYYMMDD-HHMMSS-XXXX
 * Example: PTK-20260318-092803-A7F2
 */
function generateRunId() {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const hex  = Math.floor(Math.random() * 0xFFFF)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
  return `PTK-${date}-${time}-${hex}`;
}

/**
 * Evaluates a subsystem result against its thresholds.
 * Returns the step result object.
 *
 * @param {object} stepDef   — from STEPS array
 * @param {object} subsystem — from simulationService.getSubsystemStatus()
 * @param {number} startMs   — Date.now() when step began
 * @returns {object}
 */
function evaluateStep(stepDef, subsystem, startMs) {
  const { id, pass: passThresh, warn: warnThresh } = {
    id:   stepDef.id,
    ...THRESHOLDS[stepDef.id],
  };

  const latencyMs  = subsystem.latency;
  const durationMs = Date.now() - startMs;

  let result = 'PASS';
  let notes  = '';

  if (latencyMs === null || latencyMs === 9999) {
    result = 'FAIL';
    notes  = subsystem.notes || `${stepDef.name} not responding.`;
  } else if (latencyMs > THRESHOLDS[id].warn) {
    result = 'FAIL';
    notes  = `Latency ${latencyMs}ms exceeds fail threshold (>${THRESHOLDS[id].warn}ms).`;
  } else if (latencyMs > THRESHOLDS[id].pass) {
    result = 'WARN';
    notes  = `Latency ${latencyMs}ms elevated (pass threshold: <${THRESHOLDS[id].pass}ms, fail: >${THRESHOLDS[id].warn}ms).`;
  } else {
    notes = subsystem.notes || '';
  }

  return {
    step:        stepDef.step,
    subsystem:   id,
    name:        stepDef.name,
    interface:   stepDef.interface,
    metric:      stepDef.metric,
    result:      result,
    latencyMs:   latencyMs,
    threshold:   { pass: THRESHOLDS[id].pass, warn: THRESHOLDS[id].warn },
    durationMs:  durationMs,
    timestamp:   nowISO(),
    notes:       notes,
  };
}

// ── Main: run factory validation ──────────────────────────────

/**
 * Runs the full 4-step factory validation sequence.
 * Each step is evaluated against published thresholds.
 * Results are saved to data/factory_runs/<runId>.json.
 *
 * @returns {Promise<object>} factory run report
 */
async function runFactoryValidation() {
  const runId     = generateRunId();
  const startTime = nowISO();
  const activeFaults = faultService.getActiveFaults();

  // Get current subsystem snapshot (single source of truth for this run)
  const subsystems = simulationService.getSubsystemStatus(activeFaults);
  const netStatus  = networkService.getStatus();

  const stepResults = [];
  let passed = 0, failed = 0, warned = 0;

  // Execute steps sequentially with a small simulated execution delay
  for (const stepDef of STEPS) {
    const stepStart = Date.now();

    // Simulate test execution time (realistic for each interface type)
    await _simulateTestExecution(stepDef.id);

    const subsystem = subsystems.find(s => s.id === stepDef.id);
    const stepResult = evaluateStep(stepDef, subsystem, stepStart);
    stepResults.push(stepResult);

    if (stepResult.result === 'PASS') passed++;
    else if (stepResult.result === 'FAIL') failed++;
    else if (stepResult.result === 'WARN') warned++;

    console.log(`[factoryValidation] Step ${stepDef.step} — ${stepDef.name}: ${stepResult.result} (${stepResult.latencyMs ?? 'n/a'}ms)`);
  }

  const overallResult = failed > 0 ? 'FAIL' : warned > 0 ? 'WARN' : 'PASS';

  const report = {
    runId:          runId,
    timestamp:      startTime,
    completedAt:    nowISO(),
    mode:           'factory',
    simulationMode: true,
    overallResult:  overallResult,
    activeFaults:   activeFaults,
    steps:          stepResults,
    summary: {
      total:  stepResults.length,
      passed: passed,
      failed: failed,
      warned: warned,
    },
    connectivity: {
      connected:     netStatus.connected,
      ssid:          netStatus.ssid,
      ipAddress:     netStatus.ipAddress,
      interfaceName: netStatus.interfaceName,
    },
    thresholds: THRESHOLDS,
  };

  // Persist to factory_runs directory
  _ensureDir();
  const filePath = path.join(FACTORY_RUNS_DIR, `${runId}.json`);
  writeJSON(filePath, report);
  console.log(`[factoryValidation] Run saved: ${runId} — ${overallResult}`);

  return report;
}

/**
 * Returns a list of past factory run IDs, newest first.
 * @returns {string[]}
 */
function listRuns() {
  _ensureDir();
  try {
    return fs.readdirSync(FACTORY_RUNS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort()
      .reverse();
  } catch (_) {
    return [];
  }
}

/**
 * Retrieves a factory run report by runId.
 * @param {string} runId
 * @returns {object|null}
 */
function getRunById(runId) {
  // Sanitize: only allow PTK-* format to prevent path traversal
  if (!/^PTK-\d{8}-\d{6}-[0-9A-F]{4}$/.test(runId)) return null;
  const filePath = path.join(FACTORY_RUNS_DIR, `${runId}.json`);
  return readJSON(filePath, null);
}

// ── Internal ──────────────────────────────────────────────────

function _ensureDir() {
  if (!fs.existsSync(FACTORY_RUNS_DIR)) {
    fs.mkdirSync(FACTORY_RUNS_DIR, { recursive: true });
  }
}

/**
 * Simulates realistic test execution time for each subsystem interface.
 * On real hardware: this time would reflect actual probe execution.
 * Values chosen to feel authentic without slowing down demos.
 *
 * @param {string} subsystemId
 */
function _simulateTestExecution(subsystemId) {
  const ranges = {
    camera:       [300, 500],  // CSI frame capture attempt
    sensors:      [100, 250],  // I2C bus read
    storage:      [150, 350],  // SD write probe
    connectivity: [200, 600],  // ICMP ping round-trip
  };
  const [min, max] = ranges[subsystemId] || [100, 200];
  const delay = min + Math.floor(Math.random() * (max - min));
  return new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = { runFactoryValidation, listRuns, getRunById, THRESHOLDS, generateRunId };
