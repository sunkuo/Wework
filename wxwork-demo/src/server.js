import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config, requireCallbackUrl } from "./config.js";
import { checkConnection, checkTables } from "./db.js";
import { getEvents, getEventsCount, getLatestActive, pushEvent, startEventCleanup, store, updateActive } from "./store.js";
import {
  automaticLogin,
  checkCode,
  getExternalContacts,
  getInnerContacts,
  getQrCode,
  getRunClient,
  getRunClientByUuid,
  initClient,
  sendTextMsg,
  setCallbackUrl,
  upstreamPing
} from "./wxworkClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString(),
    baseUrl: config.baseUrl,
    callbackUrl: config.callbackUrl || "(未配置)"
  });
});

function serializeError(error) {
  return {
    message: String(error?.message || error),
    name: error?.name || "",
    code: error?.code || error?.cause?.code || "",
    causeMessage: error?.cause?.message || ""
  };
}

/** pushEvent 的降级版本——catch 中使用，DB 抖动时不会再抛错 */
async function safePushEvent(event) {
  try {
    await pushEvent(event);
  } catch (e) {
    console.error("[safePushEvent] fallback:", e.message);
  }
}

/** updateActive 的降级版本——catch 中使用 */
async function safeUpdateActive(patch) {
  try {
    await updateActive(patch);
  } catch (e) {
    console.error("[safeUpdateActive] fallback:", e.message);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function hasDisconnectSignal(text = "") {
  return /手机端结束登录|其他设备登录|异常断开|断开|disconnect|offline/i.test(text);
}

function extractQrcodeKey(payload) {
  const maybeJsonStrings = [
    payload?.data,
    payload?.req,
    payload?.response,
    payload?.raw
  ];
  for (const raw of maybeJsonStrings) {
    if (typeof raw === "string" && raw.trim().startsWith("{")) {
      try {
        const obj = JSON.parse(raw);
        const nestedKey = extractQrcodeKey(obj);
        if (nestedKey) return nestedKey;
      } catch {
        // ignore invalid json string
      }
    }
  }

  const direct =
    payload?.Key ||
    payload?.key ||
    payload?.qrcodeKey ||
    payload?.qrcode_key ||
    payload?.qrcodekey ||
    payload?.data?.Key ||
    payload?.data?.key ||
    payload?.data?.qrcodeKey ||
    payload?.data?.qrcode_key ||
    payload?.data?.qrcodekey ||
    payload?.req?.Key ||
    payload?.req?.key ||
    payload?.req?.qrcodeKey ||
    payload?.req?.qrcode_key ||
    payload?.response?.Key ||
    payload?.response?.key ||
    payload?.response?.data?.Key ||
    payload?.response?.data?.key ||
    payload?.response?.qrcodeKey ||
    payload?.response?.qrcode_key ||
    "";
  if (direct) return String(direct);

  // 某些实现只返回二维码 URL，此时用文件名作为兜底 key
  const qrUrl =
    payload?.data?.qrcode ||
    payload?.data?.qrCode ||
    payload?.qrcode ||
    payload?.qrCode ||
    "";
  if (qrUrl) {
    const match = String(qrUrl).match(/\/([^/?.]+)\.(?:png|jpg|jpeg)(?:\?|$)/i);
    if (match?.[1]) return match[1];
  }

  return (
    ""
  );
}

function normalizeBool(val) {
  if (val === true || val === false) return val;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (["true", "1", "yes", "ok"].includes(s)) return true;
    if (["false", "0", "no"].includes(s)) return false;
  }
  if (typeof val === "number") return val !== 0;
  return null;
}

function extractLoginState(payload) {
  const candidates = [
    payload?.isLogin,
    payload?.is_login,
    payload?.data?.isLogin,
    payload?.data?.is_login,
    payload?.data?.user?.isLogin,
    payload?.data?.user?.is_login
  ];
  for (const c of candidates) {
    const b = normalizeBool(c);
    if (b !== null) return b;
  }
  return null;
}

async function tryReconnect(reason) {
  if (store.monitor.reconnecting) return;
  const active = await getLatestActive();
  if (!active.vid) return;
  store.monitor.reconnecting = true;
  store.monitor.lastReconnectAt = nowIso();
  let uuid = "";
  try {
    requireCallbackUrl();
    const initResp = await initClient({ vid: active.vid });
    const initData = initResp.data?.data || {};
    uuid = initData.uuid || initResp.data?.uuid || "";
    if (!uuid) {
      throw new Error(`重连 init 未返回 uuid: ${JSON.stringify(initResp.data)}`);
    }
    await updateActive({
      uuid,
      isLogin: false,
      qrcode: "",
      qrcodeKey: "",
      lastEvent: `reconnect:init:${reason}`,
      lastError: ""
    });

    const cbResp = await setCallbackUrl({
      uuid,
      callbackUrl: config.callbackUrl
    });
    await pushEvent({
      stage: "reconnect_set_callback",
      request: { uuid, reason },
      response: cbResp.data
    });

    const autoResp = await automaticLogin({ uuid });
    await pushEvent({
      stage: "reconnect_automatic_login",
      request: { uuid, reason },
      response: autoResp.data
    });

    const okText = JSON.stringify(autoResp.data || {});
    const autoOk =
      String(autoResp.data?.errcode ?? autoResp.data?.error_code ?? "0") === "0" &&
      !/失败|error|fail/i.test(okText);
    if (autoOk) {
      await updateActive({
        uuid,
        isLogin: true,
        lastEvent: `reconnect:auto_success:${reason}`,
        lastError: ""
      });
      return;
    }

    const qrResp = await getQrCode({ uuid });
    const qrData = qrResp.data?.data || {};
    const qrcode =
      qrData.qrcode ||
      qrData.qrCode ||
      qrData.qrcode_data ||
      qrData.url ||
      qrResp.data?.qrcode ||
      "";
    const qrcodeKey = extractQrcodeKey(qrResp.data);
    await updateActive({
      uuid,
      qrcode,
      qrcodeKey,
      isLogin: false,
      lastEvent: `reconnect:qrcode_ready:${reason}`,
      lastError: qrcode ? "" : "重连自动登录失败且未获取到二维码"
    });
    await pushEvent({
      stage: "reconnect_get_qrcode",
      request: { uuid, reason },
      response: qrResp.data
    });
  } catch (error) {
    const detail = serializeError(error);
    const fallbackUuid = uuid || active.uuid;
    if (fallbackUuid) {
      await safeUpdateActive({
        uuid: fallbackUuid,
        lastError: `重连失败: ${detail.message}`,
        lastEvent: `reconnect:error:${reason}`
      });
    }
    await safePushEvent({ stage: "reconnect_error", reason, error: detail });
  } finally {
    store.monitor.reconnecting = false;
  }
}

async function checkOnlineAndMaybeReconnect(reason = "poll") {
  const active = await getLatestActive();
  if (!active.uuid) return;
  store.monitor.running = true;
  store.monitor.lastCheckAt = nowIso();
  try {
    const resp = await getRunClientByUuid({ uuid: active.uuid });
    await pushEvent({
      stage: "monitor_check",
      request: { uuid: active.uuid, reason },
      response: resp.data
    });
    const text = JSON.stringify(resp.data || {});
    const errcode = resp.data?.errcode ?? resp.data?.error_code;
    const loginState = extractLoginState(resp.data);
    const maybeOffline =
      loginState === false ||
      String(errcode || "0") !== "0" ||
      /未登录|离线|不存在|not.*found|offline|disconnect/i.test(text);

    if (maybeOffline) {
      await updateActive({
        uuid: active.uuid,
        isLogin: false,
        lastEvent: `monitor:offline:${reason}`,
        lastError: `检测离线: errcode=${errcode ?? "unknown"}`
      });
      await tryReconnect(`monitor_${reason}`);
    } else {
      const online =
        loginState === true ||
        /"isLogin":true|"is_login":"?true"?/i.test(text);
      await updateActive({
        uuid: active.uuid,
        isLogin: online,
        lastEvent: `monitor:online:${reason}`,
        lastError: ""
      });
    }
  } catch (error) {
    const detail = serializeError(error);
    await safePushEvent({ stage: "monitor_check_error", reason, error: detail });
    await safeUpdateActive({ uuid: active.uuid, lastError: `状态检测失败: ${detail.message}` });
  } finally {
    store.monitor.running = false;
  }
}

function startMonitor() {
  if (store.monitor.timer) clearInterval(store.monitor.timer);
  store.monitor.enabled = true;
  store.monitor.timer = setInterval(() => {
    checkOnlineAndMaybeReconnect("interval");
  }, config.monitorIntervalMs);
}

function stopMonitor() {
  store.monitor.enabled = false;
  if (store.monitor.timer) clearInterval(store.monitor.timer);
  store.monitor.timer = null;
}

app.get("/api/upstream-check", async (_req, res) => {
  try {
    const ping = await upstreamPing();
    return res.json({
      ok: ping.ok,
      status: ping.status,
      baseUrl: config.baseUrl,
      raw: ping.data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      baseUrl: config.baseUrl,
      error: serializeError(error)
    });
  }
});

app.get("/api/state", async (_req, res) => {
  try {
    const active = await getLatestActive();
    const eventsCount = await getEventsCount();
    res.json({
      active,
      monitor: {
        enabled: store.monitor.enabled,
        running: store.monitor.running,
        lastCheckAt: store.monitor.lastCheckAt,
        lastReconnectAt: store.monitor.lastReconnectAt,
        reconnecting: store.monitor.reconnecting,
        intervalMs: config.monitorIntervalMs
      },
      eventsCount,
      baseUrl: config.baseUrl,
      callbackUrl: config.callbackUrl || ""
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: serializeError(error).message });
  }
});

app.get("/api/events", async (_req, res) => {
  try {
    const events = await getEvents();
    res.json({ events });
  } catch (error) {
    res.status(500).json({ ok: false, message: serializeError(error).message });
  }
});

function buildInitPayload(body = {}) {
  const proxySituationRaw = Number(body.proxySituation ?? 0);
  return {
    vid: String(body.vid || ""),
    ip: String(body.ip || ""),
    port: String(body.port || ""),
    proxyType: String(body.proxyType || ""),
    userName: String(body.userName || ""),
    passward: String(body.passward || ""),
    proxySituation: Number.isFinite(proxySituationRaw) ? proxySituationRaw : 0,
    deverType: String(body.deverType || "ipad")
  };
}

function parseQrResult(qrResp) {
  const qrData = qrResp.data?.data || {};
  const qrcode =
    qrData.qrcode ||
    qrData.qrCode ||
    qrData.qrcode_data ||
    qrData.url ||
    qrResp.data?.qrcode ||
    "";
  const qrcodeKey = extractQrcodeKey(qrResp.data);
  return { qrcode, qrcodeKey };
}

app.post("/api/init", async (req, res) => {
  try {
    const initPayload = buildInitPayload(req.body || {});

    const initResp = await initClient(initPayload);
    await pushEvent({ stage: "init", request: initPayload, response: initResp.data });
    const initData = initResp.data?.data || {};
    const uuid = initData.uuid || initResp.data?.uuid || "";
    const isLogin = String(initData.is_login || "").toLowerCase() === "true";

    if (!uuid) {
      // 没有 uuid 无法写 sessions 表，仅记录日志
      await pushEvent({ stage: "init_no_uuid", response: initResp.data });
      return res.status(400).json({
        ok: false,
        stage: "init",
        message: "init 未返回 uuid",
        raw: initResp.data
      });
    }

    await updateActive({
      uuid,
      vid: initPayload.vid,
      isLogin,
      qrcode: "",
      qrcodeKey: "",
      lastError: "",
      lastEvent: "init_success"
    });

    res.json({
      ok: true,
      uuid,
      isLogin,
      init: initResp.data
    });
  } catch (error) {
    const detail = serializeError(error);
    // init 阶段可能没有 uuid，仅记录事件日志
    await safePushEvent({ stage: "init_error", error: detail });
    res.status(500).json({
      ok: false,
      message: detail.message,
      detail
    });
  }
});

app.post("/api/set-callback", async (req, res) => {
  try {
    const active = await getLatestActive();
    const uuid = String(req.body?.uuid || active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化" });
    }

    const callbackUrl = String(req.body?.url || req.body?.callbackUrl || config.callbackUrl || "");
    if (!callbackUrl) {
      return res.status(400).json({ ok: false, message: "缺少回调地址 url（或配置 CALLBACK_URL）" });
    }
    const callbackResp = await setCallbackUrl({ uuid, callbackUrl });
    await pushEvent({
      stage: "set_callback",
      request: { uuid, callbackUrl },
      response: callbackResp.data
    });
    await updateActive({
      uuid,
      lastEvent: "set_callback_success",
      lastError: ""
    });
    res.json({
      ok: true,
      uuid,
      callbackUrl,
      callback: callbackResp.data
    });
  } catch (error) {
    const detail = serializeError(error);
    await safePushEvent({ stage: "set_callback_error", error: detail });
    res.status(500).json({
      ok: false,
      message: detail.message,
      detail
    });
  }
});

app.post("/api/get-qrcode", async (req, res) => {
  let uuid = "";
  try {
    const active = await getLatestActive();
    uuid = String(req.body?.uuid || active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化" });
    }
    const qrResp = await getQrCode({ uuid });
    await pushEvent({ stage: "get_qrcode", request: { uuid }, response: qrResp.data });
    const { qrcode, qrcodeKey } = parseQrResult(qrResp);

    await updateActive({
      uuid,
      qrcode,
      qrcodeKey,
      lastEvent: "qrcode_ready",
      lastError: qrcode ? "" : "未识别到二维码字段"
    });

    res.json({
      ok: true,
      uuid,
      qrcode,
      qrcodeKey,
      getQrCode: qrResp.data
    });
  } catch (error) {
    const detail = serializeError(error);
    if (uuid) {
      await safeUpdateActive({ uuid, lastError: detail.message });
    }
    await safePushEvent({ stage: "get_qrcode_error", error: detail });
    res.status(500).json({
      ok: false,
      message: detail.message,
      detail
    });
  }
});

app.post("/api/start-login", async (req, res) => {
  try {
    const initPayload = buildInitPayload(req.body || {});
    const initResp = await initClient(initPayload);
    await pushEvent({ stage: "init", request: initPayload, response: initResp.data });
    const initData = initResp.data?.data || {};
    const uuid = initData.uuid || initResp.data?.uuid || "";
    const isLogin = String(initData.is_login || "").toLowerCase() === "true";
    if (!uuid) {
      return res.status(400).json({
        ok: false,
        stage: "init",
        message: "init 未返回 uuid",
        raw: initResp.data
      });
    }
    await updateActive({ uuid, vid: initPayload.vid, isLogin, lastEvent: "init_success" });
    const callbackUrl = String(req.body?.url || req.body?.callbackUrl || config.callbackUrl || "");
    if (!callbackUrl) {
      return res.status(400).json({
        ok: false,
        stage: "set_callback",
        message: "缺少回调地址 url（或配置 CALLBACK_URL）"
      });
    }
    await setCallbackUrl({ uuid, callbackUrl });
    const qrResp = await getQrCode({ uuid });
    const { qrcode, qrcodeKey } = parseQrResult(qrResp);
    await updateActive({ uuid, qrcode, qrcodeKey, lastEvent: "qrcode_ready" });
    return res.json({ ok: true, uuid, isLogin, qrcode, qrcodeKey });
  } catch (error) {
    const detail = serializeError(error);
    await safePushEvent({ stage: "start_login_error", error: detail });
    return res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/automatic-login", async (req, res) => {
  try {
    const active = await getLatestActive();
    const uuid = String(req.body?.uuid || active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid" });
    }

    const resp = await automaticLogin({ uuid });
    await pushEvent({ stage: "automatic_login", request: { uuid }, response: resp.data });
    res.json({ ok: true, raw: resp.data });
  } catch (error) {
    const detail = serializeError(error);
    await safePushEvent({ stage: "automatic_login_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/check-code", async (req, res) => {
  try {
    const active = await getLatestActive();
    const uuid = String(req.body?.uuid || active.uuid || "");
    const code = String(req.body?.code || "").trim();
    const qrcodeKey = String(req.body?.qrcodeKey || active.qrcodeKey || "").trim();
    if (!uuid) return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化登录" });
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ ok: false, message: "验证码必须是6位数字" });
    }
    if (!qrcodeKey) {
      return res.status(400).json({ ok: false, message: "缺少 qrcodeKey，请先获取二维码或手动输入" });
    }
    const resp = await checkCode({ uuid, qrcodeKey, code });
    await pushEvent({
      stage: "check_code",
      request: { uuid, qrcodeKey, code: "******" },
      response: resp.data
    });
    const errcode = Number(resp.data?.errcode ?? resp.data?.error_code ?? -1);
    const errmsg = String(resp.data?.errmsg ?? resp.data?.error_msg ?? "");
    if (errcode !== 0) {
      await updateActive({
        uuid,
        isLogin: false,
        lastEvent: "check_code:failed",
        lastError: errmsg || `check_code errcode=${errcode}`
      });
      return res.status(400).json({
        ok: false,
        message: errmsg || `check_code errcode=${errcode}`,
        raw: resp.data
      });
    }

    const loginState = extractLoginState(resp.data);
    if (loginState === true) {
      await updateActive({ uuid, isLogin: true, lastEvent: "check_code:success", lastError: "" });
    } else {
      await updateActive({
        uuid,
        isLogin: false,
        lastEvent: "check_code:submitted_wait_callback",
        lastError: ""
      });
    }
    res.json({ ok: true, raw: resp.data });
  } catch (error) {
    const detail = serializeError(error);
    await safePushEvent({ stage: "check_code_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/refresh-run-client", async (req, res) => {
  try {
    const active = await getLatestActive();
    const uuid = String(req.body?.uuid || active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid" });
    }

    const [runResp, runByUuidResp] = await Promise.all([
      getRunClient({ uuid }),
      getRunClientByUuid({ uuid })
    ]);

    const loginState = extractLoginState(runByUuidResp.data);
    if (loginState !== null) {
      await updateActive({
        uuid,
        isLogin: loginState,
        lastEvent: "refresh_status",
        lastError: ""
      });
    }

    await pushEvent({
      stage: "refresh_status",
      request: { uuid },
      response: {
        getRunClient: runResp.data,
        getRunClientByUuid: runByUuidResp.data
      }
    });
    res.json({
      ok: true,
      request: { uuid },
      getRunClient: runResp.data,
      getRunClientByUuid: runByUuidResp.data
    });
  } catch (error) {
    const detail = serializeError(error);
    await safePushEvent({ stage: "get_run_client_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/monitor/start", async (_req, res) => {
  try {
    startMonitor();
    await checkOnlineAndMaybeReconnect("manual_start");
    res.json({
      ok: true,
      monitor: {
        enabled: store.monitor.enabled,
        intervalMs: config.monitorIntervalMs
      }
    });
  } catch (error) {
    const detail = serializeError(error);
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/monitor/stop", (_req, res) => {
  stopMonitor();
  res.json({ ok: true, monitor: { enabled: false } });
});

app.post("/api/send-text", async (req, res) => {
  try {
    const active = await getLatestActive();
    const uuid = String(req.body?.uuid || active.uuid || "");
    const content = String(req.body?.content || "");
    const sendUserid = String(req.body?.send_userid || req.body?.sendUserid || "");
    const kfIdRaw = req.body?.kf_id ?? req.body?.kfId ?? 0;
    const kfIdNum = Number(kfIdRaw);
    const normalizedIsRoom = normalizeBool(req.body?.isRoom);

    if (!uuid || !sendUserid || !content || normalizedIsRoom === null) {
      return res.status(400).json({
        ok: false,
        message: "uuid、send_userid、isRoom、content 为必填"
      });
    }

    const payload = {
      uuid,
      kf_id: Number.isFinite(kfIdNum) ? kfIdNum : 0,
      send_userid: sendUserid,
      isRoom: normalizedIsRoom,
      content
    };

    const resp = await sendTextMsg(payload);
    await pushEvent({
      stage: "send_text",
      request: payload,
      response: resp.data
    });
    res.json({ ok: true, request: payload, raw: resp.data });
  } catch (error) {
    const detail = serializeError(error);
    await safePushEvent({ stage: "send_text_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/contacts", async (req, res) => {
  try {
    const active = await getLatestActive();
    const uuid = String(req.body?.uuid || active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid，请先登录" });
    }

    const normalizeLimit = (val, fallback = 100) => {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) return fallback;
      return Math.floor(n);
    };
    const innerReq = req.body?.inner || {};
    const externalReq = req.body?.external || {};
    const innerLimit = normalizeLimit(innerReq.limit ?? req.body?.innerLimit, 100);
    const externalLimit = normalizeLimit(externalReq.limit ?? req.body?.externalLimit, 100);
    const innerStrSeq = String(innerReq.strSeq ?? req.body?.innerStrSeq ?? "");
    const externalStrSeq = String(externalReq.strSeq ?? req.body?.externalStrSeq ?? "");

    const innerPayload = {
      uuid,
      limit: innerLimit,
      strSeq: innerStrSeq
    };
    const externalPayload = {
      uuid,
      limit: externalLimit,
      strSeq: externalStrSeq
    };

    const [innerResp, externalResp] = await Promise.all([
      getInnerContacts(innerPayload),
      getExternalContacts(externalPayload)
    ]);

    const innerList =
      innerResp.data?.data?.list ||
      innerResp.data?.data?.rows ||
      innerResp.data?.data ||
      [];
    const externalList =
      externalResp.data?.data?.list ||
      externalResp.data?.data?.rows ||
      externalResp.data?.data ||
      [];

    await pushEvent({
      stage: "get_contacts",
      request: { uuid, innerPayload, externalPayload },
      response: {
        innerStatus: innerResp.status,
        externalStatus: externalResp.status,
        innerErr: innerResp.data?.errcode,
        externalErr: externalResp.data?.errcode
      }
    });

    res.json({
      ok: true,
      uuid,
      request: {
        inner: innerPayload,
        external: externalPayload
      },
      summary: {
        innerCount: Array.isArray(innerList) ? innerList.length : -1,
        externalCount: Array.isArray(externalList) ? externalList.length : -1
      },
      inner: innerResp.data,
      external: externalResp.data
    });
  } catch (error) {
    const detail = serializeError(error);
    await safePushEvent({ stage: "get_contacts_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/callback/wxwork", async (req, res) => {
  try {
    const payload = req.body || {};
    const text = JSON.stringify(payload);
    const maybeUuid =
      payload.uuid ||
      payload.data?.uuid ||
      payload.client_uuid ||
      payload.clientUuid ||
      "";
    const eventType =
      payload.type ||
      payload.msg_type ||
      payload.event ||
      payload.cmd ||
      "callback";
    const qrcodeKey = extractQrcodeKey(payload);

    await pushEvent({
      stage: "callback",
      eventType,
      payload
    });

    const active = await getLatestActive();
    const isLoginSuccess =
      /登录成功|login.*success/i.test(text) ||
      /"is_login"\s*:\s*"?true"?/i.test(text);
    if (isLoginSuccess) {
      await updateActive({
        isLogin: true,
        uuid: maybeUuid || active.uuid,
        qrcodeKey: qrcodeKey || active.qrcodeKey,
        lastEvent: `callback:${eventType}`,
        lastError: ""
      });
    } else if (maybeUuid) {
      await updateActive({
        uuid: maybeUuid,
        qrcodeKey: qrcodeKey || active.qrcodeKey,
        lastEvent: `callback:${eventType}`
      });
    } else if (active.uuid) {
      await updateActive({
        uuid: active.uuid,
        qrcodeKey: qrcodeKey || active.qrcodeKey,
        lastEvent: `callback:${eventType}`
      });
    }

    const disconnectUuid = maybeUuid || active.uuid;
    if (hasDisconnectSignal(text) && disconnectUuid) {
      await updateActive({
        uuid: disconnectUuid,
        isLogin: false,
        lastEvent: `callback:disconnect:${eventType}`
      });
      void tryReconnect(`callback_${eventType}`);
    }

    res.json({ errcode: 0, errmsg: "ok" });
  } catch (error) {
    console.error("[callback] error:", error.message);
    res.json({ errcode: 0, errmsg: "ok" });
  }
});

app.listen(config.port, async () => {
  try {
    await checkConnection();
    await checkTables();
    console.log("[wxwork-demo] MySQL connected, tables verified");
  } catch (err) {
    console.error("[wxwork-demo] MySQL startup check failed:", err.message);
    process.exit(1);
  }
  startMonitor();
  startEventCleanup(60000); // 每 60 秒清理一次过期事件
  console.log(
    `[wxwork-demo] listening on http://localhost:${config.port} baseUrl=${config.baseUrl}`
  );
});
