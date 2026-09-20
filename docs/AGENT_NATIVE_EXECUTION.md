# 模型原生网站操作

本次重构把全站助手的默认入口改为「智能体任务」。模型通过供应商原生工具调用选择动作，每次执行后接收新的页面观察与实际回执，再决定继续、修正或结束。新任务不经过固定句式解析，也不会在模型失败时自动切换成规则执行。

原有问答、站内检索和本地指令仍在「检索与快捷操作」中。生产公开匿名模式默认不开放模型网关；本机开发和认证工作区分别有独立的连接路径。

## 使用

打开右下角 AI 助手，选择「智能体任务」，确认可用供应商并点击「连接模型」。可以输入：

- 带我看 EXL-50U 总装，从顶部观察，再设为半透明。
- 进入聚变数据，查看可用炮次并切换到 21102。
- 打开站内检索，搜索 DINA，并阅读当前结果。
- 先看看当前页面，再告诉我你可以操作哪些内容。

任务面板显示当前模型、进度、每一步真实执行结果和模型最终说明。收起面板后运行继续；「停止任务」中断模型请求与页面执行；「撤销上一步」直接调用已有的局部撤销能力。已执行步骤不会因停止而自动回滚。你在助手以外点击、键入或滚动时，智能体会停止，交还页面控制。任务记录仅留在当前浏览器页面的内存，刷新不自动恢复或重放任务。

## 执行链路

```text
用户目标 + 当前页面观察
  → 原生工具调用模型
  → 校验单个工具、参数、目标和页面版本
  → 浏览器执行工具并记录回执
  → 重新观察当前页面
  → 工具结果送回同一模型任务
  → 下一项动作 / 结果说明 / 无法继续的具体原因
```

`POST /api/agent/native` 支持 start、continue、cancel。供应商原始轨迹和必要的推理连续性保留在服务端短期会话中，不由浏览器传回伪造的工具历史。每轮最多一个工具，一项任务最多 12 轮。页面变化、重复调用、超时、失效会话与不匹配的回执会被拒绝；同页异步加载导致的旧调用会作为未执行回执送回模型，使用新观察重新规划。网络失败不会自动重放页面操作。

主要实现：

- `app/api/ask/provider-tool-adapters.ts`：OpenAI Responses、Anthropic Messages、兼容 Chat Completions 的原生工具协议。
- `app/api/agent/native-runtime.ts`：模型选择、任务会话、工具目录、身份、额度与回执续轮。
- `app/agent/native-client.ts`：浏览器观察—执行—反馈循环。
- `app/components/agent-workspace/NativeAgent.tsx`：任务界面。
- `app/components/agent-workspace/page-surface.ts`：可见正文、控件发现和通用界面操作。
- `app/agent/site-action-runtime.ts`：CAD、数据和通用控件统一执行、取消、版本检查与撤销。

## 全站能力与接入规则

已知站内页面可以导航、读取当前视口内容、滚动并重新观察。模型能调用 CAD 视角、自转、剖切、透明度、已有语义部件选择，以及聚变数据炮次与信号工具。通用控件工具覆盖经显式标注的查询、筛选、切换和显示操作。

工具只接受观察中生成的控件 ID，不接受 CSS 选择器、任意脚本或外部 URL。新增页面可为经过审阅的纯显示控件添加 `data-agent-safe="click"`、`fill` 或 `select`，并提供可访问名称；搜索提交还需将表单标为 `data-agent-readonly="true"`。复杂状态优先注册语义适配器，避免通过控件模拟高层业务操作。

页面观察按 UTF-8 总字节限制在 26 KB 内。超长内容会缩减正文、选项和目录，并标记 `observationTruncated`；保留的控件 ID、选项值和当前选中 ID 不会被截短。模型看到的是当前可见范围的有限观察，不能将它当作完整数据目录。

这不是对所有 DOM 元素的无条件点击权限。账号与管理页、密码和凭据字段、外链、上传、删除、支付、后台计算提交等不在此次工具范围。EXL-50U 匿名总装运输分片仍不是语义部件；爆炸与任意角度旋转尚无执行工具，模型必须如实说明。

## 本机连接与认证工作区

本机开发采用 `build/local-agent-preview.ts` 的 Node 中间层：仅开发服务且显式设置 `FUSIONDIGITAL_LOCAL_AGENT=1` 时启用，并检查真实监听地址、连接地址、Host 和 Origin 都属于本机。启动时绑定 `127.0.0.1`，使用已有供应商环境变量（如 `OPENAI_API_KEY`、可选 `OPENAI_MODEL`）。不要把密钥写入源码、浏览器、本地存储或 `NEXT_PUBLIC_*` 变量。

中间层仅匹配 `/api/agent/native`。它不向 Cloudflare Worker 注入宿主环境，也不把模型密钥编译进客户端；`build` 和生产服务器不会注册此开发中间层。模型会收到当前任务与有限的公开页面观察。

认证工作区每轮重新检查正常账户与所选供应商，并使用现有数据库额度登记与结算。生产公开匿名站点仍保持 `standalone-public`、`modelGateway: false`，不会因主机存在密钥就开放模型访问。此重构未修改生产拓扑、DNS 或发布合同。

服务端任务目前使用有期限的进程内存。重启会中止任务；跨多个无粘性实例部署前，必须把会话迁移到绑定身份的共享存储或 Durable Object，并完成真实身份与配额链路验收。单元测试的注入模型不能替代真实供应商和浏览器联调。

## 验证

`npm run test:agent-native` 覆盖原生 provider 协议、会话/同源/匿名边界、过期上下文、重复工具、取消、DOM 控件约束和本机中间层；`npm run test:agent-operations` 保留既有 CAD/数据语义适配器回归。真实模型调用和浏览器验证结果写入主 checkout 的 ignored `work/local-ops/`，与仓库测试结果分别报告。

OpenAI 协议依据：[Function calling](https://developers.openai.com/api/docs/guides/function-calling)、[Reasoning](https://developers.openai.com/api/docs/guides/reasoning)。工具调用和结果按原生协议续传；`store: false` 模式使用服务器保留的 encrypted reasoning continuity。
