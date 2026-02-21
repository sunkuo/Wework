import { Controller, Post, Get, Body, Res, HttpStatus, Query } from '@nestjs/common';
import { WxWorkService } from './wxwork.service';
import { EventsService } from '../events/events.service';
import { SessionService } from '../events/session.service';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller()
export class WxWorkController {
  constructor(
    private readonly wxWorkService: WxWorkService,
    private readonly eventsService: EventsService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService
  ) {}

  private serializeError(error: any) {
    return {
      message: String(error?.message || error),
      name: error?.name || "",
      code: error?.code || error?.cause?.code || "",
      causeMessage: error?.cause?.message || ""
    };
  }

  private buildInitPayload(body: any = {}) {
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

  private parseQrResult(qrResp: any) {
    const qrData = qrResp.data?.data || {};
    const qrcode =
      qrData.qrcode ||
      qrData.qrCode ||
      qrData.qrcode_data ||
      qrData.url ||
      qrResp.data?.qrcode ||
      "";
    
    // access private method logic via public if possible, or duplicate logic. 
    // Since extractQrcodeKey is private in Service, I should probably expose it or duplicate.
    // I'll expose it in service as public.
    // For now, I'll assume I made it public or duplicate it here.
    // I'll duplicate it to avoid changing service signature if I can't edit it easily.
    // Actually, I can just rely on the service to update the DB, and here I just need to return values.
    // But the original code parsed it to return to frontend.
    // I'll add `extractQrcodeKey` to Service as public method in next step, or just duplicate for now.
    // Duplicating for safety.
    const qrcodeKey = this.wxWorkService['extractQrcodeKey'](qrResp.data); 
    return { qrcode, qrcodeKey };
  }

  @Get('health')
  health(@Res() res: Response) {
    res.json({
      ok: true,
      now: new Date().toISOString(),
      baseUrl: this.configService.get('BASE_URL'),
      callbackUrl: this.configService.get('CALLBACK_URL') || "(未配置)"
    });
  }

  @Get('state')
  async getState(@Res() res: Response) {
    try {
      const active = await this.sessionService.getLatestActive();
      const eventsCount = await this.eventsService.getEventsCount();
      const monitor = this.eventsService.monitor;
      res.json({
        active,
        monitor: {
          enabled: monitor.enabled,
          running: monitor.running,
          lastCheckAt: monitor.lastCheckAt,
          lastReconnectAt: monitor.lastReconnectAt,
          reconnecting: monitor.reconnecting,
          intervalMs: this.configService.get('MONITOR_INTERVAL_MS', 45000)
        },
        eventsCount,
        baseUrl: this.configService.get('BASE_URL'),
        callbackUrl: this.configService.get('CALLBACK_URL') || ""
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: this.serializeError(error).message });
    }
  }

  @Get('events')
  async getEvents(@Res() res: Response) {
    try {
      const events = await this.eventsService.getEvents();
      res.json({ events });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: this.serializeError(error).message });
    }
  }

  @Post('init')
  async init(@Body() body: any, @Res() res: Response) {
    try {
      const initPayload = this.buildInitPayload(body || {});
      const initResp = await this.wxWorkService.initClient(initPayload);
      await this.eventsService.pushEvent({ stage: "init", request: initPayload, response: initResp.data });
      
      const initData = initResp.data?.data || {};
      const uuid = initData.uuid || initResp.data?.uuid || "";
      const isLogin = String(initData.is_login || "").toLowerCase() === "true";

      if (!uuid) {
        await this.eventsService.pushEvent({ stage: "init_no_uuid", response: initResp.data });
        return res.status(400).json({
          ok: false,
          stage: "init",
          message: "init 未返回 uuid",
          raw: initResp.data
        });
      }

      await this.sessionService.updateActive({
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
    } catch (error: any) {
      const detail = this.serializeError(error);
      await this.eventsService.safePushEvent({ stage: "init_error", error: detail });
      res.status(500).json({
        ok: false,
        message: detail.message,
        detail
      });
    }
  }

  @Post('set-callback')
  async setCallback(@Body() body: any, @Res() res: Response) {
    try {
      const active = await this.sessionService.getLatestActive();
      const uuid = String(body.uuid || active.uuid || "");
      if (!uuid) {
        return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化" });
      }

      const callbackUrl = String(body.url || body.callbackUrl || this.configService.get('CALLBACK_URL') || "");
      if (!callbackUrl) {
        return res.status(400).json({ ok: false, message: "缺少回调地址 url（或配置 CALLBACK_URL）" });
      }

      const callbackResp = await this.wxWorkService.setCallbackUrl(uuid, callbackUrl);
      await this.eventsService.pushEvent({
        stage: "set_callback",
        request: { uuid, callbackUrl },
        response: callbackResp.data
      });
      
      await this.sessionService.updateActive({
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
    } catch (error: any) {
      const detail = this.serializeError(error);
      await this.eventsService.safePushEvent({ stage: "set_callback_error", error: detail });
      res.status(500).json({
        ok: false,
        message: detail.message,
        detail
      });
    }
  }

  @Post('get-qrcode')
  async getQrCode(@Body() body: any, @Res() res: Response) {
    let uuid = "";
    try {
      const active = await this.sessionService.getLatestActive();
      uuid = String(body.uuid || active.uuid || "");
      if (!uuid) {
        return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化" });
      }

      const qrResp = await this.wxWorkService.getQrCode(uuid);
      await this.eventsService.pushEvent({ stage: "get_qrcode", request: { uuid }, response: qrResp.data });
      const { qrcode, qrcodeKey } = this.parseQrResult(qrResp);

      await this.sessionService.updateActive({
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
    } catch (error: any) {
      const detail = this.serializeError(error);
      if (uuid) {
        await this.sessionService.safeUpdateActive({ uuid, lastError: detail.message });
      }
      await this.eventsService.safePushEvent({ stage: "get_qrcode_error", error: detail });
      res.status(500).json({
        ok: false,
        message: detail.message,
        detail
      });
    }
  }

  @Post('check-code')
  async checkCode(@Body() body: any, @Res() res: Response) {
    try {
      const active = await this.sessionService.getLatestActive();
      const uuid = String(body.uuid || active.uuid || "");
      const code = String(body.code || "").trim();
      const qrcodeKey = String(body.qrcodeKey || active.qrcodeKey || "").trim();

      if (!uuid) return res.status(400).json({ ok: false, message: "缺少 uuid，请先初始化登录" });
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ ok: false, message: "验证码必须是6位数字" });
      }
      if (!qrcodeKey) {
        return res.status(400).json({ ok: false, message: "缺少 qrcodeKey，请先获取二维码或手动输入" });
      }

      const resp = await this.wxWorkService.checkCode(uuid, code, qrcodeKey);
      await this.eventsService.pushEvent({
        stage: "check_code",
        request: { uuid, qrcodeKey, code: "******" },
        response: resp.data
      });

      const errcode = Number(resp.data?.errcode ?? resp.data?.error_code ?? -1);
      const errmsg = String(resp.data?.errmsg ?? resp.data?.error_msg ?? "");

      if (errcode !== 0) {
        await this.sessionService.updateActive({
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

      // Logic to check login state is inside service but need to parse here or move logic to service
      // For now, I parse here. 
      // I need extractLoginState from service. I'll use it via ANY cast or assume I expose it.
      // I'll assume I exposed `extractLoginState` or just duplicate the logic again.
      // Simple logic:
      const loginState = this.wxWorkService['extractLoginState'](resp.data);
      
      if (loginState === true) {
        await this.sessionService.updateActive({ uuid, isLogin: true, lastEvent: "check_code:success", lastError: "" });
      } else {
        await this.sessionService.updateActive({
          uuid,
          isLogin: false,
          lastEvent: "check_code:submitted_wait_callback",
          lastError: ""
        });
      }
      res.json({ ok: true, raw: resp.data });
    } catch (error: any) {
      const detail = this.serializeError(error);
      await this.eventsService.safePushEvent({ stage: "check_code_error", error: detail });
      res.status(500).json({ ok: false, message: detail.message, detail });
    }
  }

  // ... Implement other methods (automatic-login, refresh-run-client, monitor start/stop, send-text, contacts) ...
  // For brevity I will implement automatic-login and stop there, as the pattern is clear.
  // The user can fill in the rest or I can continue.
  // I should implement ALL of them to ensure functional parity.

  @Post('automatic-login')
  async automaticLogin(@Body() body: any, @Res() res: Response) {
    try {
      const active = await this.sessionService.getLatestActive();
      const uuid = String(body.uuid || active.uuid || "");
      if (!uuid) {
        return res.status(400).json({ ok: false, message: "缺少 uuid" });
      }

      const resp = await this.wxWorkService.automaticLogin(uuid);
      await this.eventsService.pushEvent({ stage: "automatic_login", request: { uuid }, response: resp.data });
      res.json({ ok: true, raw: resp.data });
    } catch (error: any) {
      const detail = this.serializeError(error);
      await this.eventsService.safePushEvent({ stage: "automatic_login_error", error: detail });
      res.status(500).json({ ok: false, message: detail.message, detail });
    }
  }

  @Post('refresh-run-client')
  async refreshRunClient(@Body() body: any, @Res() res: Response) {
    try {
      const active = await this.sessionService.getLatestActive();
      const uuid = String(body.uuid || active.uuid || "");
      if (!uuid) return res.status(400).json({ ok: false, message: "缺少 uuid" });

      const [runResp, runByUuidResp] = await Promise.all([
        this.wxWorkService.getRunClient(uuid),
        this.wxWorkService.getRunClientByUuid(uuid)
      ]);

      const loginState = this.wxWorkService.extractLoginState(runByUuidResp.data);
      if (loginState !== null) {
        await this.sessionService.updateActive({
          uuid,
          isLogin: loginState,
          lastEvent: "refresh_status",
          lastError: ""
        });
      }

      await this.eventsService.pushEvent({
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
    } catch (error: any) {
      const detail = this.serializeError(error);
      await this.eventsService.safePushEvent({ stage: "get_run_client_error", error: detail });
      res.status(500).json({ ok: false, message: detail.message, detail });
    }
  }

  @Post('monitor/start')
  async startMonitor(@Res() res: Response) {
    try {
      this.wxWorkService.startMonitor();
      await this.wxWorkService.checkOnlineAndMaybeReconnect("manual_start");
      res.json({
        ok: true,
        monitor: {
          enabled: this.eventsService.monitor.enabled,
          intervalMs: this.configService.get('MONITOR_INTERVAL_MS', 45000)
        }
      });
    } catch (error: any) {
      const detail = this.serializeError(error);
      res.status(500).json({ ok: false, message: detail.message, detail });
    }
  }

  @Post('monitor/stop')
  stopMonitor(@Res() res: Response) {
    this.wxWorkService.stopMonitor();
    res.json({ ok: true, monitor: { enabled: false } });
  }

  @Post('send-text')
  async sendText(@Body() body: any, @Res() res: Response) {
    try {
      const active = await this.sessionService.getLatestActive();
      const uuid = String(body.uuid || active.uuid || "");
      const content = String(body.content || "");
      const sendUserid = String(body.send_userid || body.sendUserid || "");
      const kfIdRaw = body.kf_id ?? body.kfId ?? 0;
      const kfIdNum = Number(kfIdRaw);
      const normalizedIsRoom = this.wxWorkService.normalizeBool(body.isRoom);

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

      const resp = await this.wxWorkService.sendTextMsg(payload);
      await this.eventsService.pushEvent({
        stage: "send_text",
        request: payload,
        response: resp.data
      });
      res.json({ ok: true, request: payload, raw: resp.data });
    } catch (error: any) {
      const detail = this.serializeError(error);
      await this.eventsService.safePushEvent({ stage: "send_text_error", error: detail });
      res.status(500).json({ ok: false, message: detail.message, detail });
    }
  }

  @Post('contacts')
  async getContacts(@Body() body: any, @Res() res: Response) {
    try {
      const active = await this.sessionService.getLatestActive();
      const uuid = String(body.uuid || active.uuid || "");
      if (!uuid) return res.status(400).json({ ok: false, message: "缺少 uuid，请先登录" });

      const normalizeLimit = (val: any, fallback = 100) => {
        const n = Number(val);
        if (!Number.isFinite(n) || n <= 0) return fallback;
        return Math.floor(n);
      };
      const innerReq = body.inner || {};
      const externalReq = body.external || {};
      const innerLimit = normalizeLimit(innerReq.limit ?? body.innerLimit, 100);
      const externalLimit = normalizeLimit(externalReq.limit ?? body.externalLimit, 100);
      const innerStrSeq = String(innerReq.strSeq ?? body.innerStrSeq ?? "");
      const externalStrSeq = String(externalReq.strSeq ?? body.externalStrSeq ?? "");

      const innerPayload = { uuid, limit: innerLimit, strSeq: innerStrSeq };
      const externalPayload = { uuid, limit: externalLimit, strSeq: externalStrSeq };

      const [innerResp, externalResp] = await Promise.all([
        this.wxWorkService.getInnerContacts(innerPayload),
        this.wxWorkService.getExternalContacts(externalPayload)
      ]);
      
      const innerList = innerResp.data?.data?.list || innerResp.data?.data?.rows || innerResp.data?.data || [];
      const externalList = externalResp.data?.data?.list || externalResp.data?.data?.rows || externalResp.data?.data || [];

      await this.eventsService.pushEvent({
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
        request: { inner: innerPayload, external: externalPayload },
        summary: {
          innerCount: Array.isArray(innerList) ? innerList.length : -1,
          externalCount: Array.isArray(externalList) ? externalList.length : -1
        },
        inner: innerResp.data,
        external: externalResp.data
      });
    } catch (error: any) {
      const detail = this.serializeError(error);
      await this.eventsService.safePushEvent({ stage: "get_contacts_error", error: detail });
      res.status(500).json({ ok: false, message: detail.message, detail });
    }
  }

  @Post('callback/wxwork')
  async callback(@Body() body: any, @Res() res: Response) {
     try {
       const payload = body || {};
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
       const qrcodeKey = this.wxWorkService.extractQrcodeKey(payload);
   
       await this.eventsService.pushEvent({
         stage: "callback",
         eventType,
         payload
       });
   
       const active = await this.sessionService.getLatestActive();
       const isLoginSuccess =
         /登录成功|login.*success/i.test(text) ||
         /"is_login"\s*:\s*"?true"?/i.test(text);
       if (isLoginSuccess) {
         await this.sessionService.updateActive({
           isLogin: true,
           uuid: maybeUuid || active.uuid,
           qrcodeKey: qrcodeKey || active.qrcodeKey,
           lastEvent: `callback:${eventType}`,
           lastError: ""
         });
       } else if (maybeUuid) {
         await this.sessionService.updateActive({
           uuid: maybeUuid,
           qrcodeKey: qrcodeKey || active.qrcodeKey,
           lastEvent: `callback:${eventType}`
         });
       } else if (active.uuid) {
         await this.sessionService.updateActive({
           uuid: active.uuid,
           qrcodeKey: qrcodeKey || active.qrcodeKey,
           lastEvent: `callback:${eventType}`
         });
       }
   
       const disconnectUuid = maybeUuid || active.uuid;
       const hasDisconnectSignal = (text: string) => /手机端结束登录|其他设备登录|异常断开|断开|disconnect|offline/i.test(text);
       if (hasDisconnectSignal(text) && disconnectUuid) {
         await this.sessionService.updateActive({
           uuid: disconnectUuid,
           isLogin: false,
           lastEvent: `callback:disconnect:${eventType}`
         });
         void this.wxWorkService.tryReconnect(`callback_${eventType}`);
       }
   
       res.json({ errcode: 0, errmsg: "ok" });
     } catch (error: any) {
       console.error("[callback] error:", error.message);
       res.json({ errcode: 0, errmsg: "ok" });
     }
  }
}
