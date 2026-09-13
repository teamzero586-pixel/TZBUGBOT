const fs = require("fs");
const config = require("../config");

function getDB() {
  return JSON.parse(fs.readFileSync("./storage/resellers.json"));
}

function isOwner(userId) {
  return userId.toString() === config.ownerId.toString();
}

function isReseller(userId) {
  const db = getDB();
  return db.users.includes(userId.toString());
}

// READ FREE MODE
function isFreeMode() {
  const settings = JSON.parse(fs.readFileSync("./database/settings.json"));
  return settings.freeMode === true;
}

// CEK AKSES
function hasAccess(userId) {
  const settings = JSON.parse(fs.readFileSync("./database/settings.json", "utf8"));
  
  
  if (settings.freeMode) return true;

 
  if (isOwner(userId)) return true;
  if (isReseller(userId)) return true;

  
  let accessDb = JSON.parse(fs.readFileSync("./storage/access.json", "utf8"));

  
  const users = Array.isArray(accessDb.users) ? accessDb.users : [];
  if (users.includes(userId.toString())) return true;

  return false;
}

function addReseller(targetId) {
  const db = getDB();
  if (!db.users.includes(targetId)) {
    db.users.push(targetId);
    fs.writeFileSync("./storage/resellers.json", JSON.stringify(db, null, 2));
  }
}

function removeReseller(targetId) {
  const db = getDB();
  db.users = db.users.filter(id => id !== targetId);
  fs.writeFileSync("./storage/resellers.json", JSON.stringify(db, null, 2));
}

module.exports = {
  isOwner,
  isReseller,
  isFreeMode,
  hasAccess,
  addReseller,
  removeReseller
};