/*
  PlantTrack Pi — Report Service
  Generates validation reports with rule-based root cause analysis.
*/

'use strict';

const path             = require('path');
const { nowISO }       = require('../utils/time');
const { writeJSON }    = require('../utils/fileStore');
const telemetryService = require('./telemetryService');
const faultService     = require('./faultService');
const networkService   = require('./networkService');

const REPORT_FILE = path.join(__dirname, '..', 'data', 'latestReport.json');

/**
 * Generates a validation report from test results and saves it to disk.
 *
 * @param {object} testResults — output from validationService.runAllTests()
 * @returns {object} report
 */
function generateReport(testResults) {
  const timestamp    = nowISO();
  const reportId     = 'RPT-' + Date.now();
  const activeFaults = faultService.getActiveFaults();
  const metrics      = telemetryService.getLatest();

  const subsystems     = testResults.subsystems || [];
  const overallStatus  = testResults.overallStatus || 'UNKNOWN';
  const summary        = testResults.summary || { total: 0, passed: 0, failed: 0, warned: 0 };

  // ── Connectivity section (added by connectivity patch) ───────
  const netStatus      = networkService.getStatus();
  const connectSub     = subsystems.find(s => s.id === 'connectivity') || {};
  const connectivitySection = {
    status:             connectSub.status || 'UNKNOWN',
    connected:          netStatus.connected,
    interfaceName:      netStatus.interfaceName,
    ssid:               netStatus.ssid,
    ipAddress:          netStatus.ipAddress,
    latencyMs:          connectSub.latency ?? null,
    packetLossEstimate: netStatus.packetLossEstimate,
    timeoutCount:       netStatus.timeoutCount,
    lastDisconnect:     netStatus.lastDisconnect,
    lastReconnect:      netStatus.lastReconnect,
    recentTransitions:  networkService.getRecentTransitions(5),
  };

  // ── Rule-based root cause notes ─────────────────────────────
  const rootCauseNotes = [];

  const failedIds = subsystems
    .filter(s => s.status === 'FAIL')
    .map(s => s.id);

  const warnIds = subsystems
    .filter(s => s.status === 'WARN')
    .map(s => s.id);

  if (failedIds.includes('camera')) {
    rootCauseNotes.push(
      'Camera subsystem failure detected. Verify CSI ribbon cable connection and confirm camera is enabled via raspi-config (Interface Options → Camera). ' +
      'Test with: v4l2-ctl --list-devices'
    );
  }

  if (failedIds.includes('sensors')) {
    rootCauseNotes.push(
      'Sensor I2C timeout. Check wiring on GPIO pins 2 (SDA) and 3 (SCL). ' +
      'Confirm device appears with: i2cdetect -y 1. ' +
      'Verify pull-up resistors are present and I2C is enabled in /boot/config.txt.'
    );
  }

  if (failedIds.includes('storage')) {
    rootCauseNotes.push(
      'SD card write failure. Run filesystem check: sudo fsck /dev/mmcblk0p2. ' +
      'Check available space with: df -h. ' +
      'Consider replacing card if I/O errors persist in dmesg output.'
    );
  }

  if (failedIds.includes('connectivity')) {
    rootCauseNotes.push(
      'Network interface down. Check link status: ifconfig eth0 / ifconfig wlan0. ' +
      'Verify DHCP lease: dhclient -v eth0. ' +
      'Inspect NetworkManager status: nmcli device status.'
    );
  }

  if (warnIds.includes('camera')) {
    rootCauseNotes.push(
      'Camera latency elevated. May indicate USB or CSI bandwidth contention. Reduce concurrent I/O.'
    );
  }

  if (warnIds.includes('sensors')) {
    rootCauseNotes.push(
      'Sensor I2C response time elevated. Check for bus contention from other I2C devices.'
    );
  }

  if (warnIds.includes('storage')) {
    rootCauseNotes.push(
      'Storage write latency elevated. SD card may be near end of write-cycle life. Monitor with iostat.'
    );
  }

  if (warnIds.includes('connectivity')) {
    rootCauseNotes.push(
      'Network latency elevated. Check for packet loss: ping -c 10 8.8.8.8. Inspect interface stats: ip -s link.'
    );
  }

  if (failedIds.length === 0 && warnIds.length === 0) {
    rootCauseNotes.push('All subsystems nominal. No corrective action required.');
  }

  const report = {
    reportId:            reportId,
    timestamp:           timestamp,
    overallStatus:       overallStatus,
    connectivitySection: connectivitySection,
    subsystemSummary: subsystems.map(s => ({
      id:          s.id,
      name:        s.name,
      status:      s.status,
      latency:     s.latency,
      lastChecked: s.lastChecked,
      notes:       s.notes,
    })),
    summary:          summary,
    metrics:          metrics,
    activeFaults:     activeFaults,
    rootCauseNotes:   rootCauseNotes,
    simulationMode:   true,
  };

  writeJSON(REPORT_FILE, report);
  console.log(`[reportService] Report saved: ${reportId} — ${overallStatus}`);

  return report;
}

/**
 * Returns the latest report from disk.
 * @returns {object}
 */
function getLatestReport() {
  const { readJSON } = require('../utils/fileStore');
  return readJSON(REPORT_FILE, {});
}

module.exports = { generateReport, getLatestReport };
