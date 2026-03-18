/*
  PlantTrack Pi — Network Service
  Manages Wi-Fi / network connectivity state.

  ── Architecture ─────────────────────────────────────────────────────
  This service owns the connectivity state machine (transition detection,
  event emission, timeout counting). The actual hardware probe is delegated
  to a provider selected by HARDWARE_MODE:

    simulation (default) — simulationNetworkProvider (synthetic, fault-aware)
    real                 — realNetworkProvider        (nmcli, ping, ip addr)

  The provider answers: "Is the network up right now, and what is the RTT?"
  This service answers: "What has happened to the network over time?"

  ── Real mode ────────────────────────────────────────────────────────
  In HARDWARE_MODE=real, a background probe interval (15s) calls the
  real provider asynchronously and caches the result. tick() always reads
  from this cache, keeping the telemetry pipeline synchronous.

  ── Swap point ───────────────────────────────────────────────────────
  To deploy on hardware: set HARDWARE_MODE=real.
  No other code changes needed.
*/

'use strict';

const path              = require('path');
const { nowISO }        = require('../utils/time');
const { appendToArray } = require('../utils/fileStore');
const provider          = require('../providers/networkProvider');

const EVENTS_FILE    = path.join(__dirname, '..', 'data', 'events.json');
const HARDWARE_MODE  = (process.env.HARDWARE_MODE || 'simulation').toLowerCase();

// ── Probe cache ───────────────────────────────────────────────
// Updated by tick() (simulation) or background probe interval (real mode).
let _probeCache = {
  connected:     true,
  latencyMs:     null,
  ssid:          null,
  ipAddress:     null,
  interfaceName: 'wlan0',
};

// ── Connectivity state ────────────────────────────────────────
const _state = {
  lastDisconnect:       null,
  lastReconnect:        null,
  timeoutCount:         0,
  packetLossEstimate:   0.0,
  recentTransitions:    [],   // { type, timestamp, details }[]
  _prevConnected:       true,
  _highLatencyTicks:    0,
};

// ── Real mode: background probe interval ──────────────────────
// Keeps _probeCache fresh without blocking the sync telemetry pipeline.
const HIGH_LATENCY_THRESHOLD_MS = 150;

if (HARDWARE_MODE === 'real') {
  const PROBE_INTERVAL_MS = 15000;
  const runRealProbe = async () => {
    try {
      const result = await provider.probe({});
      _probeCache = { ...result };
      // Trigger state machine update using cached latency
      _updateStateMachine(_probeCache.connected, _probeCache.latencyMs);
    } catch (err) {
      console.error('[networkService] Real probe error:', err.message);
    }
  };
  runRealProbe(); // initial probe on startup
  setInterval(runRealProbe, PROBE_INTERVAL_MS);
  console.log(`[networkService] Real hardware probe interval: ${PROBE_INTERVAL_MS / 1000}s`);
}

// ── Internal helpers ──────────────────────────────────────────

function _emitEvent(type, details) {
  const ts = nowISO();
  _state.recentTransitions.push({ type, timestamp: ts, details });
  if (_state.recentTransitions.length > 20) _state.recentTransitions.shift();

  appendToArray(EVENTS_FILE, {
    timestamp: ts,
    type,
    subsystem: 'connectivity',
    faultType: null,
    details,
  }, 100);

  console.log(`[networkService] ${type} — ${details}`);
}

/**
 * Core state machine — detects transitions and emits events.
 * Shared between tick() (simulation) and the real mode probe callback.
 *
 * @param {boolean} nowConnected
 * @param {number|null} latencyMs
 */
