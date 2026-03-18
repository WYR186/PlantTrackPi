/*
  PlantTrack Pi — Real Hardware Network Provider

  Probes actual network interfaces on Linux/Raspberry Pi OS using
  standard system commands available on any Raspberry Pi 4 deployment.

  ── Activation ───────────────────────────────────────────────────────
  Set environment variable: HARDWARE_MODE=real
  Optionally configure:
    INTERFACE_NAME=wlan0     (default: wlan0)
    PING_TARGET=8.8.8.8      (default: 8.8.8.8)

  ── System requirements ──────────────────────────────────────────────
  - nmcli     (NetworkManager CLI — included in Raspberry Pi OS Full)
  - ping      (iputils-ping)
  - ip        (iproute2)

  Install if missing:
    sudo apt-get install network-manager iputils-ping iproute2

  ── Stub status ──────────────────────────────────────────────────────
  This provider is structured but NOT tested on hardware. Each function
  below has a documented production command and a fallback that returns
  null/false if the command is unavailable or fails.
*/

'use strict';

const { exec }      = require('child_process');
const { promisify } = require('util');
const execAsync     = promisify(exec);

const INTERFACE_NAME = process.env.INTERFACE_NAME || 'wlan0';
const PING_TARGET    = process.env.PING_TARGET    || '8.8.8.8';
const EXEC_TIMEOUT   = 3000; // ms — shell command timeout

// ── Interface status via nmcli ───────────────────────────────

/**
 * Returns Wi-Fi interface state using nmcli.
 *
 * Command:
 *   nmcli -t -f GENERAL.STATE,GENERAL.CONNECTION,IP4.ADDRESS device show wlan0
 *
 * Returns connected=true when GENERAL.STATE contains "100 (connected)".
 */
async function getInterfaceStatus() {
  try {
    const { stdout } = await execAsync(
      `nmcli -t -f GENERAL.STATE,GENERAL.CONNECTION,IP4.ADDRESS device show ${INTERFACE_NAME}`,
      { timeout: EXEC_TIMEOUT }
    );

    const lines  = stdout.trim().split('\n');
    const getVal = (prefix) => (lines.find(l => l.startsWith(prefix)) || '').split(':').slice(1).join(':').trim();

    const state   = getVal('GENERAL.STATE:');
    const ssid    = getVal('GENERAL.CONNECTION:') || null;
    const ip4Line = getVal('IP4.ADDRESS[1]:');
    const ipAddr  = ip4Line ? ip4Line.split('/')[0].trim() : null;

    return {
      connected: state.includes('100'),
      ssid:      ssid && ssid !== '--' ? ssid : null,
      ipAddress: ipAddr || null,
    };
  } catch (err) {
    console.warn('[realNetworkProvider] nmcli failed:', err.message);
    // Fallback: try ip addr
    return getInterfaceStatusFallback();
  }
}

/**
 * Fallback: derive connection state from `ip addr show <interface>`.
 *
 * Command:
 *   ip addr show wlan0
 *
 * Connected if the interface has an inet (IPv4) address assigned.
 */
async function getInterfaceStatusFallback() {
  try {
    const { stdout } = await execAsync(
      `ip addr show ${INTERFACE_NAME}`,
      { timeout: EXEC_TIMEOUT }
    );
    const match = stdout.match(/inet\s+([\d.]+)\//);
    const ipAddress = match ? match[1] : null;
    return { connected: !!ipAddress, ssid: null, ipAddress };
  } catch (_) {
    return { connected: false, ssid: null, ipAddress: null };
  }
}

// ── Reachability via ping ─────────────────────────────────────

/**
 * Measures round-trip time by pinging the target host.
 *
 * Command:
 *   ping -c 1 -W 1 8.8.8.8
 *
 * Returns round-trip time in ms, or null if unreachable / timed out.
 */
async function measureRTT() {
  try {
    const { stdout } = await execAsync(
      `ping -c 1 -W 1 ${PING_TARGET}`,
      { timeout: EXEC_TIMEOUT }
    );
    // Match both "time=12.3 ms" and "time=12.3ms"
    const match = stdout.match(/time=([\d.]+)\s*ms/);
    return match ? parseFloat(match[1]) : null;
  } catch (_) {
    // ping exits non-zero when host is unreachable
    return null;
  }
}

// ── Combined probe ────────────────────────────────────────────

/**
 * Returns a real connectivity probe result.
 * Both checks run in parallel for speed.
 * Gracefully returns connected=false if commands fail.
 *
 * @returns {Promise<{
 *   connected: boolean,
 *   latencyMs: number|null,
 *   ssid: string|null,
 *   ipAddress: string|null,
 *   interfaceName: string
 * }>}
 */
async function probe() {
  const [status, latencyMs] = await Promise.all([
    getInterfaceStatus(),
    measureRTT(),
  ]);

  return {
    connected:     status.connected,
    latencyMs:     status.connected ? latencyMs : null,
    ssid:          status.ssid,
    ipAddress:     status.ipAddress,
    interfaceName: INTERFACE_NAME,
  };
}

module.exports = { probe };
