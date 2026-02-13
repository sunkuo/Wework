import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config, requireCallbackUrl } from "./config.js";
import { pushEvent, store, updateActive } from "./store.js";
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
  if (!store.active.vid) return;
  store.monitor.reconnecting = true;
  store.monitor.lastReconnectAt = nowIso();
  try {
    requireCallbackUrl();
    const initResp = await initClient({ vid: store.active.vid });
    const initData = initResp.data?.data || {};
    const uuid = initData.uuid || initResp.data?.uuid || "";
    if (!uuid) {
      throw new Error(`重连 init 未返回 uuid: ${JSON.stringify(initResp.data)}`);
    }
    updateActive({
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
    pushEvent({
      stage: "reconnect_set_callback",
      request: { uuid, reason },
      response: cbResp.data
    });

    const autoResp = await automaticLogin({ uuid });
    pushEvent({
      stage: "reconnect_automatic_login",
      request: { uuid, reason },
      response: autoResp.data
    });

    const okText = JSON.stringify(autoResp.data || {});
    const autoOk =
      String(autoResp.data?.errcode ?? autoResp.data?.error_code ?? "0") === "0" &&
      !/失败|error|fail/i.test(okText);
    if (autoOk) {
      updateActive({
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
    updateActive({
      qrcode,
      qrcodeKey,
      isLogin: false,
      lastEvent: `reconnect:qrcode_ready:${reason}`,
      lastError: qrcode ? "" : "重连自动登录失败且未获取到二维码"
    });
    pushEvent({
      stage: "reconnect_get_qrcode",
      request: { uuid, reason },
      response: qrResp.data
    });
  } catch (error) {
    const detail = serializeError(error);
    updateActive({
      lastError: `重连失败: ${detail.message}`,
      lastEvent: `reconnect:error:${reason}`
    });
    pushEvent({ stage: "reconnect_error", reason, error: detail });
  } finally {
    store.monitor.reconnecting = false;
  }
}

async function checkOnlineAndMaybeReconnect(reason = "poll") {
  if (!store.active.uuid) return;
  store.monitor.running = true;
  store.monitor.lastCheckAt = nowIso();
  try {
    const resp = await getRunClientByUuid({ uuid: store.active.uuid });
    pushEvent({
      stage: "monitor_check",
      request: { uuid: store.active.uuid, reason },
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
      updateActive({
        isLogin: false,
        lastEvent: `monitor:offline:${reason}`,
        lastError: `检测离线: errcode=${errcode ?? "unknown"}`
      });
      await tryReconnect(`monitor_${reason}`);
    } else {
      const online =
        loginState === true ||
        /"isLogin":true|"is_login":"?true"?/i.test(text);
      updateActive({
        isLogin: online,
        lastEvent: `monitor:online:${reason}`,
        lastError: ""
      });
    }
  } catch (error) {
    const detail = serializeError(error);
    pushEvent({ stage: "monitor_check_error", reason, error: detail });
    updateActive({ lastError: `状态检测失败: ${detail.message}` });
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

app.get("/api/state", (_req, res) => {
  res.json({
    active: store.active,
    monitor: {
      enabled: store.monitor.enabled,
      running: store.monitor.running,
      lastCheckAt: store.monitor.lastCheckAt,
      lastReconnectAt: store.monitor.lastReconnectAt,
      reconnecting: store.monitor.reconnecting,
      intervalMs: config.monitorIntervalMs
    },
    eventsCount: store.events.length,
    baseUrl: config.baseUrl,
    callbackUrl: config.callbackUrl || ""
  });
});

app.get("/api/events", (_req, res) => {
  res.json({ events: store.events });
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
    pushEvent({ stage: "init", request: initPayload, response: initResp.data });
    const initData = initResp.data?.data || {};
    const uuid = initData.uuid || initResp.data?.uuid || "";
    const isLogin = String(initData.is_login || "").toLowerCase() === "true";

    if (!uuid) {
      updateActive({
        vid: initPayload.vid,
        lastError: initResp.data?.errmsg || "init 未返回 uuid"
      });
      return res.status(400).json({
        ok: false,
        stage: "init",
        message: "init 未返回 uuid",
        raw: initResp.data
      });
    }

    updateActive({
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
    updateActive({ lastError: detail.message });
    pushEvent({ stage: "init_error", error: detail });
    res.status(500).json({
      ok: false,
      message: detail.message,
      detail
    });
  }
});

app.post("/api/set-callback", async (req, res) => {
  try {
    const uuid = String(req.body?.uuid || store.active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化" });
    }

    const callbackUrl = String(req.body?.url || req.body?.callbackUrl || config.callbackUrl || "");
    if (!callbackUrl) {
      return res.status(400).json({ ok: false, message: "缺少回调地址 url（或配置 CALLBACK_URL）" });
    }
    const callbackResp = await setCallbackUrl({ uuid, callbackUrl });
    pushEvent({
      stage: "set_callback",
      request: { uuid, callbackUrl },
      response: callbackResp.data
    });
    updateActive({
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
    pushEvent({ stage: "set_callback_error", error: detail });
    res.status(500).json({
      ok: false,
      message: detail.message,
      detail
    });
  }
});

app.post("/api/get-qrcode", async (req, res) => {
  try {
    const uuid = String(req.body?.uuid || store.active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化" });
    }
    const qrResp = await getQrCode({ uuid });
    pushEvent({ stage: "get_qrcode", request: { uuid }, response: qrResp.data });
    const { qrcode, qrcodeKey } = parseQrResult(qrResp);

    updateActive({
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
    updateActive({ lastError: detail.message });
    pushEvent({ stage: "get_qrcode_error", error: detail });
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
    pushEvent({ stage: "init", request: initPayload, response: initResp.data });
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
    updateActive({ uuid, vid: initPayload.vid, isLogin, lastEvent: "init_success" });
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
    updateActive({ qrcode, qrcodeKey, lastEvent: "qrcode_ready" });
    return res.json({ ok: true, uuid, isLogin, qrcode, qrcodeKey });
  } catch (error) {
    const detail = serializeError(error);
    pushEvent({ stage: "start_login_error", error: detail });
    return res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/automatic-login", async (req, res) => {
  try {
    const uuid = String(req.body?.uuid || store.active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid" });
    }

    const resp = await automaticLogin({ uuid });
    pushEvent({ stage: "automatic_login", request: { uuid }, response: resp.data });
    res.json({ ok: true, raw: resp.data });
  } catch (error) {
    const detail = serializeError(error);
    pushEvent({ stage: "automatic_login_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/check-code", async (req, res) => {
  try {
    const uuid = String(req.body?.uuid || store.active.uuid || "");
    const code = String(req.body?.code || "").trim();
    const qrcodeKey = String(req.body?.qrcodeKey || store.active.qrcodeKey || "").trim();
    if (!uuid) return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化登录" });
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ ok: false, message: "验证码必须是6位数字" });
    }
    if (!qrcodeKey) {
      return res.status(400).json({ ok: false, message: "缺少 qrcodeKey，请先获取二维码或手动输入" });
    }
    const resp = await checkCode({ uuid, qrcodeKey, code });
    pushEvent({
      stage: "check_code",
      request: { uuid, qrcodeKey, code: "******" },
      response: resp.data
    });
    const errcode = Number(resp.data?.errcode ?? resp.data?.error_code ?? -1);
    const errmsg = String(resp.data?.errmsg ?? resp.data?.error_msg ?? "");
    if (errcode !== 0) {
      updateActive({
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
      updateActive({ isLogin: true, lastEvent: "check_code:success", lastError: "" });
    } else {
      updateActive({
        isLogin: false,
        lastEvent: "check_code:submitted_wait_callback",
        lastError: ""
      });
    }
    res.json({ ok: true, raw: resp.data });
  } catch (error) {
    const detail = serializeError(error);
    pushEvent({ stage: "check_code_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/refresh-run-client", async (req, res) => {
  try {
    const uuid = String(req.body?.uuid || store.active.uuid || "");
    if (!uuid) {
      return res.status(400).json({ ok: false, message: "缺少 uuid" });
    }

    const [runResp, runByUuidResp] = await Promise.all([
      getRunClient({ uuid }),
      getRunClientByUuid({ uuid })
    ]);

    const loginState = extractLoginState(runByUuidResp.data);
    if (loginState !== null) {
      updateActive({
        isLogin: loginState,
        lastEvent: "refresh_status",
        lastError: ""
      });
    }

    pushEvent({
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
    pushEvent({ stage: "get_run_client_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/monitor/start", async (_req, res) => {
  startMonitor();
  await checkOnlineAndMaybeReconnect("manual_start");
  res.json({
    ok: true,
    monitor: {
      enabled: store.monitor.enabled,
      intervalMs: config.monitorIntervalMs
    }
  });
});

app.post("/api/monitor/stop", (_req, res) => {
  stopMonitor();
  res.json({ ok: true, monitor: { enabled: false } });
});

app.post("/api/send-text", async (req, res) => {
  try {
    const uuid = String(req.body?.uuid || store.active.uuid || "");
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
    pushEvent({
      stage: "send_text",
      request: payload,
      response: resp.data
    });
    res.json({ ok: true, request: payload, raw: resp.data });
  } catch (error) {
    const detail = serializeError(error);
    pushEvent({ stage: "send_text_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/api/contacts", async (req, res) => {
  try {
    const uuid = String(req.body?.uuid || store.active.uuid || "");
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

    pushEvent({
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
    pushEvent({ stage: "get_contacts_error", error: detail });
    res.status(500).json({ ok: false, message: detail.message, detail });
  }
});

app.post("/callback/wxwork", (req, res) => {
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

  pushEvent({
    stage: "callback",
    eventType,
    payload
  });

  const isLoginSuccess = /登录成功|login.*success|is_login/i.test(text);
  if (isLoginSuccess) {
    updateActive({
      isLogin: true,
      uuid: maybeUuid || store.active.uuid,
      qrcodeKey: qrcodeKey || store.active.qrcodeKey,
      lastEvent: `callback:${eventType}`,
      lastError: ""
    });
  } else if (maybeUuid) {
    updateActive({
      uuid: maybeUuid,
      qrcodeKey: qrcodeKey || store.active.qrcodeKey,
      lastEvent: `callback:${eventType}`
    });
  } else {
    updateActive({
      qrcodeKey: qrcodeKey || store.active.qrcodeKey,
      lastEvent: `callback:${eventType}`
    });
  }

  if (hasDisconnectSignal(text)) {
    updateActive({
      isLogin: false,
      lastEvent: `callback:disconnect:${eventType}`
    });
    void tryReconnect(`callback_${eventType}`);
  }

  res.json({ errcode: 0, errmsg: "ok" });
});

app.listen(config.port, () => {
  startMonitor();
  console.log(
    `[wxwork-demo] listening on http://localhost:${config.port} baseUrl=${config.baseUrl}`
  );
});