function _updateStateMachine(nowConnected, latencyMs) {
  // Transition: connected → disconnected
  if (!nowConnected && _state._prevConnected) {
    _state.lastDisconnect     = nowISO();
    _state.packetLossEstimate = 100.0;
    _state.timeoutCount      += 1;
    _state._prevConnected     = false;
    _state._highLatencyTicks  = 0;
    _emitEvent(
      'NETWORK_DISCONNECTED',
      `Interface ${_probeCache.interfaceName} link lost — no DHCP lease`
    );
  }

  // Transition: disconnected → reconnected
  if (nowConnected && !_state._prevConnected) {
    _state.lastReconnect      = nowISO();
    _state.packetLossEstimate = 0.0;
    _state._prevConnected     = true;
    _emitEvent(
      'NETWORK_RECOVERED',
      `Interface ${_probeCache.interfaceName} link restored — DHCP lease acquired, IP ${_probeCache.ipAddress}`
    );
  }

  // Steady-state: connected
  if (nowConnected && latencyMs !== null) {
    const excess = Math.max(0, latencyMs - 80);
    _state.packetLossEstimate = parseFloat(Math.min(15.0, excess / 10).toFixed(1));

    if (Math.random() < 0.04) {
      _state.timeoutCount += 1;
      _emitEvent(
        'NETWORK_TIMEOUT',
        `ICMP request timed out on ${_probeCache.interfaceName} — transient packet loss`
      );
    }

    if (latencyMs > HIGH_LATENCY_THRESHOLD_MS) {
      _state._highLatencyTicks += 1;
      if (_state._highLatencyTicks >= 3) {
        _emitEvent(
          'NETWORK_HIGH_LATENCY',
          `RTT ${latencyMs.toFixed(0)}ms exceeds threshold (${HIGH_LATENCY_THRESHOLD_MS}ms) on ${_probeCache.interfaceName}`
        );
        _state._highLatencyTicks = 0;
      }
    } else {
      _state._highLatencyTicks = 0;
    }
  }

  if (!nowConnected) _state.packetLossEstimate = 100.0;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Update connectivity state using the simulation provider.
 * Call once per telemetry cycle (every 10s) from simulationService.
 * In REAL mode this is a no-op — the background probe handles updates.
 *
 * @param {string[]} activeFaults
 * @param {number|null} latencyMs  Current network latency from drift engine
 */
function tick(activeFaults, latencyMs) {
  if (HARDWARE_MODE === 'real') return; // real mode: managed by background probe

  // Get fresh probe result from simulation provider (synchronous)
  const probe = provider.probe({ activeFaults, latencyMs });

  // Update probe cache
  _probeCache.connected     = probe.connected;
  _probeCache.latencyMs     = probe.latencyMs;
  _probeCache.ssid          = probe.ssid;
  _probeCache.ipAddress     = probe.ipAddress;
  _probeCache.interfaceName = probe.interfaceName;

  _updateStateMachine(probe.connected, latencyMs);
}

/**
 * Returns the current connectivity status snapshot.
 * Pure read from cached state — safe to call from any route.
 * No activeFaults parameter needed; state is managed by tick() / notifyFaultChange().
 *
 * @returns {object}
 */
function getStatus() {
  return {
    connected:          _probeCache.connected,
    interfaceName:      _probeCache.interfaceName,
    ssid:               _probeCache.ssid,
    ipAddress:          _probeCache.ipAddress,
    lastDisconnect:     _state.lastDisconnect,
    lastReconnect:      _state.lastReconnect,
    timeoutCount:       _state.timeoutCount,
    packetLossEstimate: _state.packetLossEstimate,
    recentTransitions:  [..._state.recentTransitions].reverse().slice(0, 10),
    simulationMode:     HARDWARE_MODE !== 'real',
  };
}

/**
 * Immediately records a connect/disconnect transition in response to
 * manual fault injection/clearance. Simulation-mode only.
 * Provides instant feedback without waiting for the next 10s tick.
 *
 * @param {string[]} activeFaults — faults AFTER the change
 */
function notifyFaultChange(activeFaults) {
  if (HARDWARE_MODE === 'real') return; // real mode: hardware state is authoritative

  const isDown = new Set(activeFaults).has('network_disconnect');
  const nowConnected = !isDown;

  // Update probe cache immediately
  const { WIFI_PROFILE } = require('../providers/simulationNetworkProvider');
  _probeCache.connected  = nowConnected;
  _probeCache.ssid       = nowConnected ? WIFI_PROFILE.ssid       : null;
  _probeCache.ipAddress  = nowConnected ? WIFI_PROFILE.ipAddress  : null;

  _updateStateMachine(nowConnected, _probeCache.latencyMs);
}

/**
 * Returns the most recent connectivity transitions, newest first.
 * @param {number} [limit=10]
 * @returns {{ type: string, timestamp: string, details: string }[]}
 */
function getRecentTransitions(limit = 10) {
  return [..._state.recentTransitions].reverse().slice(0, limit);
}

module.exports = { tick, getStatus, getRecentTransitions, notifyFaultChange };
