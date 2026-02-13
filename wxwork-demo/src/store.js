import { config } from "./config.js";
import { prisma } from "./db.js";

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

// ---------- sessions (Prisma) ----------

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
    updatedAt: row.updated_at ? row.updated_at.toISOString() : ""
  };
}

export async function getActive(uuid) {
  if (!uuid) return { ...EMPTY_ACTIVE };
  const row = await prisma.session.findUnique({
    where: { uuid }
  });
  return rowToActive(row);
}

export async function getLatestActive() {
  const row = await prisma.session.findFirst({
    orderBy: { updated_at: 'desc' }
  });
  return rowToActive(row);
}

export async function updateActive(patch) {
  const uuid = patch.uuid;
  if (!uuid) {
    console.warn("[store] updateActive 缺少 uuid，跳过写库", patch.lastEvent || patch.lastError || "");
    return { ...EMPTY_ACTIVE, ...patch, updatedAt: new Date().toISOString() };
  }

  const dataToUpdate = {};
  if (patch.vid !== undefined) dataToUpdate.vid = patch.vid;
  if (patch.isLogin !== undefined) dataToUpdate.is_login = patch.isLogin ? 1 : 0;
  if (patch.qrcode !== undefined) dataToUpdate.qrcode = patch.qrcode;
  if (patch.qrcodeKey !== undefined) dataToUpdate.qrcode_key = patch.qrcodeKey;
  if (patch.lastEvent !== undefined) dataToUpdate.last_event = patch.lastEvent;
  if (patch.lastError !== undefined) dataToUpdate.last_error = patch.lastError;

  const dataToCreate = {
    uuid,
    vid: patch.vid ?? "",
    is_login: patch.isLogin ? 1 : 0,
    qrcode: patch.qrcode ?? null,
    qrcode_key: patch.qrcodeKey ?? "",
    last_event: patch.lastEvent ?? "",
    last_error: patch.lastError ?? null,
  };

  const row = await prisma.session.upsert({
    where: { uuid },
    update: dataToUpdate,
    create: dataToCreate,
  });

  return rowToActive(row);
}

// ---------- events (Prisma) ----------

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
    // 扩大日志截断长度，防止关键信息丢失，但仍需防止溢出
    if (key === "raw" || key === "payload") return truncateString(value, 1000); 
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

  // 修复：如果不包含 sessionUuid，不再强行创建 Session，而是作为无主事件记录
  // 必须把空字符串转为 null/undefined，否则 Prisma 会尝试去 sessions 表找空主键
  const finalSessionUuid = sessionUuid || undefined; 

  // 注意：如果 sessionUuid 提供了，但在 sessions 表里找不到（外键约束失败），
  // Prisma 还是会报错。这里我们有两个选择：
  // 1. 让它报错（数据一致性优先）
  // 2. 捕获错误并重试为无主事件
  // 考虑到日志的不可丢失性，我们选择方案 2
  
  try {
    await prisma.event.create({
      data: {
        session_uuid: finalSessionUuid,
        stage,
        event_type: eventType,
        payload: sanitized
      }
    });
  } catch (err) {
    // P2003: Foreign key constraint failed
    if (err.code === 'P2003' && finalSessionUuid) {
      console.warn(`[store] session ${finalSessionUuid} not found, saving as orphan event`);
      await prisma.event.create({
        data: {
          session_uuid: undefined, // 存为无主事件
          stage: `${stage} (orphan)`,
          event_type: eventType,
          payload: { ...sanitized, original_uuid: finalSessionUuid }
        }
      });
    } else {
      console.error("[store] pushEvent error:", err.message);
    }
  }
}

// ---------- 定时清理 events ----------

let cleanupTimer = null;

async function cleanupOldEvents() {
  try {
    const count = await prisma.event.count();
    if (count > config.maxEvents) {
      // 删除最早的 N 条
      const deleteCount = count - config.maxEvents;
      
      const eventsToDelete = await prisma.event.findMany({
        select: { id: true },
        orderBy: { created_at: 'asc' },
        take: deleteCount
      });
      
      if (eventsToDelete.length > 0) {
        const ids = eventsToDelete.map(e => e.id);
        await prisma.event.deleteMany({
          where: { id: { in: ids } }
        });
      }
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
  return await prisma.event.count();
}

export async function getEvents(limit) {
  const events = await prisma.event.findMany({
    orderBy: { created_at: 'desc' },
    take: limit || config.maxEvents
  });
  
  return events.map((row) => {
    const payload = row.payload || {};
    return {
      time: row.created_at ? row.created_at.toISOString() : "",
      stage: row.stage || "",
      ...payload
    };
  });
}
