# 全站智能体操作：第一阶段使用与扩展说明

> 后续重构已将默认入口升级为「智能体任务」，采用真实模型原生工具调用与逐步页面反馈。当前使用说明见 [模型原生网站操作](AGENT_NATIVE_EXECUTION.md)。本文保留第一阶段运行时与「检索与快捷操作」的历史说明。

日期：2026-09-16。本文描述当前开发分支的实现，不代表已部署到生产环境。完整路线见 [全站原生智能体与 EXL-50U 对话漫游规划](AGENT_NATIVE_CAD_ROAMING_PLAN_2026-09-10.md)；本文以现有代码为准，区分已经接入的操作和后续能力。

第一阶段已把全站助手接入页面状态与浏览器执行器：可以通过对话打开页面、操作当前 CAD 显示、选择公开炮次和信号，并查看实际执行回执。EXL-50U 总装支持整体浏览；部件漫游、爆炸效果和自动导览仍有独立前置条件。

## 1. 使用入口

1. 打开网站的全站 AI 助手，在对话区选择 **操作网站**。
2. 输入明确指令，点击 **执行**。也可以点击预设指令。
3. 等待页面或模型就绪，查看逐项显示的“已完成 / 未执行 / 已停止”回执。
4. 使用界面的停止操作中断任务，或输入“撤销上一步”恢复最近一项可撤销操作。

CAD 工作区实际挂载在首页 `/#prototype-workspace`。`/digital-prototype` 是兼容入口，会重定向到该首页锚点；“打开数字样机”和打开 CAD 模型的运行时导航也映射到该入口。CAD 适配器注册与页面版本核验采用真实页面路径 `/`，不会等待一个没有挂载 CAD 的独立 `/digital-prototype` 页面。

“操作网站”与“问答与检索”是两个模式。运行中不能切换模式；收起助手后任务继续，关闭侧栏不等于停止。手动导航离开页面会取消当前操作序列，已经完成的步骤会保留。

以下指令可直接复制。先执行打开指令，待模型就绪后再提交后续显示指令；也支持示例中的“打开总装，然后切换视角”。

```text
打开数字样机
打开 EXL-50U 总装，然后切换到俯视图
打开 EXL-50U 简化模型
打开 ITER
打开 Paramak
读取当前页面
切换到正视
切换到等轴测
开启自动旋转
停止旋转
沿 Z 轴剖切偏移 0.25
关闭剖切
透明度设为30%
恢复不透明
重置模型
撤销上一步
打开聚变数据
搜索 EXL-50U
```

每行是一个独立请求，不要把整个代码块一次提交。英文也支持明确指令，例如 `Open digital prototype`、`Open fusion data`、`Search EXL-50U`、`Read current page`、`Please open EXL-50U full assembly and set view to top`、`Stop rotation`、`Reset`、`Undo`。

部件与数据选择必须使用当前页面公开目录中的真实名称或 ID。下面是语法模板，须先替换占位项；不能把测试用 ID 当作公开资产的实际 ID。

```text
选择部件 <当前公开部件ID或完整名称>
隐藏部件 <当前公开部件ID或完整名称>
隔离部件 <当前公开部件ID或完整名称>
选择炮次 <当前公开目录炮号>
选择信号 <当前炮次信号ID1>、<当前炮次信号ID2>
```

部件名称必须唯一匹配，不做模糊猜测。更换页面、模型或炮次后，应在下一轮根据新页面目录选择部件或信号；旧上下文里的 ID 不会继续沿用。当前状态读取只返回页面、模型就绪/视角或所选炮次/信号摘要，不是全文阅读器或完整目录导出。

“不要打开总装”“能否打开总装”“Do not open ITER”“Can you open ITER”等否定或疑问表达不会执行。询问能力时使用问答模式；明确的 `搜索“不要打开总装”` 只将引号内容作为站内查询。

## 2. 能力矩阵

