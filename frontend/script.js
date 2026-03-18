/*
  PlantTrack Pi — Embedded Validation & Diagnostics Framework
  Frontend controller: polling, rendering, Chart.js, controls.
*/

const API_BASE = 'http://localhost:3000/api';
const POLL_INTERVAL = 10000; // 10 seconds

// ── Chart instances (stored so we can update them) ──────────
const charts = {
  cpu:        null,
  memory:     null,
  temp:       null,
  camLatency: null,
  netLatency: null,  // added by connectivity patch
};

// ── Utility helpers ─────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch (_) {
    return ts;
  }
}

function formatLatency(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 9999) return 'TIMEOUT';
  return ms + ' ms';
}

function statusClass(status) {
  if (!status) return 'unknown';
  return status.toLowerCase();
}

function setControlsStatus(msg, isError = false) {
  const el = document.getElementById('controlsStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#c0392b' : '#2F8654';
}

// ── API fetch helpers ───────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── System Summary ─────────────────────────────────────────

async function fetchSystemSummary() {
  try {
    const data = await apiFetch('/system/summary');
    const statusEl = document.getElementById('summaryStatus');
    const subsEl   = document.getElementById('summarySubsystems');
    const runEl    = document.getElementById('summaryLastRun');
    const faultEl  = document.getElementById('summaryFaultCount');

    if (statusEl) {
      statusEl.textContent = data.overallStatus || '—';
      statusEl.style.color = colorForStatus(data.overallStatus);
    }
    if (subsEl)   subsEl.textContent   = data.activeSubsystems ?? '—';
    if (runEl)    runEl.textContent    = data.lastTestRun ? formatTimestamp(data.lastTestRun) : 'Never';
    if (faultEl)  faultEl.textContent  = data.faultCount ?? '0';
  } catch (err) {
    console.warn('fetchSystemSummary error:', err.message);
  }
}

function colorForStatus(status) {
  if (!status) return '#2F8654';
  switch (status.toUpperCase()) {
    case 'PASS': return '#27ae60';
    case 'FAIL': return '#e74c3c';
    case 'WARN': return '#e67e22';
    default:     return '#2F8654';
  }
}

// ── Subsystem Cards ─────────────────────────────────────────

async function fetchSubsystems() {
  try {
    const data = await apiFetch('/subsystems');
    renderSubsystemCards(data);
  } catch (err) {
    console.warn('fetchSubsystems error:', err.message);
    const container = document.getElementById('subsystemCards');
    if (container) {
      container.innerHTML = '<p style="color:#c0392b;padding:1em;">Could not load subsystem status. Is the backend running?</p>';
    }
  }
}

function renderSubsystemCards(subsystems) {
  const container = document.getElementById('subsystemCards');
  if (!container) return;

  if (!subsystems || subsystems.length === 0) {
    container.innerHTML = '<p style="color:#999;font-style:italic;">No subsystem data available.</p>';
    return;
  }

  container.innerHTML = subsystems.map(sub => {
    const st = (sub.status || 'UNKNOWN').toUpperCase();
    const cardClass = 'subsystem-card subsystem-card--' + st.toLowerCase();
    const badgeClass = 'badge badge-' + st.toLowerCase();
    const dotClass = 'status-indicator status-indicator--' + st.toLowerCase();

    return `
      <div class="${cardClass}">
        <div class="subsystem-card__name">
          <span class="${dotClass}"></span>${sub.name || sub.id}
        </div>
        <div class="subsystem-card__row">
          <span class="subsystem-card__label">Status</span>
          <span class="${badgeClass}">${st}</span>
        </div>
        <div class="subsystem-card__row">
          <span class="subsystem-card__label">Latency</span>
          <span>${formatLatency(sub.latency)}</span>
        </div>
        <div class="subsystem-card__row">
          <span class="subsystem-card__label">Last Checked</span>
          <span>${formatTimestamp(sub.lastChecked)}</span>
        </div>
        ${sub.notes ? `<div class="subsystem-card__notes">${sub.notes}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ── Telemetry & Charts ──────────────────────────────────────

function buildChartConfig(label, color, data, labels) {
  return {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => formatTimestamp(items[0].label),
          },
        },
      },
      scales: {
        x: {
          display: false,
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 10 } },
        },
      },
    },
  };
}

