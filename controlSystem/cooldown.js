const fs = require("fs");
const cdFile = "./storage/cooldown.json";

if (!fs.existsSync(cdFile)) {
  fs.writeFileSync(cdFile, JSON.stringify({}, null, 2));
}

function setCooldown(commandName, minutes) {
  const db = JSON.parse(fs.readFileSync(cdFile));

  db[commandName] = {
    duration: minutes,
    lastUsed: 0
  };

  fs.writeFileSync(cdFile, JSON.stringify(db, null, 2));

  return {
    success: true,
    message: `⏳ Cooldown set: /${commandName} → ${minutes} minutes`
  };
}

function checkCooldown(commandName) {
  const db = JSON.parse(fs.readFileSync(cdFile));

  if (!db[commandName]) return { expired: true };

  const now = Date.now();
  const lastUsed = db[commandName].lastUsed;
  const durationMs = db[commandName].duration * 60 * 1000;

  if (now - lastUsed >= durationMs) {
    return { expired: true };
  }

  const remaining = Math.ceil((durationMs - (now - lastUsed)) / 60000);

  return {
    expired: false,
    remaining
  };
}

function updateLastUsed(commandName) {
  const db = JSON.parse(fs.readFileSync(cdFile));

  if (!db[commandName]) return;

  db[commandName].lastUsed = Date.now();

  fs.writeFileSync(cdFile, JSON.stringify(db, null, 2));
}

module.exports = {
  setCooldown,
  checkCooldown,
  updateLastUsed
};