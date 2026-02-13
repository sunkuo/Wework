import { config } from "./config.js";

function joinUrl(path) {
  return `${config.baseUrl.replace(/\/$/, "")}${path}`;
}

function withTimeout(ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

function toNetworkError(error, url) {
  return {
    errcode: -1,
    errmsg: "请求上游失败",
    detail: {
      message: error?.message || String(error),
      causeMessage: error?.cause?.message || "",
      code: error?.cause?.code || error?.code || "",
      name: error?.name || "",
      url
    }
  };
}

async function postJson(path, body) {
  const url = joinUrl(path);
  const { controller, timer } = withTimeout();
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      data: toNetworkError(error, url)
    };
  }
  clearTimeout(timer);

  let data;
  try {
    data = await resp.json();
  } catch {
    data = {
      errcode: -1,
      errmsg: "响应不是 JSON",
      raw: await resp.text()
    };
  }

  return {
    ok: resp.ok,
    status: resp.status,
    data
  };
}

export async function initClient(payload = {}) {
  const body = {
    vid: "",
    ip: "",
    port: "",
    proxyType: "",
    userName: "",
    passward: "",
    proxySituation: 0,
    deverType: "ipad",
    ...payload
  };
  return postJson("/wxwork/init", body);
}

export async function setCallbackUrl({ uuid, callbackUrl }) {
  return postJson("/wxwork/SetCallbackUrl", {
    uuid,
    url: callbackUrl
  });
}

export async function getQrCode({ uuid }) {
  return postJson("/wxwork/getQrCode", { uuid });
}

export async function automaticLogin({ uuid }) {
  return postJson("/wxwork/automaticLogin", { uuid });
}

export async function checkCode({ uuid, code, qrcodeKey = "" }) {
  return postJson("/wxwork/CheckCode", {
    uuid,
    qrcodeKey,
    code
  });
}

export async function getRunClient({ uuid = "" }) {
  return postJson("/wxwork/GetRunClient", { uuid });
}

export async function getRunClientByUuid({ uuid }) {
  return postJson("/wxwork/GetRunClientByUuid", { uuid });
}

export async function sendTextMsg(payload = {}) {
  return postJson("/wxwork/SendTextMsg", payload);
}

export async function getInnerContacts(payload = {}) {
  return postJson("/wxwork/GetInnerContacts", payload);
}

export async function getExternalContacts(payload = {}) {
  return postJson("/wxwork/GetExternalContacts", payload);
}

export async function upstreamPing() {
  return postJson("/wxwork/GetRunClient", {});
}
