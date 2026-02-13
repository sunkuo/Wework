const $ = (id) => document.getElementById(id);

const stateEls = {
  status: $("status"),
  qrcodeImg: $("qrcodeImg"),
  qrcode: $("qrcode"),
  events: $("events"),
  contacts: $("contacts"),
  sendResult: $("sendResult"),
  refreshRunClient: $("refreshRunClient"),
  refreshByUuid: $("refreshByUuid"),
  stepFirst: $("stepFirst"),
  stepAuto: $("stepAuto")
};

const flow = {
  mode: "first",
  first: { init: false, callback: false, qrcode: false, checkCode: false },
  auto: { init: false, callback: false, autoTried: false, autoOk: false, fallbackQr: false }
};

function v(id) {
  return ($(id)?.value || "").trim();
}

function extractKeyFromQrUrl(url) {
  const match = String(url || "").match(/\/([^/?.]+)\.(?:png|jpg|jpeg)(?:\?|$)/i);
  return match?.[1] || "";
}

function setIfEmpty(id, value) {
  const el = $(id);
  if (!el) return;
  if (!el.value.trim()) el.value = value || "";
}

function syncUuidInputs(uuid) {
  setIfEmpty("uuid", uuid);
  setIfEmpty("sendUuid", uuid);
  setIfEmpty("contactsUuid", uuid);
}

function parseErrcode(obj) {
  return Number(obj?.errcode ?? obj?.error_code ?? obj?.errorcode ?? -1);
}

function isUpstreamOk(obj) {
  return parseErrcode(obj) === 0;
}

async function api(path, options = {}) {
  const resp = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return resp.json();
}

function setStatus(text) {
  stateEls.status.textContent = text;
}

function renderFlowSteps() {
  const f = flow.first;
  stateEls.stepFirst.textContent =
    `首次流程: init=${f.init ? "OK" : "-"} | callback=${f.callback ? "OK" : "-"} | qrcode=${f.qrcode ? "OK" : "-"} | checkCode=${f.checkCode ? "OK" : "-"}（首次登录必须为OK）`;

  const a = flow.auto;
  stateEls.stepAuto.textContent =
    `自动流程: init=${a.init ? "OK" : "-"} | callback=${a.callback ? "OK" : "-"} | autoLogin=${a.autoTried ? (a.autoOk ? "OK" : "FAIL") : "-"} | fallbackQr=${a.fallbackQr ? "OK" : "-"}`;
}

function updateButtons() {
  const isFirst = flow.mode === "first";
  const isAuto = flow.mode === "auto";
  const hasUuid = Boolean(v("uuid"));

  $("btnInit").disabled = !isFirst;
  $("btnSetCallback").disabled = !isFirst || !flow.first.init;
  $("btnGetQr").disabled = !isFirst || !hasUuid;
  $("btnCheckCode").disabled = !isFirst || !flow.first.qrcode;

  $("btnAutoInit").disabled = !isAuto;
  $("btnAutoSetCallback").disabled = !isAuto || !flow.auto.init;
  $("btnAuto").disabled = !isAuto || !flow.auto.callback;
  $("btnAutoFallbackQr").disabled = !isAuto || !flow.auto.autoTried || flow.auto.autoOk;
}

function resetFirstFlow() {
  flow.first = { init: false, callback: false, qrcode: false, checkCode: false };
}

function resetAutoFlow() {
  flow.auto = { init: false, callback: false, autoTried: false, autoOk: false, fallbackQr: false };
}

function getInitBody(opts = {}) {
  const forceEmptyVid = opts.forceEmptyVid === true;
  return {
    vid: forceEmptyVid ? "" : v("vid"),
    ip: v("ip"),
    port: v("port"),
    proxyType: v("proxyType"),
    userName: v("userName"),
    passward: v("passward"),
    proxySituation: v("proxySituation") || "0",
    deverType: v("deverType") || "ipad"
  };
}

function renderState(state) {
  const a = state?.active || {};
  setStatus(`uuid=${a.uuid || "-"} | vid=${a.vid || "-"} | isLogin=${a.isLogin} | mode=${flow.mode}`);
  const qr = String(a.qrcode || "").trim();
  const isUrl = /^https?:\/\//i.test(qr);
  if (isUrl && stateEls.qrcodeImg) {
    stateEls.qrcodeImg.src = qr;
    stateEls.qrcodeImg.style.display = "block";
    stateEls.qrcode.textContent = `二维码链接：\n${qr}`;
  } else {
    if (stateEls.qrcodeImg) {
      stateEls.qrcodeImg.removeAttribute("src");
      stateEls.qrcodeImg.style.display = "none";
    }
    stateEls.qrcode.textContent = qr ? `二维码数据：\n${qr}` : "暂无二维码";
  }

  syncUuidInputs(a.uuid || "");
  setIfEmpty("qrcodeKey", a.qrcodeKey || extractKeyFromQrUrl(a.qrcode));
  setIfEmpty("callbackUrl", state?.callbackUrl || "");
  updateButtons();
}

