/*
  PlantTrack Pi — Network Provider Factory

  Selects the correct network probe implementation based on HARDWARE_MODE.

  HARDWARE_MODE=simulation  (default) — SimulationNetworkProvider
    - All values are synthetic
    - Connection state derived from active fault injections
    - No shell commands executed

  HARDWARE_MODE=real                  — RealNetworkProvider
    - Calls nmcli, ping, ip addr on the host Linux system
    - Requires Raspberry Pi OS or compatible Linux with NetworkManager
    - See providers/realNetworkProvider.js for setup instructions

  Usage:
    const networkProvider = require('./providers/networkProvider');
    const result = await Promise.resolve(networkProvider.probe(context));
*/

'use strict';

const HARDWARE_MODE = (process.env.HARDWARE_MODE || 'simulation').toLowerCase();

let provider;

if (HARDWARE_MODE === 'real') {
  provider = require('./realNetworkProvider');
  console.log('[networkProvider] Hardware mode: REAL — using system commands (nmcli, ping)');
} else {
  provider = require('./simulationNetworkProvider');
  console.log('[networkProvider] Hardware mode: SIMULATION');
}

module.exports = provider;
