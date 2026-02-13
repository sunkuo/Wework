import { config } from "./config.js";

export const store = {
  active: {
    uuid: "",
    vid: "",
    isLogin: false,
    qrcode: "",
    qrcodeKey: "",
    lastEvent: "",
    lastError: "",
    updatedAt: ""
  },
  events: [],
  monitor: {
    enabled: false,
    running: false,
    lastCheckAt: "",
    lastReconnectAt: "",
    reconnecting: false,
    timer: null
  }
};

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

export function updateActive(patch) {
  store.active = {
    ...store.active,
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

export function pushEvent(event) {
  const sanitized = sanitizeForLog(event);
  store.events.unshift({
    time: new Date().toISOString(),
    ...sanitized
  });
  if (store.events.length > config.maxEvents) {
    store.events.length = config.maxEvents;
  }
}
