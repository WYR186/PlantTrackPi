# PlantTrack Pi: Embedded Validation & Diagnostics Framework

A Linux-based embedded validation and diagnostics framework targeting Raspberry Pi-class devices. PlantTrack Pi automates subsystem health testing, collects real-time telemetry, injects faults for resilience testing, and provides rule-based root cause analysis — all accessible from a browser-based dashboard.

---

## Purpose

Embedded systems deployed in the field fail in ways that are hard to diagnose remotely. A camera stops responding. An I2C sensor times out. An SD card silently drops writes. PlantTrack Pi addresses this by building a structured validation layer on top of the hardware:

- Each subsystem is tested on a schedule and on-demand
- Failures are logged with timestamps and fault type
- Root cause analysis is performed using deterministic rule matching, not AI
- Telemetry (CPU, memory, temperature, latency) is collected continuously and surfaced in a dashboard

This makes it possible to detect, isolate, and diagnose embedded hardware problems without physical access to the device.

---

## Architecture

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    Raspberry Pi 4 (Host)                        │
  │                                                                 │
  │   ┌──────────────┐    ┌──────────────┐    ┌────────────────┐   │
  │   │  Camera (CSI)│    │ Sensors (I2C)│    │  SD Storage    │   │
  │   │  OV5647      │    │ DHT22 / BMP  │    │  mmcblk0       │   │
  │   └──────┬───────┘    └──────┬───────┘    └──────┬─────────┘   │
  │          │                   │                   │             │
  │          └───────────────────┼───────────────────┘             │
  │                              │                                  │
  │                   ┌──────────▼──────────┐                      │
  │                   │  Validation Engine  │                      │
  │                   │  (Node.js Backend)  │                      │
  │                   └──────────┬──────────┘                      │
  │                              │                                  │
  │              ┌───────────────┼───────────────┐                 │
  │              │               │               │                 │
  │   ┌──────────▼──────┐  ┌────▼────┐  ┌───────▼────────┐        │
  │   │ Telemetry        │  │  REST   │  │  Report Store  │        │
  │   │ Pipeline         │  │  API    │  │  (JSON files)  │        │
  │   │ (metrics.json)   │  │ :3000   │  │                │        │
  │   └──────────────────┘  └────┬────┘  └────────────────┘        │
  │                              │                                  │
  └──────────────────────────────┼──────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Browser Dashboard     │
                    │   (Chart.js + Fetch)    │
                    └─────────────────────────┘
