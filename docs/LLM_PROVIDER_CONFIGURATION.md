# 大模型供应商配置

知识检索对话统一通过服务端 `POST /api/ask` 调用模型。已登录用户可在 `/account#ai-models` 分别管理自己的 OpenAI、Anthropic、DeepSeek 和 Kimi API Key；浏览器仍不能提交任意模型地址、请求头或自定义上游 URL。每轮回答必须通过 FusionDigital 的检索、逐结论引用校验和配额账本，校验失败时自动回退到确定性检索。

## 1. 在哪里配置

### 本地开发

在仓库根目录复制示例文件：

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

`.env.local` 已被 Git 忽略。不要把真实密钥写入 `.env.example`、源码、浏览器 `localStorage`、截图、Issue 或聊天消息。

### Sites 预览环境

在当前 Sites 项目的 **Runtime environment variables** 中设置同名变量，并把所有
`*_API_KEY` 标记为 Secret。变量保存在 Sites，不写入 `.openai/hosting.json`。
环境变量更新后必须重新部署一个已保存版本，新的 environment revision 才会进入
Sites 预览运行时。

`fusiondigital.club` 的阿里云香港生产环境固定为 `public-anonymous`，不配置这些模型
密钥，也不开放账户、个人密钥、研究写入或审核 API。不得把 Sites 的 Secret、D1 或
身份配置复制到香港 ECS。

用户级密钥库还要求设置 `LLM_CREDENTIAL_KEK_V1`：它必须是 32 个随机字节的无填充 base64url 值，并标记为 Secret。该值只用于服务端 AES-256-GCM 加解密，不是任何模型供应商的 API Key。缺失或格式错误时，个人密钥保存与调用会关闭，系统不会降级为明文存储。

部署者可用以下命令生成一次：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 2. 可用变量

| 供应商 | 密钥变量 | 模型变量 | 当前默认模型 | 固定上游 |
| --- | --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-5.6-terra` | OpenAI Responses API |
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-sonnet-5` | Anthropic Messages API |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | `deepseek-v4-flash` | DeepSeek Chat Completions |
| Kimi / Moonshot | `MOONSHOT_API_KEY` | `MOONSHOT_MODEL` | `kimi-k3` | Moonshot Chat Completions |

其他变量：

- `LLM_DEFAULT_PROVIDER`：`openai`、`anthropic`、`deepseek` 或 `kimi`；仅当对应密钥存在时才成为默认项。
- `MOONSHOT_REGION`：`cn` 使用 `api.moonshot.cn`；`international` 使用 `api.moonshot.ai`。代码只允许这两个固定 HTTPS 端点。

模型变量为空时使用表中的代码默认值。修改模型 ID 后应先确认该模型已在对应账户、区域和 API 版本中开放。供应商模型清单会变化，默认值应随官方文档定期复核。

## 3. 示例

```dotenv
LLM_DEFAULT_PROVIDER=openai

OPENAI_API_KEY=在本机或Sites秘密变量中填写
OPENAI_MODEL=gpt-5.6-terra

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash

MOONSHOT_API_KEY=
MOONSHOT_MODEL=kimi-k3
MOONSHOT_REGION=cn
```

不要把上面占位文本替换后提交。站点级密钥是可选的公共回退；用户也可登录后进入账户中心保存自己的密钥与模型 ID。个人密钥优先于站点密钥，“仅检索”始终可用。

## 4. 安全边界

- 用户密钥由服务端使用 AES-256-GCM、随机 IV 和绑定用户/供应商的认证数据加密后写入 D1。密钥不会重新显示，也不会进入浏览器存储、日志、审计元数据或模型状态响应。
- 每条记录以内部 `user_id + provider` 隔离；管理 API 从登录身份取得用户 ID，不接受客户端提供的用户 ID。用户只能替换或删除自己的密钥。
- `GET /api/ask/providers` 与账户接口只公开供应商、模型、来源、配置状态和末尾提示，不公开密文、IV 或主加密密钥。
- 上游 URL 在代码中固定且禁止重定向，客户端不能覆盖，避免 SSRF 或把密钥发送到错误主机。
- 未登录、账户停用、配额/D1 不可用或供应商未配置时，不会调用外部模型。
- 上游响应必须是受大小限制的 JSON；错误正文和模型原始输出不会写入客户端或应用日志。
- Anthropic、DeepSeek 和 Kimi 的自由文本输出仍通过同一严格 JSON 结构与引用编号校验，不能绕过证据规则。
- 删除个人密钥后应用立即停止使用该记录；D1 Time Travel/备份中的历史副本会依托平台保留策略到期，不应对用户承诺即时物理擦除。

## 5. 用户自助管理

1. 使用 ChatGPT 身份登录站点并打开 `/account#ai-models`。
2. 在对应供应商卡片中输入 API Key、模型 ID；Kimi 还需选择中国区或国际区。
3. 保存成功后输入框立即清空，之后只显示“已保存”和末尾提示，旧密钥永不回填。
4. 可把一个已可用供应商设为账户默认；知识图谱对话的模型选择也会写入该用户的服务端偏好，不再依赖共享浏览器的 `localStorage`。
5. 删除个人密钥后，如果部署者配置了该供应商的站点级密钥，会明确回退为“站点提供”；否则回到“仅检索”。

## 6. 官方接口资料

- OpenAI Responses API: <https://developers.openai.com/api/reference/resources/responses/methods/create>
- Anthropic Messages API: <https://platform.claude.com/docs/en/api/messages/create>
- DeepSeek Chat Completions: <https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/>
- Kimi Chat API: <https://platform.kimi.com/docs/api/chat>