async function fetchTelemetryHistory() {
  try {
    const history = await apiFetch('/telemetry/history');
    updateCharts(history);
  } catch (err) {
    console.warn('fetchTelemetryHistory error:', err.message);
  }
}

function updateCharts(history) {
  if (!history || history.length === 0) return;

  const last20 = history.slice(-20);
  const labels      = last20.map(s => s.timestamp);
  const cpuData     = last20.map(s => s.cpuUsage ?? null);
  const memData     = last20.map(s => s.memoryUsage ?? null);
  const tempData    = last20.map(s => s.temperature ?? null);
  const camLatData  = last20.map(s => s.cameraLatency ?? null);

  const GREEN  = '#2F8654';
  const TEAL   = '#00796b';
  const AMBER  = '#e67e22';
  const BLUE   = '#2980b9';

  if (charts.cpu) {
    charts.cpu.data.labels = labels;
    charts.cpu.data.datasets[0].data = cpuData;
    charts.cpu.update('none');
  } else {
    const ctx = document.getElementById('chartCpu');
    if (ctx) charts.cpu = new Chart(ctx, buildChartConfig('CPU %', GREEN, cpuData, labels));
  }

  if (charts.memory) {
    charts.memory.data.labels = labels;
    charts.memory.data.datasets[0].data = memData;
    charts.memory.update('none');
  } else {
    const ctx = document.getElementById('chartMemory');
    if (ctx) charts.memory = new Chart(ctx, buildChartConfig('Memory %', TEAL, memData, labels));
  }

  if (charts.temp) {
    charts.temp.data.labels = labels;
    charts.temp.data.datasets[0].data = tempData;
    charts.temp.update('none');
  } else {
    const ctx = document.getElementById('chartTemp');
    if (ctx) charts.temp = new Chart(ctx, buildChartConfig('Temp °C', AMBER, tempData, labels));
  }

  if (charts.camLatency) {
    charts.camLatency.data.labels = labels;
    charts.camLatency.data.datasets[0].data = camLatData;
    charts.camLatency.update('none');
  } else {
    const ctx = document.getElementById('chartCamLatency');
    if (ctx) charts.camLatency = new Chart(ctx, buildChartConfig('Camera ms', BLUE, camLatData, labels));
  }

  // Network latency chart — added by connectivity patch
  const netLatData = last20.map(s => s.networkLatency ?? null);
  const PURPLE = '#8e44ad';
  if (charts.netLatency) {
    charts.netLatency.data.labels = labels;
    charts.netLatency.data.datasets[0].data = netLatData;
    charts.netLatency.update('none');
  } else {
    const ctx = document.getElementById('chartNetLatency');
    if (ctx) charts.netLatency = new Chart(ctx, buildChartConfig('Network RTT ms', PURPLE, netLatData, labels));
  }
}

// ── Fault Events Table ──────────────────────────────────────

async function fetchFaultEvents() {
  try {
    const events = await apiFetch('/events');
    renderFaultTable(events);
  } catch (err) {
    console.warn('fetchFaultEvents error:', err.message);
  }
}

function renderFaultTable(events) {
  const tbody = document.getElementById('faultEventsBody');
  if (!tbody) return;

  if (!events || events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No events recorded yet. Run validation to generate events.</td></tr>';
    return;
  }

  const last20 = [...events].reverse().slice(0, 20);

  tbody.innerHTML = last20.map(ev => `
    <tr>
      <td>${formatTimestamp(ev.timestamp)}</td>
      <td>${ev.type || '—'}</td>
      <td>${ev.subsystem || ev.faultType || '—'}</td>
      <td>${ev.details || ev.message || ev.description || '—'}</td>
    </tr>
  `).join('');
}

// ── Connectivity Status Panel ────────────────────────────────

async function fetchConnectivityStatus() {
  try {
    const data = await apiFetch('/connectivity/status');
    renderConnectivity(data);
  } catch (err) {
    console.warn('fetchConnectivityStatus error:', err.message);
  }
}

