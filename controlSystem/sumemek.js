const fs = require("fs");
const path = require("path");

const COOLDOWN_FILE = "./storage/cooldown1.json";
const COOLDOWN_DURATION = 20 * 60 * 1000;
const COOLDOWN_COMMANDS = ["  ........  "];

function initCooldownFile() {
  try {
    if (!fs.existsSync(COOLDOWN_FILE)) {
      fs.writeFileSync(COOLDOWN_FILE, JSON.stringify({
        enabled: false,
        users: {}
      }, null, 2));
    }
  } catch (error) {
    console.error("Error initializing cooldown file:", error);
  }
}

/**
 * Baca data cooldown dari file
 */
 
function readCooldownData() {
  try {
    if (!fs.existsSync(COOLDOWN_FILE)) {
      initCooldownFile();
    }
    return JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));
  } catch (error) {
    console.error("Error reading cooldown data:", error);
    return { enabled: false, users: {} };
  }
}

/**
 * Simpan data cooldown ke file
 */
 
function writeCooldownData(data) {
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error writing cooldown data:", error);
  }
}

/**
 * Check apakah cooldown aktif atau tidak
 */
 
function isCooldownEnabled() {
  const data = readCooldownData();
  return data.enabled === true;
}

/**
 * Enable cooldown system
 */
 
function enableCooldown() {
  const data = readCooldownData();
  data.enabled = true;
  writeCooldownData(data);
  return true;
}

/**
 * Disable cooldown system
 */
 
function disableCooldown() {
  const data = readCooldownData();
  data.enabled = false;
  writeCooldownData(data);
  return true;
}

/**
 * Check cooldown user untuk command tertentu
 * @param {string} userId - Telegram User ID
 * @param {string} command - Nama command (crash, delay, xios, freze)
 * @returns {Object} - {onCooldown: boolean, remaining: number(menit), totalWait: number(menit)}
 */
 
function checkCooldown(userId, command) {
  if (!isCooldownEnabled()) {
    return {
      onCooldown: false,
      remaining: 0,
      totalWait: 20
    };
  }

  const data = readCooldownData();
  const userCooldowns = data.users[userId];

  if (!userCooldowns || !userCooldowns[command]) {
    return {
      onCooldown: false,
      remaining: 0,
      totalWait: 20
    };
  }

  const lastUsedTime = userCooldowns[command];
  const now = Date.now();
  const elapsed = now - lastUsedTime; // milliseconds
  const elapsedMinutes = Math.floor(elapsed / (60 * 1000));
  const remaining = Math.max(0, 20 - elapsedMinutes);

  return {
    onCooldown: remaining > 0,
    remaining: remaining,
    totalWait: 20
  };
}

/**
 * Update last used time untuk user command
 * @param {string} userId - Telegram User ID
 * @param {string} command - Nama command
 */
 
function updateCooldown(userId, command) {
  const data = readCooldownData();
  if (!data.users[userId]) {
    data.users[userId] = {};
  }
  data.users[userId][command] = Date.now();
  writeCooldownData(data);
}

/**
 * Reset cooldown user untuk command tertentu
 */
 
function resetUserCommandCooldown(userId, command) {
  const data = readCooldownData();

  if (data.users[userId]) {
    delete data.users[userId][command];
  }

  writeCooldownData(data);
}

/**
 * Reset semua cooldown user
 */
 
function resetUserAllCooldowns(userId) {
  const data = readCooldownData();

  if (data.users[userId]) {
    delete data.users[userId];
  }

  writeCooldownData(data);
}

/**
 * Reset semua cooldown semua user
 */
 
function resetAllCooldowns() {
  const data = {
    enabled: isCooldownEnabled(),
    users: {}
  };
  writeCooldownData(data);
}

/**
 * Get info cooldown user
 */
 
function getUserCooldownStatus(userId) {
  const data = readCooldownData();
  const userCooldowns = data.users[userId] || {};

  const status = {};

  for (const cmd of COOLDOWN_COMMANDS) {
    const cooldownInfo = checkCooldown(userId, cmd);
    status[cmd] = {
      onCooldown: cooldownInfo.onCooldown,
      remaining: cooldownInfo.remaining,
      lastUsed: userCooldowns[cmd] ? new Date(userCooldowns[cmd]).toLocaleString('id-ID') : "Tidak pernah"
    };
  }

  return status;
}

module.exports = {
  initCooldownFile,
  checkCooldown,
  updateCooldown,
  resetUserCommandCooldown,
  resetUserAllCooldowns,
  resetAllCooldowns,
  isCooldownEnabled,
  enableCooldown,
  disableCooldown,
  getUserCooldownStatus,
  COOLDOWN_COMMANDS
};