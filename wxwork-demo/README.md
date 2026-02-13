# wxwork-demo

基于接口文档实现的登录与业务调用 Demo。  
默认上游为 `BASE_URL=http://47.94.7.218:9952`，接口路径保持文档一致（如 `/wxwork/init`、`/wxwork/getQrCode`）。

## 当前实现

- Node.js + Express
- MySQL 持久化：
  - `sessions`：当前会话状态（uuid、vid、二维码、登录态等）
  - `events`：请求/回调日志
- 前端页面：双流程登录（首次登录/自动登录）+ 常用业务接口调试

## 功能覆盖

- 首次登录：`init -> SetCallbackUrl -> getQrCode -> CheckCode`
- 自动登录：`init(带 vid) -> SetCallbackUrl -> automaticLogin`，失败可回退 `getQrCode`
- 状态刷新：同时调用 `GetRunClient` 和 `GetRunClientByUuid`
- 发送文本：`SendTextMsg`（`uuid/kf_id/send_userid/isRoom/content`）
- 获取通讯录：`GetInnerContacts` + `GetExternalContacts`（`uuid/limit/strSeq`）
- 回调接收：`POST /callback/wxwork`
- 后台状态检测与自动重连（服务端定时任务）

## 环境要求

- Node.js 18+
- MySQL 8.0+（或兼容版本）

## 数据库准备

先创建数据库：

```sql
CREATE DATABASE IF NOT EXISTS wxwork CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

创建会话表：

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  uuid VARCHAR(64) NOT NULL,
  vid VARCHAR(64) DEFAULT '',
  is_login TINYINT(1) NOT NULL DEFAULT 0,
  qrcode LONGTEXT,
  qrcode_key VARCHAR(128) DEFAULT '',
  last_event VARCHAR(255) DEFAULT '',
  last_error TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_uuid (uuid),
  KEY idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

创建日志表：

```sql
CREATE TABLE IF NOT EXISTS events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_uuid VARCHAR(64) DEFAULT '',
  stage VARCHAR(64) DEFAULT '',
  event_type VARCHAR(64) DEFAULT '',
  payload JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_created_at (created_at),
  KEY idx_session_uuid (session_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 配置

复制环境变量文件：

```bash
cp .env.example .env
```

主要变量：

- `PORT`：本地服务端口，默认 `3000`
- `BASE_URL`：上游地址，默认 `http://47.94.7.218:9952`
- `CALLBACK_URL`：外网可访问回调地址（必须可被上游访问）
- `MYSQL_HOST`：默认 `127.0.0.1`
- `MYSQL_PORT`：默认 `3306`
- `MYSQL_USER`：默认 `root`
- `MYSQL_PASSWORD`：默认空
- `MYSQL_DATABASE`：默认 `wxwork`
- `MAX_EVENTS`：日志保留上限，默认 `100`
- `MONITOR_INTERVAL_MS`：状态检测间隔，默认 `45000`

## 启动

```bash
npm install
npm run dev
```

打开：

- `http://localhost:3000`

## 页面操作流程

1. 首次登录模式：
   `初始化(vid留空) -> 设置回调 -> 获取二维码 -> 提交6位验证码`
2. 自动登录模式：
   `初始化(vid必填) -> 设置回调 -> 自动登录`，失败再点“回退获取二维码”
3. 登录后可在页面调用发送消息、拉取通讯录、刷新运行状态。

## 后端调试接口（本地）

- `GET /api/health`
- `GET /api/state`
- `GET /api/events`
- `POST /api/init`
- `POST /api/set-callback`
- `POST /api/get-qrcode`
- `POST /api/check-code`
- `POST /api/automatic-login`
- `POST /api/refresh-run-client`
- `POST /api/send-text`
- `POST /api/contacts`
- `POST /callback/wxwork`

## 常见问题

- `fetch failed / other side closed`：通常是 `BASE_URL` 不通或上游连接被断开。
- 设置回调无效：检查 `CALLBACK_URL` 是否公网可访问，路径应包含 `/callback/wxwork`。
- 初始化后无 `uuid`：以上游返回为准，查看 `/api/events` 的 `init` 日志排查。