| 范围 | 当前支持 | 边界 |
|---|---|---|
| 全站导航 | 打开固定的 15 个站内页面；打开公开 CAD 目录中的指定模型 | 不接受任意 URL；不代表已接入每个页面的内部控件 |
| 站内搜索 | 打开 `/search?q=...` 并显示检索结果 | 只做本站检索，不抓取外部网页 |
| 当前状态 | 读取页面、当前模型状态、当前炮次与所选信号摘要 | 不读取任意 DOM、私人消息或服务端资源 |
| EXL-50U 总装 | 打开总装、等轴测/正视/俯视、自动旋转开关、整体剖切、整体不透明度、重置 | 当前公开总装没有语义部件映射，不能选择、隔离或隐藏部件 |
| 具备公开部件映射的 CAD 模型 | 上述整体显示操作，以及选择、隐藏、隔离当前部件 | 只接受当前已加载目录的真实公开 ID；一次最多 32 个 |
| 聚变数据 | 选择公开目录炮次；选择当前炮次的 1–8 条不同信号，并聚焦第一条 | 基于已发布快照；保留各信号自身采样时间基，不写 MDSplus 或执行 TDI |
| 停止与撤销 | 串行操作停止；撤销最近一项支持撤销的本地操作 | 会话内局部状态，不是持久事务；已卸载页面的适配器不能盲目撤销 |
| 仿真等其他模块 | 页面导航与通用状态读取 | 尚不下发仿真计算、控制任务或其他服务端写操作 |
| 爆炸与漫游 | 当前无对应可执行动作 | 任意角度旋转、路径播放、视角书签、装配爆炸属于后续阶段 |

EXL-50U 总装的匿名可视化运输分片不能当作工程部件。显示剖切、不透明度与部件显隐只改变浏览器显示，不修改源几何、装配约束、工程尺寸或物理状态。

参数口径：

- 预设视角：`iso`、`front`、`top`。
- 剖切轴：`x`、`y`、`z`；偏移 `-0.9` 至 `0.9`，是显示参数，不是毫米位移。
- `opacity` 为不透明度，范围 `0.15` 至 `1`。“透明度30%”对应 `opacity=0.7`；“不透明度30%”对应 `0.3`。不支持完全透明。
- 一次计划最多 6 项动作；遇到第一项失败或取消即停止后续步骤，已完成步骤不自动回滚。

固定 CAD 标识：

| 名称 | deviceId |
|---|---|
| EXL-50U 总装 / 全装置 | `exl50u-general-assembly-20260630` |
| EXL-50U 12 系统简化模型 | `exl-50u-2026-upgrade` |
| ITER 教学模型 | `iter-educational-model` |
| Paramak 全装置 | `paramak-full-device` |
| EHL-2 初步设计 | `ehl-2-preliminary` |

导航路径由 `app/agent/site-actions.ts` 中的 `SITE_ROUTES` 维护：`/`、`/digital-prototype`、`/fusion-data`、`/simulations`、`/search`、`/knowledge-graph`、`/facilities`、`/physics`、`/engineering`、`/diagnostics`、`/control`、`/ai`、`/data-foundation`、`/platform`、`/roadmap`。

## 3. 本地规划与模型规划的真实边界

| 运行条件 | 规划方式 | 模型与身份访问 |
|---|---|---|
| `public-anonymous`，或显式选择 `retrieval` | 受限中英文规则解析；未识别时返回空计划和提示 | 在身份、账户凭据、配额和外部模型访问之前返回 |
| 认证环境，指令已被本地规则识别 | 同样使用受限规则解析 | 本轮无需外部模型 |
| 认证环境，未识别的指令进入模型规划分支 | 正常状态账户、供应商凭据和配额通过后，模型输出严格 JSON 计划，再做上下文校验 | 复用已有 `requestProviderAnswer` 与配额机制 |
| 存在执行回执的后续轮次 | 只解释客户端回执；始终返回空动作计划 | 匿名模式用确定性摘要；认证模型最多补充受限的下一步建议 |

界面所说的“本地规划”指不调用外部模型的确定性规划；请求仍通过本站 `/api/agent/turns` 处理，不代表离线浏览器模式。被本地规则判为否定、疑问、已知不支持或不符合当前能力的指令，不会转交模型绕过限制。

认证路径目前是 **服务端模型结构化规划**：一次生成计划，由浏览器执行后再提交回执解释。尚未实现供应商原生 function calling、多轮自主工具循环或后台持久任务。模型不直接操作 DOM、运行 JavaScript 或获得服务器写权限。客户端提交的状态和回执是显示数据，不是认证凭据或生产审计证明。

香港生产合同仍要求 `public-anonymous`。本阶段没有改变该模式，也没有通过前端配置启用匿名外部模型访问。若以后需要公网模型服务，需要独立设计服务端访问策略、额度、凭据隔离和相应发布合同变更。

