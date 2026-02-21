import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsService } from '../events/events.service';
import { SessionService } from '../events/session.service';

@Injectable()
export class WxWorkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WxWorkService.name);
  private monitorTimer: NodeJS.Timeout | null = null;

  constructor(
    private configService: ConfigService,
    private eventsService: EventsService,
    private sessionService: SessionService
  ) {}

  onModuleInit() {
    this.startMonitor();
  }

  onModuleDestroy() {
    this.stopMonitor();
  }

  private get baseUrl() {
    return this.configService.get<string>('BASE_URL', 'http://47.94.7.218:9952');
  }

  private get callbackUrl() {
    return this.configService.get<string>('CALLBACK_URL', '');
  }

  private joinUrl(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  private withTimeout(ms = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

  private toNetworkError(error: any, url: string) {
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

  private async postJson(path: string, body: any) {
    const url = this.joinUrl(path);
    const { controller, timer } = this.withTimeout();
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: controller.signal
      });
    } catch (error: any) {
      clearTimeout(timer);
      return {
        ok: false,
        status: 0,
        data: this.toNetworkError(error, url)
      };
    }
    clearTimeout(timer);

    let data: any;
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

  // --- API Client Methods ---

  async initClient(payload: any = {}) {
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
    return this.postJson("/wxwork/init", body);
  }

  async setCallbackUrl(uuid: string, url: string) {
    return this.postJson("/wxwork/SetCallbackUrl", {
      uuid,
      url
    });
  }

  async getQrCode(uuid: string) {
    return this.postJson("/wxwork/getQrCode", { uuid });
  }

  async automaticLogin(uuid: string) {
    return this.postJson("/wxwork/automaticLogin", { uuid });
  }

  async checkCode(uuid: string, code: string, qrcodeKey: string = "") {
    return this.postJson("/wxwork/CheckCode", {
      uuid,
      qrcodeKey,
      code
    });
  }

  async getRunClient(uuid: string = "") {
    return this.postJson("/wxwork/GetRunClient", { uuid });
  }

  async getRunClientByUuid(uuid: string) {
    return this.postJson("/wxwork/GetRunClientByUuid", { uuid });
  }

  async sendTextMsg(payload: any = {}) {
    return this.postJson("/wxwork/SendTextMsg", payload);
  }

  async getInnerContacts(payload: any = {}) {
    return this.postJson("/wxwork/GetInnerContacts", payload);
  }

  async getExternalContacts(payload: any = {}) {
    return this.postJson("/wxwork/GetExternalContacts", payload);
  }

  async upstreamPing() {
    return this.postJson("/wxwork/GetRunClient", {});
  }

  // --- Helper Methods ---

  public extractQrcodeKey(payload: any): string {
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
          const nestedKey = this.extractQrcodeKey(obj);
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

    return "";
  }

  public normalizeBool(val: any) {
    if (val === true || val === false) return val;
    if (typeof val === "string") {
      const s = val.trim().toLowerCase();
      if (["true", "1", "yes", "ok"].includes(s)) return true;
      if (["false", "0", "no"].includes(s)) return false;
    }
    if (typeof val === "number") return val !== 0;
    return null;
  }

  public extractLoginState(payload: any) {
    const candidates = [
      payload?.isLogin,
      payload?.is_login,
      payload?.data?.isLogin,
      payload?.data?.is_login,
      payload?.data?.user?.isLogin,
      payload?.data?.user?.is_login
    ];
    for (const c of candidates) {
      const b = this.normalizeBool(c);
      if (b !== null) return b;
    }
    return null;
  }

  private serializeError(error: any) {
    return {
      message: String(error?.message || error),
      name: error?.name || "",
      code: error?.code || error?.cause?.code || "",
      causeMessage: error?.cause?.message || ""
    };
  }

  // --- Monitor Logic ---

  async tryReconnect(reason: string) {
    const monitor = this.eventsService.monitor;
    if (monitor.reconnecting) return;
    
    const active = await this.sessionService.getLatestActive();
    if (!active.vid) return;

    monitor.reconnecting = true;
    monitor.lastReconnectAt = new Date().toISOString();
    let uuid = "";

    try {
      if (!this.callbackUrl) {
         throw new Error("CALLBACK_URL 未配置");
      }

      const initResp = await this.initClient({ vid: active.vid });
      const initData = initResp.data?.data || {};
      uuid = initData.uuid || initResp.data?.uuid || "";
      if (!uuid) {
        throw new Error(`重连 init 未返回 uuid: ${JSON.stringify(initResp.data)}`);
      }
      await this.sessionService.updateActive({
        uuid,
        isLogin: false,
        qrcode: "",
        qrcodeKey: "",
        lastEvent: `reconnect:init:${reason}`,
        lastError: ""
      });

      const cbResp = await this.setCallbackUrl(uuid, this.callbackUrl);
      await this.eventsService.pushEvent({
        stage: "reconnect_set_callback",
        request: { uuid, reason },
        response: cbResp.data
      });

      const autoResp = await this.automaticLogin(uuid);
      await this.eventsService.pushEvent({
        stage: "reconnect_automatic_login",
        request: { uuid, reason },
        response: autoResp.data
      });

      const okText = JSON.stringify(autoResp.data || {});
      const autoOk =
        String(autoResp.data?.errcode ?? autoResp.data?.error_code ?? "0") === "0" &&
        !/失败|error|fail/i.test(okText);
        
      if (autoOk) {
        await this.sessionService.updateActive({
          uuid,
          isLogin: true,
          lastEvent: `reconnect:auto_success:${reason}`,
          lastError: ""
        });
        return;
      }

      const qrResp = await this.getQrCode(uuid);
      const qrData = qrResp.data?.data || {};
      const qrcode =
        qrData.qrcode ||
        qrData.qrCode ||
        qrData.qrcode_data ||
        qrData.url ||
        qrResp.data?.qrcode ||
        "";
      const qrcodeKey = this.extractQrcodeKey(qrResp.data);
      
      await this.sessionService.updateActive({
        uuid,
        qrcode,
        qrcodeKey,
        isLogin: false,
        lastEvent: `reconnect:qrcode_ready:${reason}`,
        lastError: qrcode ? "" : "重连自动登录失败且未获取到二维码"
      });
      await this.eventsService.pushEvent({
        stage: "reconnect_get_qrcode",
        request: { uuid, reason },
        response: qrResp.data
      });

    } catch (error: any) {
      const detail = this.serializeError(error);
      const fallbackUuid = uuid || active.uuid;
      if (fallbackUuid) {
        await this.sessionService.safeUpdateActive({
          uuid: fallbackUuid,
          lastError: `重连失败: ${detail.message}`,
          lastEvent: `reconnect:error:${reason}`
        });
      }
      await this.eventsService.safePushEvent({ stage: "reconnect_error", reason, error: detail });
    } finally {
      monitor.reconnecting = false;
    }
  }

  async checkOnlineAndMaybeReconnect(reason = "poll") {
    const active = await this.sessionService.getLatestActive();
    if (!active.uuid) return;
    
    const monitor = this.eventsService.monitor;
    monitor.running = true;
    monitor.lastCheckAt = new Date().toISOString();
    
    try {
      const resp = await this.getRunClientByUuid(active.uuid);
      await this.eventsService.pushEvent({
        stage: "monitor_check",
        request: { uuid: active.uuid, reason },
        response: resp.data
      });
      
      const text = JSON.stringify(resp.data || {});
      const errcode = resp.data?.errcode ?? resp.data?.error_code;
      const loginState = this.extractLoginState(resp.data);
      const maybeOffline =
        loginState === false ||
        String(errcode || "0") !== "0" ||
        /未登录|离线|不存在|not.*found|offline|disconnect/i.test(text);

      if (maybeOffline) {
        await this.sessionService.updateActive({
          uuid: active.uuid,
          isLogin: false,
          lastEvent: `monitor:offline:${reason}`,
          lastError: `检测离线: errcode=${errcode ?? "unknown"}`
        });
        await this.tryReconnect(`monitor_${reason}`);
      } else {
        const online =
          loginState === true ||
          /"isLogin":true|"is_login":"?true"?/i.test(text);
        await this.sessionService.updateActive({
          uuid: active.uuid,
          isLogin: online,
          lastEvent: `monitor:online:${reason}`,
          lastError: ""
        });
      }
    } catch (error: any) {
      const detail = this.serializeError(error);
      await this.eventsService.safePushEvent({ stage: "monitor_check_error", reason, error: detail });
      await this.sessionService.safeUpdateActive({ uuid: active.uuid, lastError: `状态检测失败: ${detail.message}` });
    } finally {
      monitor.running = false;
    }
  }

  startMonitor() {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.eventsService.monitor.enabled = true;
    const interval = this.configService.get<number>('MONITOR_INTERVAL_MS', 45000);
    this.monitorTimer = setInterval(() => {
      this.checkOnlineAndMaybeReconnect("interval");
    }, interval);
  }

  stopMonitor() {
    this.eventsService.monitor.enabled = false;
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = null;
  }
}
