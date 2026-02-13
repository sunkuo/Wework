# Wework

企业微信协议 API 文档 + Node.js/MySQL 演示应用。

## 项目结构

```
├── apidocs/          # 企业微信协议 API 文档（234+ 篇 Markdown）
│   ├── 调用/         # 主动调用接口（初始化、登录、消息、群、联系人、客服等）
│   ├── 下发/         # 被动回调/推送（消息、群变动、登录、断开等）
│   └── 协议.md       # 协议版本历史（v1.0.1 ~ v1.0.7）
└── wxwork-demo/      # Express + MySQL 演示应用
    ├── src/          # 后端（Express + Node.js）
    └── public/       # 前端页面
```

## wxwork-demo

基于协议文档实现的可运行 Demo，支持：

- 扫码登录 / 自动登录 / 验证码校验
- 状态检测与自动重连
- 发送文本消息 / 获取通讯录
- 接收回调消息
- MySQL 持久化（sessions/events）

### 启动

```bash
cd wxwork-demo
npm install
cp .env.example .env   # 配置 CALLBACK_URL 和 MySQL 连接
npm run dev             # 访问 http://localhost:3000
```

详细说明见 [wxwork-demo/README.md](./wxwork-demo/README.md)。