```

---

## Subsystems Validated

| Subsystem | Interface | Test Method |
|-----------|-----------|-------------|
| Camera Module | CSI / V4L2 | Frame capture latency measurement |
| Environmental Sensors | I2C (GPIO 2/3) | Bus acknowledgement + read latency |
| SD Storage | mmcblk0 | Write latency probe |
| Network Connectivity | eth0 / wlan0 | ICMP round-trip time |

---

## Features

- **Automated subsystem self-tests** — triggered on demand or by schedule
- **Fault injection** — simulate camera failure, sensor timeout, network disconnect, or storage failure to verify system behavior under fault conditions
- **Telemetry collection** — CPU usage, memory usage, SoC temperature, and per-subsystem latency, collected every 10 seconds
- **Rule-based root cause analysis** — deterministic rules map failures to probable causes and recommended commands
- **Validation report generation** — each test run produces a structured JSON report with subsystem summary and root cause notes
- **Simulation mode** — all values are synthetic when real hardware is not connected; the dashboard works fully without a Raspberry Pi

---

## Repo Structure

```
PlantTrackPi/
├── backend/
│   ├── data/
│   │   ├── events.json        # Fault and test run event log
│   │   ├── latestReport.json  # Most recent validation report
│   │   └── metrics.json       # Telemetry history (last 100 snapshots)
│   ├── routes/
│   │   ├── systemRoutes.js    # GET /api/health, /api/system/summary, /api/subsystems
│   │   ├── testRoutes.js      # POST /api/tests/run
│   │   ├── telemetryRoutes.js # GET /api/telemetry/latest, /api/telemetry/history
│   │   ├── eventRoutes.js     # GET /api/events
│   │   ├── faultRoutes.js     # POST /api/faults/inject, /api/faults/clear
│   │   ├── reportRoutes.js    # GET /api/reports/latest
│   │   └── contactRoutes.js   # POST /api/contact
│   ├── services/
│   ├── data/
│   │   ├── events.json           # Fault and test run event log
│   │   ├── latestReport.json     # Most recent validation report
│   │   ├── metrics.json          # Telemetry history (last 100 snapshots)
│   │   └── factory_runs/         # Per-run factory validation reports
│   ├── providers/
│   │   ├── networkProvider.js       # Factory: selects provider by HARDWARE_MODE
│   │   ├── simulationNetworkProvider.js  # Synthetic probe (default)
│   │   └── realNetworkProvider.js   # Hardware probe: nmcli, ping, ip addr
│   ├── routes/
│   │   ├── systemRoutes.js       # GET /api/health, /summary, /subsystems, /connectivity/status
│   │   ├── testRoutes.js         # POST /api/tests/run
│   │   ├── telemetryRoutes.js    # GET /api/telemetry/latest, /history
│   │   ├── eventRoutes.js        # GET /api/events
│   │   ├── faultRoutes.js        # POST /api/faults/inject, /clear
│   │   ├── reportRoutes.js       # GET /api/reports/latest
│   │   ├── factoryRoutes.js      # POST /api/factory/run, GET /api/factory/runs
│   │   └── contactRoutes.js      # POST /api/contact
│   ├── services/
│   │   ├── simulationService.js     # Simulated telemetry and subsystem status
│   │   ├── networkService.js        # Wi-Fi state machine, connectivity events
│   │   ├── faultService.js          # In-memory active fault registry
│   │   ├── telemetryService.js      # Auto-collection and history management
│   │   ├── validationService.js     # Runs all tests, triggers report
│   │   ├── reportService.js         # Generates and saves validation reports
│   │   └── factoryValidationService.js  # Sequential 4-step factory mode
│   ├── utils/
│   │   ├── fileStore.js          # JSON read/write/append helpers
│   │   └── time.js               # Timestamp and duration formatting
│   ├── package.json
│   └── server.js
├── docs/
│   └── sample_run/
│       ├── sample_report.json    # Example validation report output
│       ├── sample_report.md      # Markdown rendering of the report
│       ├── sample_metrics.csv    # 20-snapshot telemetry history
│       └── sample_events.jsonl   # Event log from a 3-run session
├── frontend/
│   ├── assets/image/
│   ├── index.html
│   ├── script.js
│   └── style.css
└── README.md
```

---

## How to Run

**Requirements:** Node.js 18+ and npm.

```bash
cd backend
npm install
npm start
```

Open your browser at: **http://localhost:3000**

For development with auto-restart on file changes:

```bash
npm run dev
```

The dashboard auto-polls every 10 seconds. Click **Run Validation** to trigger an immediate test run across all subsystems.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check — returns uptime and timestamp |
| GET | `/api/system/summary` | Overall status, active subsystem count, fault count, last test run |
| GET | `/api/subsystems` | Per-subsystem health check results (status, latency, notes) |
| POST | `/api/tests/run` | Run all subsystem validation tests, generate report |
| GET | `/api/telemetry/latest` | Most recent telemetry snapshot |
| GET | `/api/telemetry/history` | Last 20 telemetry snapshots |
| GET | `/api/events` | Last 50 system events (faults, test runs, injections) |
| POST | `/api/faults/inject` | Body: `{"faultType": "camera_failure"}` — inject a fault |
| POST | `/api/faults/clear` | Clear all active faults |
| GET | `/api/reports/latest` | Most recently generated validation report |
| GET | `/api/connectivity/status` | Live Wi-Fi interface status: SSID, IP, packet loss, transitions |
| POST | `/api/factory/run` | Run the 4-step factory validation sequence — returns full run report |
| GET | `/api/factory/runs` | List past factory run IDs |
| GET | `/api/factory/runs/:runId` | Retrieve a specific factory run report |
| GET | `/api/factory/runs/:runId/export` | Download factory run report as a JSON file |
| POST | `/api/contact` | Body: `{"name","email","message"}` — contact form submission |

**Valid fault types:** `camera_failure`, `sensor_timeout`, `network_disconnect`, `storage_failure`

---

## Example Validation Run

Below is the output of a real session using the dashboard. All values are synthetic (simulation mode).

**Session timeline:**

```
09:20:02  TEST_RUN       — PASS (all 4 subsystems nominal)
09:21:15  NETWORK_TIMEOUT — wlan0 ICMP timeout (transient, auto-resolved)
09:22:08  FAULT_INJECTED — storage_failure
09:22:08  TEST_RUN       — FAIL (SD Storage: I/O error on mmcblk0)
09:22:19  FAULTS_CLEARED
09:23:45  TEST_RUN       — WARN (SD Storage latency 34.1ms, threshold 30ms)
```

**Final run result (WARN):**
- Camera Module:         PASS — 14.2ms
- Environmental Sensors: PASS — 4.8ms
- SD Storage:            WARN — 34.1ms (threshold: 30ms)
- Network Connectivity:  PASS — 38.4ms

Root cause note: *SD card write latency elevated. Monitor with `iostat -x /dev/mmcblk0 1 5`.*

See `docs/sample_run/` for the full report JSON, Markdown rendering, CSV telemetry, and JSONL event log from this session.

---

## Proof-of-Work Artifacts

Sample outputs are committed to `docs/sample_run/` to demonstrate real run data:

| File | Description |
|------|-------------|
| `sample_report.json` | Full validation report including subsystem summary, connectivity section, metrics snapshot, and root cause analysis |
| `sample_report.md` | Human-readable Markdown rendering of the same report |
| `sample_metrics.csv` | 20-snapshot telemetry history (CPU, memory, temp, latencies, Wi-Fi fields) |
| `sample_events.jsonl` | Newline-delimited event log from a 3-run session with fault injection |

These artifacts are representative of the live data the system generates during operation.

---

## Hardware Provider Abstraction

Network connectivity probing is implemented behind a provider interface, allowing the same `networkService.js` state machine to work with synthetic data (development) or real hardware commands (production).

### Provider selection

Set the `HARDWARE_MODE` environment variable before starting the server:

```bash
# Simulation mode (default — no hardware required)
HARDWARE_MODE=simulation npm start