function renderConnectivity(data) {
  if (!data) return;

  // Wi-Fi badge
  const badge = document.getElementById('wifiBadge');
  if (badge) {
    if (data.connected) {
      badge.textContent = 'Connected';
      badge.className   = 'wifi-badge wifi-badge--connected';
    } else {
      badge.textContent = 'Disconnected';
      badge.className   = 'wifi-badge wifi-badge--disconnected';
    }
  }

  // Interface fields
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '—';
  };

  set('connInterface',     data.interfaceName);
  set('connSsid',          data.ssid          || (data.connected ? '—' : 'n/a'));
  set('connIp',            data.ipAddress     || (data.connected ? '—' : 'n/a'));
  set('connLastDisconnect', data.lastDisconnect ? formatTimestamp(data.lastDisconnect) : 'None');
  set('connLastReconnect',  data.lastReconnect  ? formatTimestamp(data.lastReconnect)  : 'None');

  // Reachability stats
  const latencyEl = document.getElementById('connLatency');
  if (latencyEl) latencyEl.textContent = data.connected ? '—' : 'n/a'; // updated below via subsystem card

  const lossEl = document.getElementById('connPacketLoss');
  if (lossEl) lossEl.textContent = data.connected ? `${data.packetLossEstimate ?? 0}%` : '100%';

  const timeoutEl = document.getElementById('connTimeouts');
  if (timeoutEl) timeoutEl.textContent = data.timeoutCount ?? 0;

  // Transitions list
  const list = document.getElementById('connTransitionList');
  if (!list) return;

  const transitions = data.recentTransitions || [];
  if (transitions.length === 0) {
    list.innerHTML = '<li class="transition-list__empty">No transitions recorded yet.</li>';
    return;
  }

  list.innerHTML = transitions.map(t => {
    const typeKey  = (t.type || '').toLowerCase().replace('network_', '');
    const liClass  = `t-${typeKey}`;
    const timeStr  = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '—';
    return `<li class="${liClass}">
      <span class="t-time">${timeStr}</span>
      <strong>${t.type || '—'}</strong>
      ${t.details ? ` — ${t.details}` : ''}
    </li>`;
  }).join('');
}

// ── Latest Report ───────────────────────────────────────────

async function fetchLatestReport() {
  try {
    const report = await apiFetch('/reports/latest');
    renderReport(report);
  } catch (err) {
    console.warn('fetchLatestReport error:', err.message);
  }
}

function renderConnectivitySection(conn) {
  if (!conn) return '';
  const badgeCls = conn.connected ? 'badge-pass' : 'badge-fail';
  const label    = conn.connected ? 'CONNECTED' : 'DISCONNECTED';

  const transitions = (conn.recentTransitions || []).slice(0, 3).map(t => {
    const timeStr = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '—';
    return `<li>${timeStr} — <strong>${t.type}</strong></li>`;
  }).join('') || '<li>None</li>';

  return `
    <div class="report-root-causes" style="margin-top:1em;">
      <h4>Connectivity Summary</h4>
      <table class="report-subsystem-table" style="margin-bottom:0.5em;">
        <tr>
          <td><strong>Status</strong></td>
          <td><span class="badge ${badgeCls}">${label}</span></td>
        </tr>
        <tr><td>Interface</td><td>${conn.interfaceName || '—'}</td></tr>
        <tr><td>SSID</td><td>${conn.ssid || (conn.connected ? '—' : 'n/a')}</td></tr>
        <tr><td>IP Address</td><td>${conn.ipAddress || (conn.connected ? '—' : 'n/a')}</td></tr>
        <tr><td>Latency</td><td>${formatLatency(conn.latencyMs)}</td></tr>
        <tr><td>Packet Loss</td><td>${conn.packetLossEstimate ?? '—'}%</td></tr>
        <tr><td>Timeouts</td><td>${conn.timeoutCount ?? '—'}</td></tr>
        <tr><td>Last Disconnect</td><td>${conn.lastDisconnect ? formatTimestamp(conn.lastDisconnect) : 'None'}</td></tr>
        <tr><td>Last Reconnect</td><td>${conn.lastReconnect ? formatTimestamp(conn.lastReconnect) : 'None'}</td></tr>
      </table>
      <p style="font-size:0.85em;color:#888;margin:0.3em 0 0.2em;">Recent transitions:</p>
      <ul style="font-size:0.85em;padding-left:1.2em;color:#555;">${transitions}</ul>
    </div>
  `;
}

