/*
  PlantTrack Pi — Embedded Validation & Diagnostics Framework
  Express server: mounts API routes, serves static frontend.
*/

'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const systemRoutes    = require('./routes/systemRoutes');
const testRoutes      = require('./routes/testRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const eventRoutes     = require('./routes/eventRoutes');
const faultRoutes     = require('./routes/faultRoutes');
const reportRoutes    = require('./routes/reportRoutes');
const contactRoutes   = require('./routes/contactRoutes');
const factoryRoutes   = require('./routes/factoryRoutes');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('[server] Created data directory:', dataDir);
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve static frontend files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ── API Routes ──────────────────────────────────────────────
app.use('/api', systemRoutes);
app.use('/api', testRoutes);
app.use('/api', telemetryRoutes);
app.use('/api', eventRoutes);
app.use('/api', faultRoutes);
app.use('/api', reportRoutes);
app.use('/api', contactRoutes);
app.use('/api', factoryRoutes);

// ── Fallback: serve index.html for any non-API route ───────
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ── Start server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] PlantTrack Pi backend running on http://localhost:${PORT}`);
  console.log(`[server] Frontend served from: ${frontendPath}`);
  console.log(`[server] Simulation mode: ACTIVE`);
});

module.exports = app;
