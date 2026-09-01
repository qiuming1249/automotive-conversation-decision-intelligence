# 汽车销售会话决策智能系统

面向汽车销售接待场景的可追溯会话决策智能系统。系统接收录音或 ASR 转写文本，事实层只调用一次大模型抽取结构化事实，诊断、客户洞察、策略、生成与反馈层依据可配置规则运行。

核心链路：`录音/转写 -> 事实抽取 -> SOP质检与客户洞察 -> 诊断 -> 策略 -> 生成 -> 反馈复检`。

## 本地启动

```bash
npm install
cp .env.example .env
npm run dev
```

前端默认地址：`http://localhost:5173/`
后端默认地址：`http://127.0.0.1:8787/`

## 密钥配置

所有云服务密钥只允许写入服务端 `.env` 或部署平台的 Secret/Environment Variables：

- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`
- `ALIYUN_NLS_APP_KEY`
- `LLM_API_KEY`
- `MANAGER_WECHAT_WEBHOOK`

页面不会读取、接收或回显以上内容。不要把密钥写入 React 源码、`VITE_*` 环境变量、配置 JSON、截图或示例数据。

GitHub 上传前运行：

```bash
npm run security:check
npm run build
```

## GitHub 上传注意事项

- 只提交源码和 `.env.example`，不要提交 `.env`。
- `data/`、`uploads/`、`outputs/`、录音及客户原始文档默认被忽略。
- 如果密钥曾经进入 Git 提交历史，应立即在云平台轮换密钥；仅删除当前文件不足以消除历史泄露。
- 部署时通过 GitHub Actions Secrets、云平台 Secret Manager 或服务端环境变量注入密钥。

## 数据边界

质检扣分、重要客户画像、高风险问题和成交/败单结果应保留原文证据与人工复核入口。不要把测试数据或模型候选结论作为真实业务结果对外发布。