function renderReport(report) {
  const container = document.getElementById('reportContainer');
  if (!container) return;

  if (!report || !report.reportId) {
    container.innerHTML = '<p class="report-empty">No report generated yet. Click "Run Validation" to generate the first report.</p>';
    return;
  }

  const st = (report.overallStatus || 'UNKNOWN').toUpperCase();
  const badgeClass = 'badge badge-' + st.toLowerCase();

  const subsystemRows = (report.subsystemSummary || []).map(sub => {
    const sst = (sub.status || 'UNKNOWN').toUpperCase();
    return `
      <tr>
        <td>${sub.name || sub.id}</td>
        <td><span class="badge badge-${sst.toLowerCase()}">${sst}</span></td>
        <td>${formatLatency(sub.latency)}</td>
        <td>${sub.notes || '—'}</td>
      </tr>
    `;
  }).join('');

  const rcNotes = (report.rootCauseNotes || []).map(note =>
    `<li>${note}</li>`
  ).join('');

  const summary = report.summary || {};
  const metrics = report.metrics || {};

  container.innerHTML = `
    <div class="report-header">
      <div>
        <strong>Report ID:</strong> <code>${report.reportId}</code><br/>
        <span class="report-meta">Generated: ${formatTimestamp(report.timestamp)}</span>
      </div>
      <span class="${badgeClass}">${st}</span>
    </div>

    <p><strong>Subsystems:</strong> ${summary.total ?? '—'} total —
       ${summary.passed ?? 0} passed, ${summary.failed ?? 0} failed, ${summary.warned ?? 0} warned</p>
    ${report.simulationMode ? '<p style="font-size:0.85em;color:#888;margin-top:0.3em;">Simulation mode — values are synthetic.</p>' : ''}

    <table class="report-subsystem-table">
      <thead>
        <tr>
          <th>Subsystem</th>
          <th>Status</th>
          <th>Latency</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${subsystemRows}</tbody>
    </table>

    ${metrics.cpuUsage !== undefined ? `
      <p style="font-size:0.88em;color:#555;margin-top:0.5em;">
        Metrics at report time — CPU: ${metrics.cpuUsage?.toFixed(1)}%,
        Memory: ${metrics.memoryUsage?.toFixed(1)}%,
        Temp: ${metrics.temperature?.toFixed(1)}°C
      </p>` : ''}

    ${renderConnectivitySection(report.connectivitySection)}

    <div class="report-root-causes">
      <h4>Root Cause Analysis</h4>
      <ul>${rcNotes || '<li>No notes available.</li>'}</ul>
    </div>
  `;
}

// ── Factory Validation Mode ──────────────────────────────────

const FACTORY_STEP_IDS = ['camera', 'sensors', 'storage', 'connectivity'];
let _currentFactoryRunId = null;

/**
 * Resets all factory step badges to idle state.
 */
function resetFactorySteps() {
  FACTORY_STEP_IDS.forEach(id => {
    const row = document.getElementById(`fstep-${id}`);
    if (!row) return;
    row.className = 'factory-step';
    const badge   = row.querySelector('.factory-step__badge');
    const latency = row.querySelector('.factory-step__latency');
    if (badge)   { badge.textContent = '—'; badge.className = 'factory-step__badge factory-step__badge--idle'; }
    if (latency) { latency.textContent = ''; }
  });
}

/**
 * Renders factory step results from a completed run report.
 */
function renderFactorySteps(steps) {
  (steps || []).forEach(step => {
    const row = document.getElementById(`fstep-${step.subsystem}`);
    if (!row) return;

    const result    = (step.result || 'UNKNOWN').toLowerCase();
    row.className   = `factory-step factory-step--${result}`;

    const badge   = row.querySelector('.factory-step__badge');
    const latency = row.querySelector('.factory-step__latency');

    if (badge) {
      badge.textContent = step.result || '—';
      badge.className   = `factory-step__badge factory-step__badge--${result}`;
    }
    if (latency) {
      latency.textContent = step.latencyMs !== null && step.latencyMs !== undefined
        ? `${step.latencyMs} ms`
        : (step.result === 'FAIL' ? 'FAIL' : '—');
    }
  });
}

