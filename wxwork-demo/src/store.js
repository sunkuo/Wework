import { config } from "./config.js";
import { query, queryOne } from "./db.js";

// monitor 保持内存，不入库
export const store = {
  monitor: {
    enabled: false,
    running: false,
    lastCheckAt: "",
    lastReconnectAt: "",
    reconnecting: false,
    timer: null
  }
};

// ---------- sessions (MySQL) ----------

const EMPTY_ACTIVE = {
  uuid: "",
  vid: "",
  isLogin: false,
  qrcode: "",
  qrcodeKey: "",
  lastEvent: "",
  lastError: "",
  updatedAt: ""
};

function rowToActive(row) {
  if (!row) return { ...EMPTY_ACTIVE };
  return {
    uuid: row.uuid || "",
    vid: row.vid || "",
    isLogin: Boolean(row.is_login),
    qrcode: row.qrcode || "",
    qrcodeKey: row.qrcode_key || "",
    lastEvent: row.last_event || "",
    lastError: row.last_error || "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ""
  };
}

export async function getActive(uuid) {
  if (!uuid) return { ...EMPTY_ACTIVE };
  const row = await queryOne("SELECT * FROM sessions WHERE uuid = ?", [uuid]);
  return rowToActive(row);
}

export async function getLatestActive() {
  const row = await queryOne(
    "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 1"
  );
  return rowToActive(row);
}

export async function updateActive(patch) {
  const uuid = patch.uuid;
  if (!uuid) {
    // uuid 是必须的，不再隐式 fallback 到最新一条，防止多账号串号
    console.warn("[store] updateActive 缺少 uuid，跳过写库", patch.lastEvent || patch.lastError || "");
    return { ...EMPTY_ACTIVE, ...patch, updatedAt: new Date().toISOString() };
  }

  const now = new Date().toISOString();
  const existing = await getActive(uuid);

  const merged = {
    uuid,
    vid: patch.vid ?? existing.vid ?? "",
    isLogin: patch.isLogin ?? existing.isLogin ?? false,
    qrcode: patch.qrcode ?? existing.qrcode ?? "",
    qrcodeKey: patch.qrcodeKey ?? existing.qrcodeKey ?? "",
    lastEvent: patch.lastEvent ?? existing.lastEvent ?? "",
    lastError: patch.lastError ?? existing.lastError ?? "",
    updatedAt: now
  };

  await query(
    `INSERT INTO sessions (uuid, vid, is_login, qrcode, qrcode_key, last_event, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       vid = VALUES(vid),
       is_login = VALUES(is_login),
       qrcode = VALUES(qrcode),
       qrcode_key = VALUES(qrcode_key),
       last_event = VALUES(last_event),
       last_error = VALUES(last_error),
       updated_at = NOW()`,
    [
      merged.uuid,
      merged.vid,
      merged.isLogin ? 1 : 0,
      merged.qrcode,
      merged.qrcodeKey,
      merged.lastEvent,
      merged.lastError
    ]
  );

  return merged;
}

// ---------- events (MySQL) ----------

function truncateString(text, max = 240) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...<truncated ${s.length - max} chars>`;
}

function sanitizeForLog(value, key = "", depth = 0) {
  if (depth > 6) return "[max_depth]";
  if (value == null) return value;

  if (typeof value === "string") {
    if (key === "qrcode_data") return truncateString(value, 80);
    if (key === "raw" || key === "payload") return truncateString(value, 320);
    return truncateString(value, 240);
  }

  if (Array.isArray(value)) {
    const maxItems = 30;
    const out = value.slice(0, maxItems).map((item) => sanitizeForLog(item, "", depth + 1));
    if (value.length > maxItems) out.push(`[truncated_items:${value.length - maxItems}]`);
    return out;
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeForLog(v, k, depth + 1);
    }
    return out;
  }

  return value;
}

export async function pushEvent(event) {
  const sanitized = sanitizeForLog(event);
  const sessionUuid = sanitized.request?.uuid || sanitized.payload?.uuid || "";
  const stage = sanitized.stage || "";
  const eventType = sanitized.eventType || "";

  await query(
    `INSERT INTO events (session_uuid, stage, event_type, payload, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [sessionUuid, stage, eventType, JSON.stringify(sanitized)]
  );
}

// ---------- 定时清理 events ----------

let cleanupTimer = null;

async function cleanupOldEvents() {
  try {
    const countRows = await query("SELECT COUNT(*) AS cnt FROM events");
    const cnt = countRows[0]?.cnt || 0;
    if (cnt > config.maxEvents) {
      await query(
        "DELETE FROM events ORDER BY created_at ASC LIMIT ?",
        [cnt - config.maxEvents]
      );
    }
  } catch (err) {
    console.error("[store] events cleanup error:", err.message);
  }
}

export function startEventCleanup(intervalMs = 60000) {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = setInterval(cleanupOldEvents, intervalMs);
}

export function stopEventCleanup() {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = null;
}

export async function getEventsCount() {
  const rows = await query("SELECT COUNT(*) AS cnt FROM events");
  return rows[0]?.cnt || 0;
}

export async function getEvents(limit) {
  const rows = await query(
    "SELECT * FROM events ORDER BY created_at DESC LIMIT ?",
    [limit || config.maxEvents]
  );
  return rows.map((row) => {
    let payload = {};
    try {
      payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload || {};
    } catch { /* ignore */ }
    return {
      time: row.created_at ? new Date(row.created_at).toISOString() : "",
      stage: row.stage || "",
      ...payload
    };
  });
}
