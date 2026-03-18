/*
  PlantTrack Pi — Simulation Service
  Generates synthetic telemetry and subsystem status data.
  All values are simulated — no real hardware required.
*/

'use strict';

const { nowISO }        = require('../utils/time');
const networkService    = require('./networkService');

// ── Random helpers ──────────────────────────────────────────

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function jitter(base, maxDelta) {
  return base + (Math.random() * 2 - 1) * maxDelta;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

// ── Base value state (persisted per process for smooth drift) ──
let _state = {
  cpu:        30,
  memory:     45,
  temp:       52,
  camLatency: 15,
  senLatency:  5,
  netLatency: 40,
  stoLatency: 12,
};

function driftState() {
  _state.cpu        = clamp(jitter(_state.cpu,        4),  5,  90);
  _state.memory     = clamp(jitter(_state.memory,     3), 20,  85);
  _state.temp       = clamp(jitter(_state.temp,       1.5), 38, 80);
  _state.camLatency = clamp(jitter(_state.camLatency, 3),  5,  60);
  _state.senLatency = clamp(jitter(_state.senLatency, 1),  1,  20);
  _state.netLatency = clamp(jitter(_state.netLatency, 8),  8, 200);
  _state.stoLatency = clamp(jitter(_state.stoLatency, 2),  3,  40);
}

// ── Thresholds for WARN ─────────────────────────────────────
const THRESHOLDS = {
  cpu:        80,   // WARN if > 80%
  memory:     75,   // WARN if > 75%
  temp:       70,   // WARN if > 70°C
  camLatency: 40,   // WARN if > 40ms
  senLatency: 15,   // WARN if > 15ms
  netLatency: 150,  // WARN if > 150ms
  stoLatency: 30,   // WARN if > 30ms
};

// ── getSimulatedTelemetry ───────────────────────────────────

/**
 * Returns a telemetry snapshot with simulated values.
 * Faults affect specific latency fields to reflect hardware issues.
 *
 * @param {string[]} activeFaults
 * @returns {object}
 */
function getSimulatedTelemetry(activeFaults = []) {
  driftState();

  const faults = new Set(activeFaults);

  const camLatency  = faults.has('camera_failure')     ? null  : parseFloat(_state.camLatency.toFixed(1));
  const senLatency  = faults.has('sensor_timeout')     ? 9999  : parseFloat(_state.senLatency.toFixed(1));
  const netLatency  = faults.has('network_disconnect')  ? null  : parseFloat(_state.netLatency.toFixed(1));
  const stoLatency  = faults.has('storage_failure')    ? null  : parseFloat(_state.stoLatency.toFixed(1));

  // Tick network service with raw latency (before fault nulling) so it can
  // detect transitions and emit NETWORK_* events.
  // Pass _state.netLatency (un-nulled) so high-latency debounce works correctly.
  networkService.tick(activeFaults, parseFloat(_state.netLatency.toFixed(1)));
  const netConnStatus = networkService.getStatus();

  return {
    timestamp:            nowISO(),
    cpuUsage:             parseFloat(_state.cpu.toFixed(1)),
    memoryUsage:          parseFloat(_state.memory.toFixed(1)),
    temperature:          parseFloat(_state.temp.toFixed(1)),
    cameraLatency:        camLatency,
    sensorLatency:        senLatency,
    networkLatency:       netLatency,
    storageWriteLatency:  stoLatency,
    faultCount:           faults.size,
    // ── Connectivity fields (added by connectivity patch) ────
    wifiConnected:        netConnStatus.connected,
    interfaceName:        netConnStatus.interfaceName,
    ssid:                 netConnStatus.ssid,
    ipAddress:            netConnStatus.ipAddress,
    networkTimeoutCount:  netConnStatus.timeoutCount,
    packetLossEstimate:   netConnStatus.packetLossEstimate,
    source:               'simulation',
  };
}

// ── getSubsystemStatus ──────────────────────────────────────

/**
 * Returns subsystem health check results.
 *
 * @param {string[]} activeFaults
 * @returns {object[]}
 */
function getSubsystemStatus(activeFaults = []) {
  driftState();

  const faults = new Set(activeFaults);
  const now    = nowISO();

  // Camera
  let cameraStatus  = 'PASS';
  let cameraLatency = parseFloat(_state.camLatency.toFixed(1));
  let cameraNotes   = '';
  if (faults.has('camera_failure')) {
    cameraStatus  = 'FAIL';
    cameraLatency = null;
    cameraNotes   = 'Camera device not responding. CSI interface error.';
  } else if (cameraLatency > THRESHOLDS.camLatency) {
    cameraStatus = 'WARN';
    cameraNotes  = `Latency ${cameraLatency}ms exceeds threshold (${THRESHOLDS.camLatency}ms).`;
  }

  // Sensors
  let sensorsStatus  = 'PASS';
  let sensorsLatency = parseFloat(_state.senLatency.toFixed(1));
  let sensorsNotes   = '';
  if (faults.has('sensor_timeout')) {
    sensorsStatus  = 'FAIL';
    sensorsLatency = 9999;
    sensorsNotes   = 'Sensor I2C timeout. Device not acknowledged on bus.';
  } else if (sensorsLatency > THRESHOLDS.senLatency) {
    sensorsStatus = 'WARN';
    sensorsNotes  = `I2C latency ${sensorsLatency}ms exceeds threshold (${THRESHOLDS.senLatency}ms).`;
  }

  // Storage
  let storageStatus  = 'PASS';
  let storageLatency = parseFloat(_state.stoLatency.toFixed(1));
  let storageNotes   = '';
  if (faults.has('storage_failure')) {
    storageStatus  = 'FAIL';
    storageLatency = null;
    storageNotes   = 'SD write failed — I/O error on mmcblk0.';
  } else if (storageLatency > THRESHOLDS.stoLatency) {
    storageStatus = 'WARN';
    storageNotes  = `Write latency ${storageLatency}ms exceeds threshold (${THRESHOLDS.stoLatency}ms).`;
  }

  // Connectivity — enriched with network interface details
  const netConnStatus = networkService.getStatus();
  let netStatus  = 'PASS';
  let netLatency = parseFloat(_state.netLatency.toFixed(1));
  let netNotes   = '';
  if (faults.has('network_disconnect')) {
    netStatus  = 'FAIL';
    netLatency = null;
    netNotes   = 'Network interface down. No DHCP lease or link detected.';
  } else if (netLatency > THRESHOLDS.netLatency) {
    netStatus = 'WARN';
    netNotes  = `RTT ${netLatency}ms exceeds threshold (${THRESHOLDS.netLatency}ms). ` +
                `SSID: ${netConnStatus.ssid}, IP: ${netConnStatus.ipAddress}.`;
  } else {
    netNotes = `SSID: ${netConnStatus.ssid}, IP: ${netConnStatus.ipAddress}, ` +
               `loss: ${netConnStatus.packetLossEstimate}%.`;
  }

  return [
    {
      id:          'camera',
      name:        'Camera Module',
      status:      cameraStatus,
      latency:     cameraLatency,
      lastChecked: now,
      notes:       cameraNotes,
    },
    {
      id:          'sensors',
      name:        'Environmental Sensors',
      status:      sensorsStatus,
      latency:     sensorsLatency,
      lastChecked: now,
      notes:       sensorsNotes,
    },
    {
      id:          'storage',
      name:        'SD Storage',
      status:      storageStatus,
      latency:     storageLatency,
      lastChecked: now,
      notes:       storageNotes,
    },
    {
      id:            'connectivity',
      name:          'Network Connectivity',
      status:        netStatus,
      latency:       netLatency,
      lastChecked:   now,
      notes:         netNotes,
      // Extended fields for connectivity panel
      wifiConnected: netConnStatus.connected,
      interfaceName: netConnStatus.interfaceName,
      ssid:          netConnStatus.ssid,
      ipAddress:     netConnStatus.ipAddress,
      packetLoss:    netConnStatus.packetLossEstimate,
      timeoutCount:  netConnStatus.timeoutCount,
    },
  ];
}

module.exports = { getSimulatedTelemetry, getSubsystemStatus };