function renderEvents(events) {
  stateEls.events.textContent =
    events.length === 0
      ? "暂无回调日志"
      : events
          .map((e) => `${e.time} [${e.stage}] ${JSON.stringify(e).slice(0, 900)}`)
          .join("\n\n");
}

async function refresh() {
  try {
    const [state, events] = await Promise.all([api("/api/state"), api("/api/events")]);
    renderState(state);
    renderEvents(events.events || []);
  } catch (err) {
    setStatus(`刷新失败: ${String(err)}`);
  }
}

async function doInit(forceEmptyVid) {
  const body = getInitBody({ forceEmptyVid });
  const data = await api("/api/init", { method: "POST", body });
  if (!data.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }
  syncUuidInputs(data.uuid || "");
  return data;
}

async function doSetCallback() {
  const data = await api("/api/set-callback", {
    method: "POST",
    body: { uuid: v("uuid"), url: v("callbackUrl") }
  });
  if (!data.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }
  return data;
}

async function doGetQr() {
  const data = await api("/api/get-qrcode", {
    method: "POST",
    body: { uuid: v("uuid") }
  });
  if (!data.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }
  $("qrcodeKey").value = data.qrcodeKey || extractKeyFromQrUrl(data.qrcode) || v("qrcodeKey");
  return data;
}

function setMode(mode) {
  flow.mode = mode === "auto" ? "auto" : "first";
  resetFirstFlow();
  resetAutoFlow();
  renderFlowSteps();
  updateButtons();
}

$("modeFirst").addEventListener("change", () => {
  if ($("modeFirst").checked) {
    setMode("first");
    setStatus("已切换到首次登录流程（验证码必调）");
  }
});

$("modeAuto").addEventListener("change", () => {
  if ($("modeAuto").checked) {
    setMode("auto");
    setStatus("已切换到自动登录流程（必须带vid）");
  }
});

$("btnInit").addEventListener("click", async () => {
  setStatus("首次流程：正在初始化（vid强制为空）...");
  try {
    await doInit(true);
    flow.first.init = true;
    flow.first.callback = false;
    flow.first.qrcode = false;
    flow.first.checkCode = false;
    setStatus("首次流程：初始化成功，下一步请设置回调");
  } catch (err) {
    setStatus(`首次流程初始化失败: ${String(err)}`);
  }
  renderFlowSteps();
  updateButtons();
  await refresh();
});

$("btnSetCallback").addEventListener("click", async () => {
  setStatus("首次流程：正在设置回调...");
  try {
    await doSetCallback();
    flow.first.callback = true;
    setStatus("首次流程：回调设置成功，下一步获取二维码");
  } catch (err) {
    setStatus(`首次流程设置回调失败: ${String(err)}`);
  }
  renderFlowSteps();
  updateButtons();
  await refresh();
});

$("btnGetQr").addEventListener("click", async () => {
  setStatus("首次流程：正在获取二维码...");
  try {
    await doGetQr();
    flow.first.qrcode = true;
    setStatus("首次流程：二维码已获取，下一步必须提交验证码");
  } catch (err) {
    setStatus(`首次流程获取二维码失败: ${String(err)}`);
  }
  renderFlowSteps();
  updateButtons();
  await refresh();
});

$("btnCheckCode").addEventListener("click", async () => {
  setStatus("首次流程：正在提交验证码...");
  try {
    const data = await api("/api/check-code", {
      method: "POST",
      body: {
        uuid: v("uuid"),
        qrcodeKey: v("qrcodeKey"),
        code: v("code6")
      }
    });
    if (!data.ok) {
      throw new Error(data.message || "unknown error");
    }
    flow.first.checkCode = true;
    setStatus(`首次流程：验证码接口已成功调用（errcode=${parseErrcode(data.raw)})`);
  } catch (err) {
    setStatus(`首次流程验证码提交失败: ${String(err)}`);
  }
  renderFlowSteps();
  updateButtons();
  await refresh();
});

$("btnAutoInit").addEventListener("click", async () => {
  if (!v("vid")) {
    setStatus("自动流程初始化失败：vid 必填");
    return;
  }
  setStatus("自动流程：正在初始化（带vid）...");
  try {
    await doInit(false);
    flow.auto.init = true;
    flow.auto.callback = false;
    flow.auto.autoTried = false;
    flow.auto.autoOk = false;
    flow.auto.fallbackQr = false;
    setStatus("自动流程：初始化成功，下一步设置回调");
  } catch (err) {
    setStatus(`自动流程初始化失败: ${String(err)}`);
  }
  renderFlowSteps();
  updateButtons();
  await refresh();
});

$("btnAutoSetCallback").addEventListener("click", async () => {
  setStatus("自动流程：正在设置回调...");
  try {
    await doSetCallback();
    flow.auto.callback = true;
    setStatus("自动流程：回调设置成功，下一步自动登录");
  } catch (err) {
    setStatus(`自动流程设置回调失败: ${String(err)}`);
  }
  renderFlowSteps();
  updateButtons();
  await refresh();
});

