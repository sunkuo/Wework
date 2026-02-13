# wxwork-demo

基于接口文档实现的登录与业务调用 Demo。  
默认上游为 `BASE_URL=http://47.94.7.218:9952`，接口路径保持文档一致（如 `/wxwork/init`、`/wxwork/getQrCode`）。

## 当前实现

- Node.js + Express
- **Prisma + MySQL** 持久化：
  - `sessions`：当前会话状态（uuid、vid、二维码、登录态等）
  - `events`：请求/回调日志
- 前端页面：双流程登录（首次登录/自动登录）+ 常用业务接口调试

## 环境要求

- Node.js 18+
- MySQL 8.0+（或兼容版本）

## 数据库准备

1. 创建数据库（如果尚未创建）：
   ```sql
   CREATE DATABASE IF NOT EXISTS wxwork CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. 复制配置文件：
   ```bash
   cp .env.example .env
   ```

3. **配置 `.env`**：
   确保 `DATABASE_URL` 正确指向你的数据库。

4. **初始化数据表** (使用 Prisma)：
   ```bash
   npx prisma migrate dev --name init
   ```

## 配置

主要变量（`.env`）：

- `PORT`：本地服务端口，默认 `3000`
- `BASE_URL`：上游地址，默认 `http://47.94.7.218:9952`
- `CALLBACK_URL`：外网可访问回调地址（必须可被上游访问）
- **`DATABASE_URL`**：**Prisma 必需**，格式 `mysql://USER:PASSWORD@HOST:PORT/DATABASE`
- `MYSQL_*`：应用内兼容旧逻辑的配置（仍需保留以兼容部分未迁移代码，建议与 DATABASE_URL 保持一致）
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

## 常见问题

- `fetch failed`：检查 `BASE_URL` 是否连通。
- Prisma 连接失败：检查 `.env` 中的 `DATABASE_URL` 是否包含特殊字符（需 URL 编码）。