# Real hardware mode (requires Raspberry Pi OS + NetworkManager)
HARDWARE_MODE=real npm start
```

### Provider files

| File | Mode | Description |
|------|------|-------------|
| `backend/providers/simulationNetworkProvider.js` | `simulation` | Returns synthetic probe results; connection state from fault injections |
| `backend/providers/realNetworkProvider.js` | `real` | Calls `nmcli`, `ping`, `ip addr`; structured stub — ready for hardware |
| `backend/providers/networkProvider.js` | factory | Selects provider based on `HARDWARE_MODE` |

### Real mode requirements

```bash
sudo apt-get install network-manager iputils-ping iproute2
```

Optional environment variables for real mode:
```
INTERFACE_NAME=wlan0    # network interface to monitor
PING_TARGET=8.8.8.8     # reachability check target
```

### How real mode works

In real mode, a background probe runs every 15 seconds (separate from the 10s telemetry cycle):
1. Calls `nmcli` to check interface state, SSID, and IP
2. Calls `ping` to measure RTT
3. Updates the connectivity state cache
4. Transition events (`NETWORK_DISCONNECTED`, `NETWORK_RECOVERED`) fire on state change

---

## Factory Validation Mode

A fixed, sequential 4-step validation workflow with traceable run IDs. Designed to simulate production board bring-up testing.

### Run ID format

```
PTK-YYYYMMDD-HHMMSS-XXXX
Example: PTK-20260318-092803-A7F2
```

### Steps and thresholds

| Step | Subsystem | Interface | PASS | WARN | FAIL |
|------|-----------|-----------|------|------|------|
| 1 | Camera Module | CSI / V4L2 | < 40ms | 40–60ms | > 60ms |
| 2 | Environmental Sensors | I2C GPIO 2/3 | < 15ms | 15–20ms | > 20ms |
| 3 | SD Storage | mmcblk0 | < 30ms | 30–40ms | > 40ms |
| 4 | Network Connectivity | wlan0 / ICMP | < 150ms | 150–200ms | > 200ms |

### Persistence

Each run is saved to `data/factory_runs/<runId>.json` and can be downloaded via the export endpoint.

### Running from the API

```bash
# Start a factory validation run
curl -s -X POST http://localhost:3000/api/factory/run | python3 -m json.tool