/**
 * Renders the factory result summary panel.
 */
function renderFactoryResult(report) {
  const container = document.getElementById('factoryResult');
  if (!container) return;
  container.style.display = '';

  const overallEl = document.getElementById('factoryOverall');
  const detailEl  = document.getElementById('factoryResultDetail');
  const exportBtn = document.getElementById('btnFactoryExport');

  if (overallEl) {
    const colors = { PASS: '#27ae60', WARN: '#e67e22', FAIL: '#e74c3c' };
    const icons  = { PASS: '✓', WARN: '⚠', FAIL: '✗' };
    const res    = report.overallResult || 'UNKNOWN';
    overallEl.textContent = `${icons[res] || '?'} ${res}`;
    overallEl.style.color = colors[res] || '#555';
  }

  if (detailEl) {
    const s = report.summary || {};
    detailEl.textContent =
      `Run ID: ${report.runId} — ` +
      `${s.total} subsystems: ${s.passed} passed, ${s.failed} failed, ${s.warned} warned. ` +
      `Completed: ${formatTimestamp(report.completedAt)}`;
  }

  if (exportBtn) {
    exportBtn.style.display = '';
    exportBtn.onclick = () => {
      window.open(`${API_BASE}/factory/runs/${report.runId}/export`, '_blank');
    };
  }
}

/**
 * Fetches and renders the list of past factory runs.
 */
async function fetchFactoryRuns() {
  try {
    const data = await apiFetch('/factory/runs');
    const list = document.getElementById('factoryRunsList');
    if (!list) return;

    if (!data.runs || data.runs.length === 0) {
      list.innerHTML = '<li class="factory-runs-empty">No factory runs yet.</li>';
      return;
    }

    // Fetch result for each run (limited to first 5 for display)
    const recentIds = data.runs.slice(0, 5);
    const reports   = await Promise.all(
      recentIds.map(id => apiFetch(`/factory/runs/${id}`).catch(() => null))
    );

    list.innerHTML = reports
      .filter(Boolean)
      .map(r => {
        const res = r.overallResult || 'UNKNOWN';
        const cls = `run-result-${res.toLowerCase()}`;
        const ts  = r.completedAt ? new Date(r.completedAt).toLocaleString() : '—';
        return `<li>
          <span>${r.runId}</span>
          <span>${ts}</span>
          <span class="${cls}">${res}</span>
        </li>`;
      }).join('');
  } catch (err) {
    console.warn('fetchFactoryRuns error:', err.message);
  }
}

/**
 * Handles the "Start Factory Validation" button click.
 * Posts to /api/factory/run and renders results as they arrive.
 */
async function handleFactoryRun() {
  const btn = document.getElementById('btnFactoryRun');
  const runIdEl = document.getElementById('factoryRunId');

  if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }

  // Hide previous result
  const resultEl = document.getElementById('factoryResult');
  if (resultEl) resultEl.style.display = 'none';
  const exportBtn = document.getElementById('btnFactoryExport');
  if (exportBtn) exportBtn.style.display = 'none';

  resetFactorySteps();

  // Show running state on all steps
  FACTORY_STEP_IDS.forEach(id => {
    const row = document.getElementById(`fstep-${id}`);
    if (!row) return;
    row.className = 'factory-step factory-step--running';
    const badge = row.querySelector('.factory-step__badge');
    if (badge) { badge.textContent = 'RUNNING'; badge.className = 'factory-step__badge factory-step__badge--running'; }
  });

  if (runIdEl) runIdEl.textContent = 'Running…';

  try {
    const report = await apiPost('/factory/run', {});
    _currentFactoryRunId = report.runId;
    if (runIdEl) runIdEl.textContent = report.runId;

    renderFactorySteps(report.steps);
    renderFactoryResult(report);
    await fetchFactoryRuns();
  } catch (err) {
    if (runIdEl) runIdEl.textContent = 'Error: ' + err.message;
    resetFactorySteps();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Start Factory Validation'; }
  }
}

// ── Refresh all panels ──────────────────────────────────────