## 4. 请求、执行与回执链路

```text
对话输入 + 当前页面快照
  → POST /api/agent/turns，mode="operate"
  → 本地规划 / 经认证的模型结构化规划
  → 动作结构、白名单、参数和快照校验
  → 验证后 SSE 返回 actionPlan
  → SiteActionRuntime 核对上下文版本并串行执行
  → 当前页面适配器等待选择或渲染完成，返回逐项回执
  → 提交 actionReceipts，生成结果解释，不再下发动作
```

请求包含 `question`、`actionContext`，可选 `actionReceipts`、`locale`、`history`、`provider` 与 `conversationId`。操作响应使用 `mode: "site-operation"`，包含 `actionPlan: { version: 1, actions: [...] }`、`answer` 和说明；该模式的 `citations`、`results` 为空。普通问答响应不能夹带操作计划。

快照包含 `path`、`pageInstanceId`、`revision`、`capabilities`，以及可选的 `viewer`、`data`。运行前核对页面实例与版本，状态已经变化则拒绝旧计划。CAD 与 FusionData 适配器执行时再次验证当前目标与就绪状态。CAD 仅注册当前选中的工作区视口，避免多模型同时响应。

回执状态为 `applied`、`rejected`、`cancelled`。服务端按客户端回执状态生成数量摘要；模型只能补充受限建议，不能自由改写成功数量。任何带非空回执的请求都返回空计划，即使请求同时重复原指令，也不会再次执行它。

主要预算为：问题最多 600 字符，规范化快照与回执合计最多 12,000 UTF-8 字节；模型 JSON 输出最多 8,000 字节，输出最多 1,600 tokens，并继续受既有配额约束。能力目录也有上限：最多 80 个公开部件、100 个炮次和当前炮次 100 个信号。上下文不传输整份 CAD、原始科学数据或完整页面内容。

执行器以 `runId` 在当前会话内去重，保存最近 30 份执行结果；最多保留 12 项撤销记录。刷新、断线后恢复和跨设备运行不在本阶段保证范围内。

## 5. 为新页面增加适配器

先明确该动作改变的是页面显示还是服务端资源。当前合同只覆盖公开、受限的页面操作；仿真提交、文件上传、工程编辑等写操作需要另行定义权限和执行服务，不能直接塞入本适配器。

1. **定义动作与上下文。** 在 `app/agent/site-actions.ts` 添加动作类型、严格字段校验、参数范围和必要快照字段；保持白名单，拒绝额外字段。增加上下文时同步规范化与大小限制。
2. **同步规划规则。** 在 `app/agent/site-action-planner.ts` 添加明确语法、上下文前置条件、当前对象 ID 校验；同步 `app/api/agent/operate.ts` 的 JSON schema 与模型指令。不要让模型能力超过浏览器实际注册的能力。
3. **挂载时注册。** 页面通过 `useSiteActionAdapter` 注册当前可用能力；`getContext()` 读取最新已提交状态，卸载时注销。已有模式可参考 CAD、FusionData 适配器。
4. **执行时重新核验。** 根据当前实际目录解析 ID，检查页面、模型、选择与就绪状态；不要信任规划时的旧列表。多个视口只让明确选中的目标注册同一种操作，或先扩展合同加入可验证的目标标识。
5. **等待完成再回执。** 响应 `AbortSignal`，等待数据选择和实际绘制完成后返回 `message`；可撤销操作保存前态并提供 `undo`。显示修改应保留实时相机姿态，除非动作本身就是切换视角或重置。
6. **补充有意义的验证。** 覆盖有效操作、未知 ID、过期上下文、缺失能力、取消、失败停止、重复执行与撤销；为真实浏览器检查准备明确的前后画面和回执验收条件。

当前适配器接口：

```ts
type SiteActionAdapter = {
  id: string;
  path: string;
  capabilities: SiteActionType[];
  getContext: () => Partial<Pick<SiteActionContext, 'viewer' | 'data'>>;
  execute: (
    action: SiteAction,
    options: { signal: AbortSignal },
  ) => Promise<{
    message: string;
    undo?: (signal: AbortSignal) => Promise<void>;
  }>;
};
```

代码入口：

