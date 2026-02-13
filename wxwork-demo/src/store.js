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

  // 构建更新对象
  // 注意：Prisma upsert 需要 create 和 update 数据
  // patch 可能只包含部分字段，我们需要合并现有值？
  // Prisma update 只更新提供的字段，这很方便。
  // 但是 upsert 的 create 需要必填字段。
  // 这里逻辑稍微复杂一点：如果不存在，用 patch + 默认值创建。
  // 如果存在，用 patch 更新。

  // 为了获取完整的 current 状态，我们可能需要先查一下？
  // 或者直接用 upsert，但 create 部分需要填满默认值。
  
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

  // 如果 sessionUuid 不存在，Prisma 可能会报错（外键约束）。
  // 这里需要确保 session 存在？或者允许 session_uuid 为空？
  // schema 中 session_uuid 是必须的且关联 session。
  // 如果没有 session，我们可能无法插入 event。
  // 原始代码没有外键约束，所以能插入。
  // Prisma schema 里有 relation。
  // 如果 session 不存在，我们需要创建它吗？或者忽略错误？
  // 这里的 sessionUuid 可能为空字符串。
  // 为了兼容，如果 sessionUuid 为空，或者找不到，我们可能需要先创建一个 dummy session？
  // 或者修改 schema 允许 session_uuid 为空？
  // 考虑到代码健壮性，如果 sessionUuid 为空，我们尝试用 "unknown" 或者空字符串创建 session。
  
  if (sessionUuid) {
    // 尝试确保 session 存在 (ignore failures if race condition)
    try {
      await prisma.session.upsert({
        where: { uuid: sessionUuid },
        update: {},
        create: { uuid: sessionUuid, vid: "auto-created" }
      });
    } catch (e) {
      // ignore
    }
  } else {
    // 如果没有 uuid，我们无法插入 event (违反外键约束)
    // 除非我们放宽 schema。但现在 schema 已经定了。
    // 我们可以跳过插入，或者记录到日志。
    console.warn("[store] pushEvent 缺少 sessionUuid，跳过入库", stage);
    return;
  }

  await prisma.event.create({
    data: {
      session_uuid: sessionUuid,
      stage,
      event_type: eventType,
      payload: sanitized // Prisma Handles JSON automatically
    }
  });
}

// ---------- 定时清理 events ----------

let cleanupTimer = null;

async function cleanupOldEvents() {
  try {
    const count = await prisma.event.count();
    if (count > config.maxEvents) {
      // 删除最早的 N 条
      // Prisma 不支持直接 DELETE ... LIMIT (MySQL specific)
      // 我们需要找出要删除的 ID 范围
      const deleteCount = count - config.maxEvents;
      
      // 找出第 deleteCount 条记录的 id
      // 或者找出最早的 deleteCount 条记录
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
    // Prisma 自动解析 JSON payload，所以 row.payload 是对象
    // 但原始代码期望它是展平的
    const payload = row.payload || {};
    return {
      time: row.created_at ? row.created_at.toISOString() : "",
      stage: row.stage || "",
      ...payload
    };
  });
}
