# 大模型供应商配置

知识检索对话统一通过服务端 `POST /api/ask` 调用模型。浏览器只能选择经过允许的供应商；不能提交 API Key、任意模型地址、请求头或自定义上游 URL。每轮回答仍必须通过 FusionDigital 的检索、逐结论引用校验和配额账本，校验失败时自动回退到确定性检索。

## 1. 在哪里配置

### 本地开发

在仓库根目录复制示例文件：

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

`.env.local` 已被 Git 忽略。不要把真实密钥写入 `.env.example`、源码、浏览器 `localStorage`、截图、Issue 或聊天消息。

### 线上 Sites

在当前 Sites 项目的 **Runtime environment variables** 中设置同名变量，并把所有 `*_API_KEY` 标记为 Secret。变量保存在 Sites，不写入 `.openai/hosting.json`。环境变量更新后必须重新部署一个已保存版本，新的 environment revision 才会进入生产运行时。

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

不要把上面占位文本替换后提交。线上设置完成后，打开知识图谱页；“模型服务”下拉框会把已配置供应商启用，并显示服务端批准的模型 ID。未配置项保持禁用，“仅检索”始终可用。

## 4. 安全边界

- API Key 只由服务端读取；`GET /api/ask/providers` 只公开供应商 ID、显示名、模型 ID 和是否可用。
- 上游 URL 在代码中固定且禁止重定向，客户端不能覆盖，避免 SSRF 或把密钥发送到错误主机。
- 未登录、账户停用、配额/D1 不可用或供应商未配置时，不会调用外部模型。
- 上游响应必须是受大小限制的 JSON；错误正文和模型原始输出不会写入客户端或应用日志。
- Anthropic、DeepSeek 和 Kimi 的自由文本输出仍通过同一严格 JSON 结构与引用编号校验，不能绕过证据规则。
- 当前不支持用户自行上传密钥（BYOK）。未来如需每用户密钥，必须使用独立加密密钥库、RBAC、轮换和审计，不能用浏览器存储或明文 D1 字段。

## 5. 官方接口资料

- OpenAI Responses API: <https://developers.openai.com/api/reference/resources/responses/methods/create>
- Anthropic Messages API: <https://platform.claude.com/docs/en/api/messages/create>
- DeepSeek Chat Completions: <https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/>
- Kimi Chat API: <https://platform.kimi.com/docs/api/chat>