# List past runs
curl -s http://localhost:3000/api/factory/runs

# Export a run report
curl -O http://localhost:3000/api/factory/runs/PTK-20260318-092803-A7F2/export
```

---

## Connectivity / Networking Patch

This patch extends the framework with a dedicated Wi-Fi and network monitoring layer.

### What was added

| Area | Change |
|------|--------|
| `networkService.js` | New service managing interface state, SSID, IP, disconnect/reconnect timestamps, timeout count, packet loss |
| Telemetry | Added `wifiConnected`, `ssid`, `ipAddress`, `interfaceName`, `networkTimeoutCount`, `packetLossEstimate` to every snapshot |
| Events | New typed events: `NETWORK_DISCONNECTED`, `NETWORK_RECOVERED`, `NETWORK_TIMEOUT`, `NETWORK_HIGH_LATENCY` |
| Reports | Added `connectivitySection` to each report: connected/disconnected, SSID, IP, latency, packet loss, timeout count, last disconnect/reconnect, recent transitions |
| API | New endpoint: `GET /api/connectivity/status` — returns live connectivity snapshot |
| Frontend | Connectivity Status panel with interface info, SSID, IP, packet loss, timeout count, transition history; Network RTT chart added to Telemetry Trends |

### Connectivity event types

| Event | When fired |
|-------|-----------|
| `NETWORK_DISCONNECTED` | `network_disconnect` fault is injected |
| `NETWORK_RECOVERED` | `network_disconnect` fault is cleared |
| `NETWORK_TIMEOUT` | Stochastic (~4% per 10s tick) — simulates transient ICMP loss |
| `NETWORK_HIGH_LATENCY` | RTT exceeds 150ms for 3+ consecutive ticks |

### What is simulated

Everything is synthetic. The simulated profile is:
- Interface: `wlan0`
- SSID: `PlantNet-5GHz`
- IP: `192.168.1.47`
- RTT: drifts between 8–200ms with jitter

### How to extend for real hardware

Replace the internals of `networkService.tick()` with:

```bash
# Connection status
nmcli -t -f GENERAL.STATE device show wlan0

# IP address
ip addr show wlan0 | grep 'inet '

# SSID
iw dev wlan0 link | grep SSID

# Reachability / RTT
ping -c 1 -W 1 8.8.8.8
```

---

## Simulation vs Real Hardware

The system runs in **simulation mode** by default. All telemetry values and subsystem statuses are generated synthetically with realistic drift and jitter.

To extend for real hardware, replace the functions in `backend/services/simulationService.js` with actual system calls:

| Subsystem | Real Implementation |
|-----------|---------------------|
| Camera | `v4l2-ctl --stream-mmap --stream-count=1` — measure frame capture time |
| Sensors | `i2cget -y 1 0x76 0xD0` — measure I2C round-trip |
| Storage | Write a 4KB temp file to `/tmp` and measure elapsed time |
| Network | `ping -c 1 -W 1 8.8.8.8` — parse RTT from stdout |

CPU, memory, and temperature are already accessible on Linux via `/proc/stat`, `/proc/meminfo`, and `/sys/class/thermal/thermal_zone0/temp`.

---

## Resume Context

- Built a Linux-based embedded diagnostics framework targeting Raspberry Pi 4, implementing automated subsystem validation for camera (CSI/V4L2), I2C sensors, SD storage, and network interfaces with fault injection and rule-based root cause analysis.
- Designed a full-stack telemetry pipeline: Node.js/Express REST API collecting system metrics at 10-second intervals, persisted to JSON, and surfaced in a Chart.js dashboard with real-time polling.
- Implemented a structured simulation mode enabling complete front-end and API testing without physical hardware, with clean separation between simulation and hardware layers for easy production substitution.
