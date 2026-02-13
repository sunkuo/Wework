import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || "http://47.94.7.218:9952",
  callbackUrl: process.env.CALLBACK_URL || "https://rachael-unappliable-interpervasively.ngrok-free.dev/callback/wxwork",
  maxEvents: 100,
  monitorIntervalMs: Number(process.env.MONITOR_INTERVAL_MS || 45000)
};

export function requireCallbackUrl() {
  if (!config.callbackUrl) {
    throw new Error("CALLBACK_URL 未配置。请在 .env 中设置可被外网访问的回调地址。");
  }
}
