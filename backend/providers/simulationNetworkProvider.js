/*
  PlantTrack Pi — Simulation Network Provider
  Returns synthetic connectivity probe results.

  This provider is active when HARDWARE_MODE=simulation (default).
  It derives connection state from active faults and uses the latency
  value from the simulation drift engine.

  Swap in realNetworkProvider by setting HARDWARE_MODE=real.
*/

'use strict';

// Simulated hardware profile — mirrors a typical Pi Wi-Fi setup
const WIFI_PROFILE = {
  interfaceName: 'wlan0',
  ssid:          'PlantNet-5GHz',
  ipAddress:     '192.168.1.47',
};

/**
 * Returns a synchronous simulated connectivity probe result.
 *
 * @param {{ activeFaults?: string[], latencyMs?: number|null }} context
 * @returns {{ connected: boolean, latencyMs: number|null, ssid: string|null, ipAddress: string|null, interfaceName: string }}
 */
function probe({ activeFaults = [], latencyMs = null } = {}) {
  const isDown = new Set(activeFaults).has('network_disconnect');
  return {
    connected:     !isDown,
    latencyMs:     isDown ? null : latencyMs,
    ssid:          isDown ? null : WIFI_PROFILE.ssid,
    ipAddress:     isDown ? null : WIFI_PROFILE.ipAddress,
    interfaceName: WIFI_PROFILE.interfaceName,
  };
}

module.exports = { probe, WIFI_PROFILE };
