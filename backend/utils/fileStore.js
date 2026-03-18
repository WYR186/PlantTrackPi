/*
  PlantTrack Pi — JSON file store utilities
*/

'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Reads and parses a JSON file. Returns defaultValue if file doesn't exist or is invalid.
 * @param {string} filePath
 * @param {*} defaultValue
 * @returns {*}
 */
function readJSON(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || raw.trim() === '') return defaultValue;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[fileStore] readJSON failed for ${filePath}:`, err.message);
    return defaultValue;
  }
}

/**
 * Serializes data to JSON and writes it to filePath.
 * Creates parent directories if they don't exist.
 * @param {string} filePath
 * @param {*} data
 */
function writeJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[fileStore] writeJSON failed for ${filePath}:`, err.message);
  }
}

/**
 * Reads an array from filePath, appends item, trims to maxLength, and writes back.
 * @param {string} filePath
 * @param {*} item
 * @param {number} maxLength
 */
function appendToArray(filePath, item, maxLength = 100) {
  const arr = readJSON(filePath, []);
  const safe = Array.isArray(arr) ? arr : [];
  safe.push(item);
  const trimmed = safe.length > maxLength ? safe.slice(safe.length - maxLength) : safe;
  writeJSON(filePath, trimmed);
}

module.exports = { readJSON, writeJSON, appendToArray };
