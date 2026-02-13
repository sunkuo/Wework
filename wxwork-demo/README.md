# wxwork-demo

基于你提供的接口文档做的最小可运行 Demo，默认使用：

- `BASE_URL=http://47.94.7.218:9952`
- 接口路径不变（如 `/wxwork/init`、`/wxwork/getQrCode`）

## 功能

- 初始化并获取登录二维码（`init -> SetCallbackUrl -> getQrCode`）
- 初始化参数完整透传（`vid/ip/port/proxyType/userName/passward/proxySituation/deverType`）
- 自动登录（`automaticLogin`）
- 验证码校验（`CheckCode`，支持 `qrcodeKey + code`）
- 刷新运行状态（`GetRunClient` + `GetRunClientByUuid`）
- 状态检测与自动重连（轮询 `GetRunClientByUuid` + 断开回调触发重连）
- 发送文本消息（`SendTextMsg`，字段：`uuid/kf_id/send_userid/isRoom/content`）
- 获取通讯录列表（`GetInnerContacts` + `GetExternalContacts`，字段：`uuid/limit/strSeq`）
- 接收回调（`POST /callback/wxwork`）
- 状态和回调日志查看

## 目录

```
wxwork-demo/
  public/
    index.html
    main.js
    styles.css
  src/
    config.js
    server.js
    store.js
    wxworkClient.js
  .env.example
  package.json
```

## 启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

必须设置：

- `CALLBACK_URL`：你的外网可访问地址，例如 `https://your-domain.com/callback/wxwork`

3. 启动

```bash
npm run dev
```

4. 打开页面

- `http://localhost:3000`

## Demo 流程建议

1. 在“步骤1”填写初始化参数，依次点击“仅初始化 -> 设置回调 -> 获取二维码”
2. 手机扫码后如出现验证码，在“步骤2”填写 `uuid + qrcodeKey + 6位验证码` 提交
3. 登录成功后在“步骤3”调用发送文本、获取通讯录
4. 可开启“状态检测”，断开后自动重连（失败回退到二维码）

## 说明

- Demo 当前使用内存存储（重启后丢失）。
- `SetCallbackUrl` 参数兼容传了 `callbackUrl`、`callback_url`、`url` 三种键，便于适配接口实现差异。