async function refreshAll() {
  await Promise.all([
    fetchSystemSummary(),
    fetchSubsystems(),
    fetchTelemetryHistory(),
    fetchFaultEvents(),
    fetchLatestReport(),
    fetchConnectivityStatus(),
    fetchFactoryRuns(),
  ]);
}

// ── Button: Run Validation ──────────────────────────────────

async function handleRunTests() {
  const btn = document.getElementById('btnRunTests');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Running...';
  }
  setControlsStatus('Running validation tests...');

  try {
    const result = await apiPost('/tests/run', {});
    const st = result.overallStatus || 'DONE';
    setControlsStatus(`Validation complete — ${st}. Refreshing dashboard...`);
    await refreshAll();
    setControlsStatus(`Last run: ${formatTimestamp(result.timestamp)} — ${st}`);
  } catch (err) {
    setControlsStatus('Validation failed: ' + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Run Validation';
    }
  }
}

// ── Buttons: Inject Fault ───────────────────────────────────

async function handleInjectFault(faultType) {
  setControlsStatus(`Injecting fault: ${faultType}...`);
  try {
    const result = await apiPost('/faults/inject', { faultType });
    if (result.success) {
      setControlsStatus(`Fault injected: ${faultType}. Refreshing...`);
      await refreshAll();
      setControlsStatus(`Active fault: ${faultType} (injected at ${formatTimestamp(result.timestamp)})`);
    } else {
      setControlsStatus('Fault injection failed: ' + (result.error || 'unknown error'), true);
    }
  } catch (err) {
    setControlsStatus('Fault injection error: ' + err.message, true);
  }
}

// ── Button: Clear Faults ────────────────────────────────────

async function handleClearFaults() {
  setControlsStatus('Clearing all active faults...');
  try {
    const result = await apiPost('/faults/clear', {});
    if (result.success) {
      setControlsStatus(`Cleared ${result.cleared} fault(s). Refreshing...`);
      await refreshAll();
      setControlsStatus('All faults cleared.');
    } else {
      setControlsStatus('Clear faults failed.', true);
    }
  } catch (err) {
    setControlsStatus('Clear faults error: ' + err.message, true);
  }
}

// ── Contact Form ────────────────────────────────────────────

async function handleContactSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const statusEl = document.getElementById('contactStatus');

  const payload = {
    name:    document.getElementById('userName')?.value    || '',
    email:   document.getElementById('userEmail')?.value   || '',
    message: document.getElementById('userMessage')?.value || '',
  };

  try {
    const result = await apiPost('/contact', payload);
    if (result.success) {
      if (statusEl) statusEl.textContent = 'Message sent successfully. Thank you!';
      form.reset();
    } else {
      if (statusEl) { statusEl.textContent = 'Submission failed.'; statusEl.style.color = '#c0392b'; }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.style.color = '#c0392b';
    }
  }
}

// ── Wire up event listeners ─────────────────────────────────

function attachListeners() {
  const btnRun = document.getElementById('btnRunTests');
  if (btnRun) btnRun.addEventListener('click', handleRunTests);

  const btnClear = document.getElementById('btnClearFaults');
  if (btnClear) btnClear.addEventListener('click', handleClearFaults);

  document.querySelectorAll('.btn-inject-fault').forEach(btn => {
    btn.addEventListener('click', () => {
      const faultType = btn.dataset.fault;
      if (faultType) handleInjectFault(faultType);
    });
  });

  const btnFactory = document.getElementById('btnFactoryRun');
  if (btnFactory) btnFactory.addEventListener('click', handleFactoryRun);

  const contactForm = document.getElementById('contactForm');
  if (contactForm) contactForm.addEventListener('submit', handleContactSubmit);

  // Footer year
  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// ── Auto-poll ───────────────────────────────────────────────

function startPolling() {
  setInterval(async () => {
    await Promise.all([
      fetchSystemSummary(),
      fetchSubsystems(),
      fetchTelemetryHistory(),
      fetchFaultEvents(),
      fetchConnectivityStatus(),
    ]);
  }, POLL_INTERVAL);
}

// ── Init ────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  attachListeners();
  await refreshAll();
  startPolling();
});