$("btnAuto").addEventListener("click", async () => {
  setStatus("自动流程：正在调用 automaticLogin...");
  try {
    const data = await api("/api/automatic-login", {
      method: "POST",
      body: { uuid: v("uuid") }
    });
    flow.auto.autoTried = true;
    flow.auto.autoOk = isUpstreamOk(data.raw);
    if (flow.auto.autoOk) {
      setStatus("自动流程：automaticLogin 成功");
    } else {
      setStatus("自动流程：automaticLogin 失败，请执行回退获取二维码");
    }
  } catch (err) {
    flow.auto.autoTried = true;
    flow.auto.autoOk = false;
    setStatus(`自动流程调用失败: ${String(err)}`);
  }
  renderFlowSteps();
  updateButtons();
  await refresh();
});

$("btnAutoFallbackQr").addEventListener("click", async () => {
  setStatus("自动流程回退：正在获取二维码...");
  try {
    await doGetQr();
    flow.auto.fallbackQr = true;
    setStatus("自动流程回退：二维码已获取，可扫码登录");
  } catch (err) {
    setStatus(`自动流程回退获取二维码失败: ${String(err)}`);
  }
  renderFlowSteps();
  updateButtons();
  await refresh();
});

$("btnRefresh").addEventListener("click", async () => {
  setStatus("正在刷新运行状态...");
  try {
    const data = await api("/api/refresh-run-client", {
      method: "POST",
      body: { uuid: v("uuid") }
    });
    const runClientRaw = data?.getRunClient || {};
    const byUuid = data?.getRunClientByUuid || {};

    const runClientArray =
      (Array.isArray(runClientRaw?.data) && runClientRaw.data) ||
      (Array.isArray(runClientRaw?.data?.list) && runClientRaw.data.list) ||
      (Array.isArray(runClientRaw?.data?.rows) && runClientRaw.data.rows) ||
      (Array.isArray(runClientRaw?.data?.data) && runClientRaw.data.data) ||
      [];
    const count = runClientArray.length;

    if (stateEls.refreshRunClient) {
      stateEls.refreshRunClient.textContent = JSON.stringify(
        {
          count,
          source: "getRunClient",
          raw: runClientRaw
        },
        null,
        2
      );
    }
    if (stateEls.refreshByUuid) {
      stateEls.refreshByUuid.textContent = JSON.stringify(byUuid, null, 2);
    }

    setStatus(
      `刷新完成: GetRunClient数组数量=${count} | ByUuid errcode=${byUuid.errcode ?? "-"} errmsg=${byUuid.errmsg ?? "-"}`
    );
  } catch (err) {
    setStatus(`刷新失败: ${String(err)}`);
  }
  await refresh();
});

$("btnSend").addEventListener("click", async () => {
  setStatus("正在发送文本消息...");
  try {
    const data = await api("/api/send-text", {
      method: "POST",
      body: {
        uuid: v("sendUuid") || v("uuid"),
        kf_id: v("kfId") || "0",
        send_userid: v("sendUserid"),
        isRoom: v("isRoom"),
        content: v("content")
      }
    });
    stateEls.sendResult.textContent = JSON.stringify(data, null, 2);
    if (!data.ok) {
      setStatus(`发送失败: ${data.message || "unknown error"}`);
    } else {
      setStatus(`发送完成: errcode=${data.raw?.errcode ?? "-"}`);
    }
  } catch (err) {
    setStatus(`请求异常: ${String(err)}`);
    stateEls.sendResult.textContent = JSON.stringify({ ok: false, error: String(err) }, null, 2);
  }
  await refresh();
});

$("btnContacts").addEventListener("click", async () => {
  setStatus("正在获取通讯录列表...");
  try {
    const innerLimit = Number(v("innerLimit") || 100);
    const externalLimit = Number(v("externalLimit") || 100);
    const data = await api("/api/contacts", {
      method: "POST",
      body: {
        uuid: v("contactsUuid") || v("uuid"),
        innerLimit: Number.isFinite(innerLimit) && innerLimit > 0 ? Math.floor(innerLimit) : 100,
        innerStrSeq: v("innerStrSeq"),
        externalLimit:
          Number.isFinite(externalLimit) && externalLimit > 0 ? Math.floor(externalLimit) : 100,
        externalStrSeq: v("externalStrSeq")
      }
    });
    if (!data.ok) {
      stateEls.contacts.textContent = JSON.stringify(data, null, 2);
      setStatus(`获取失败: ${data.message || "unknown error"}`);
    } else {
      const summary = data.summary || {};
      setStatus(`获取成功: 企业好友=${summary.innerCount ?? "-"}，微信好友=${summary.externalCount ?? "-"}`);
      stateEls.contacts.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    setStatus(`请求异常: ${String(err)}`);
    stateEls.contacts.textContent = JSON.stringify({ ok: false, error: String(err) }, null, 2);
  }
  await refresh();
});

$("uuid").addEventListener("input", () => {
  updateButtons();
});

if (stateEls.sendResult) {
  stateEls.sendResult.textContent = "暂无发送结果";
}
if (stateEls.contacts) {
  stateEls.contacts.textContent = "暂无通讯录结果";
}

setMode("first");
refresh();
setInterval(refresh, 5000);