| 职责 | 文件 |
|---|---|
| 动作、快照、回执合同 | `app/agent/site-actions.ts` |
| 本地解析与上下文验证 | `app/agent/site-action-planner.ts` |
| 认证规划与回执解释 | `app/api/agent/operate.ts` |
| 验证后 SSE 入口 | `app/api/agent/turns/route.ts`、`app/agent/sse.ts` |
| 浏览器运行时、停止与撤销 | `app/agent/site-action-runtime.ts` |
| 全站 Provider 与注册 Hook | `app/components/agent-workspace/SiteOperations.tsx` |
| 对话模式与执行结果 | `app/components/knowledge-chat/KnowledgeChat.tsx` |
| CAD 工作区目标与显示转换 | `app/digital-prototype/MultiDeviceWorkspace.tsx`、`app/components/device-viewer/cadSiteActionScope.tsx`、`app/components/device-viewer/cadSiteActions.ts`、`app/components/TokamakCadViewer.tsx` |
| 公开炮次与信号选择 | `app/fusion-data/FusionDataWorkspace.tsx`、`app/fusion-data/fusionDataSiteActions.ts` |
| 查询参数驱动搜索 | `app/search/SearchWorkspace.tsx` |

## 6. 后续扩展与验收记录

EXL-50U 总装的下一步应先发布经审核的公开语义部件 ID 与渲染实例映射，再实现部件聚焦和显隐。爆炸效果还需要独立定义每个公开部件的展开方向、距离、层级与恢复状态，不能按匿名分片任意平移。相机漫游则需要视点/路径合同、平滑过渡、暂停与人工接管；这些能力完成后再接入对话动作。

建议分开验证两条链路：总装验证打开、视角、旋转、剖切、透明度和恢复；具有公开部件映射的模型验证选择、隐藏、隔离和撤销。简化 EXL 模型的部件验收不能替代总装部件验收。

专项测试命令：

```sh
npm run test:agent-operations
```

该脚本覆盖 `tests/agent-operations.test.mts`、`tests/site-action-planner.test.mts`、`tests/site-action-runtime.test.mts`、`tests/cad-site-actions.test.mts`、`tests/fusion-data-site-actions.test.mts`，并已纳入 `npm test`，因此也进入 `npm run check`。完整检查命令仍为：

```sh
npm run check
```

2026-09-16 本地集成验收记录（开发工作区，未发布）：

| 验证层次 | 最新记录 |
|---|---|
| 专项测试与类型检查 | `npm run test:agent-operations` 48/48 通过；`tsc --noEmit --incremental false` 通过。另有会话语言切换回归纳入既有问答测试。 |
| `npm run check` 与构建 | 完整命令退出码 0，包含构建、资产合同、lint、渲染与各模块回归。Node 测试合计 746 项通过、5 项按条件跳过；Python 共 20 项，其中 4 项跳过。没有测试失败；lint 保留 warning，不能理解为零警告。 |
| 浏览器交互与 CAD 视觉检查 | 本机 Edge headless，公开匿名模式：21 条对话指令产生 23 个 applied 回执，运行异常 0；核对导航、含空格搜索、炮次 21103 → 20831、多信号与连续撤销，EXL 简化模型视角/透明度/自转/剖切/隐藏部件及撤销，EXL 总装打开与俯视。实际检查 SVG、控件状态和 WebGL 截图。 |
| 中断与语言切换 | 浏览器另外验证首个动作已完成后切换语言：旧语言保存终态和真实回执，新语言不混入旧消息；点击停止后迟到规划不导致跳页。 |
| 总装资产 | 从本机既有审核包通过官方 `assets:hydrate --source-dir` 导入 20 个分片，按当前 lock 校验，共 270,978,652 字节；未修改 manifest、资产哈希或公开部件语义。 |
| 认证模型真实调用 | 身份、配额、结构化模型输出及回执解释使用注入供应商测试验证；本轮未调用真实外部模型，未验证线上认证模型端到端交互。 |
| 部署与生产验收 | 未提交、推送或部署，未改生产模式、DNS、身份或托管合同。 |

本地证据保存在 Git 忽略的 `work/agent-qa/`：`verified-check.log`、`operations-verified.log`、`typecheck-verified.log`、`browser-verified.log`、`browser-lifecycle.log`，以及 `phase1-cad.png`、`phase1-data.png`、`phase1-assembly.png`。验收脚本使用已有 Edge 和独立临时浏览器目录，无须安装浏览器依赖。这些文件不是生产资产，不应随发布包上传。
