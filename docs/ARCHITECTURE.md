# FusionDigital 项目架构

## 1. 目标

FusionDigital 的软件目标不是提供一个万能聚变求解器，而是提供可持续维护的知识入口和数字孪生协作界面：

1. 把物理、工程、实验、控制、AI 与电厂系统工作放在统一信息架构中。
2. 把问题、装置、证据、论文、代码和局限连接起来。
3. 支持专家逐步将静态调研升级为数据服务、模型服务、影子孪生和受控决策流程。
4. 保持原始证据、结构化数据、网页呈现和报告之间的可追溯关系。

## 2. 技术栈

- React 19、Next.js 兼容接口与 vinext
- Vite / Cloudflare Worker 兼容构建
- TypeScript、CSS
- Node.js 原生测试运行器
- Python 标准库进行调研数据归一化和审计
- `python-docx` 生成 Word 技术报告
- 阿里云香港 ECS `i-j6c5xpt6lvn9fdpujlt7` 通过精品 EIP `47.75.119.239` 承载 `fusiondigital.club` / `www.fusiondigital.club` 生产域名入口
- OpenAI Sites 承载与香港正式 release 同 SHA 的平台协作版本，以及 SIWC / D1 能力
- D1 保存账户、角色、配额、审计、知识实体以及研究候选/审核控制面

站点当前已经启用 D1 和 Sign in with ChatGPT，并实现账户、角色、配额、审计、研究运行、候选提交与人工审核。R2 仍未启用；公开检索和图谱仍主要读取 Git 中生成的静态快照，尚未以 D1 知识表为统一读取源。大型 PDF、CAD、CAE、EFIT、诊断和仿真资产不应继续由 D1 或 Worker 请求路径承载。

面向 MDSplus、NAS、对象存储、CAD/CAE、仿真和控制的完整目标架构见 [整体技术路线图](PLATFORM_TECHNICAL_ROADMAP.md)。

## 3. 页面结构

```text
app/layout.tsx                 全站元数据与基础布局
app/page.tsx                   社区总览
app/physics/page.tsx           物理模拟与集成模拟
app/engineering/page.tsx       Tokamak 工程仿真
app/ai/page.tsx                智能原生专题
app/facilities/page.tsx        全球装置状态
app/platform/page.tsx          平台架构、统一合同与技术路线
app/components/                导航、页脚、品牌与动效
```

各专题使用独立 CSS，公共字体和基础规则在 `app/globals.css`。品牌文字通过公共组件统一生成，避免 FusionDigital 颜色和拼写分叉。

## 4. 数据层

当前数据分为三类：

### 4.1 页面维护数据

- `app/data.ts`
- `app/integrated-data.ts`
- `app/facilities/data.ts`
- `app/ai/aiResearch.ts`（生成文件）

### 4.2 公开下载数据

- `public/data/*.json`
- `public/data/*.csv`
- `public/fusion-ai-native-paper-code-index.csv`

### 4.3 研究源数据

- `research/ai-native/sources/*.json`
- `research/ai-native/sources/*_notes.md`

智能原生的 JSON 源数据是事实维护入口；网页 TypeScript、公开 JSON 和 CSV 均由脚本生成。物理、工程和装置模块仍有部分内容直接维护在 TypeScript 中，后续应逐步迁移到带 schema 的结构化数据。

## 5. 智能原生生成管线

`scripts/research/build_landscape.py` 完成：

1. 读取三组研究源数据。
2. 兼容不同历史 schema。
3. 标准化九个知识域与代码状态。
4. 通过 `projectId` 合并同一工作。
5. 保留主域、关联域、证据与部署元数据。
6. 生成网站 JSON、CSV 和 TypeScript 数据。

`scripts/research/audit_landscape.py` 检查：

- 必需字段和 ID 唯一性
- 九域合法性
- 主域/关联域一致性
- 论文与代码 URL 结构
- 商业软件访问属性
- 重复来源和已知失效链接
- 工作数、领域关联、来源数和代码链接数

Word 报告由 `build_ai_native_report.py` 从同一公开 JSON 生成，因此报告和网页共享规范化数据，但 Word 中的综合分析、章节正文和图版仍需要人工审核。

## 6. 双远端与生产发布

协作事实与公开发布采用以下固定拓扑：

```text
Codeup master（唯一协作事实源）
  └─ 同一完整 SHA → GitHub main（公开代码镜像）
                     ├─ 阿里云香港不可变 release
                     │    └─ fusiondigital.club / www → 47.75.119.239
                     └─ OpenAI Sites 平台 deployment（无生产域名绑定）
```

Codeup `master` 是人和 Codex 的唯一协作事实源，GitHub `main` 是同一提交的公开代码镜像。正式发布把经过门禁的同一完整提交 SHA 同时部署到阿里云香港 ECS 和固定 OpenAI Sites 项目；任一端未成功都不能宣布发布完成。Sites 的短期源仓库凭证不得长期保存或共享。

生产域名 `fusiondigital.club` 和 `www.fusiondigital.club` 的所有 DNS 线路只允许指向香港精品 EIP `47.75.119.239`。Sites 只使用平台分配地址，严禁把 apex 或 `www` 绑定、切换或“回滚”到 Sites；这不影响 Sites 平台环境继续提供 SIWC、D1 账户、配额、审计和人工审核能力。

## 7. 质量门

### 软件质量

- TypeScript / ESLint
- vinext 生产构建
- 五条路由的服务端渲染测试
- 下载文件和核心内容断言

### 科学质量

- 原始来源优先
- 证据与部署等级分离
- 适配装置和验证装置不混淆
- 对应代码、使能工具和社区复现分开标记
- 概念设计、仿真验证、离线装置数据和真实闭环不混为一谈

### 发布质量

- 发布包与已推送提交完全一致
- 香港站只切换到不可变 release，Sites 只部署官方平台归档且不绑定生产域名
- Codeup、GitHub、香港 release 与 Sites source 使用同一完整 SHA
- 应用回滚只切换香港 ECS 上经过验证的旧 release
- 公开文件不含敏感参数或凭证
- 报告下载与结构化数据均可访问

## 8. 未来演进

推荐按以下顺序推进：

1. 将物理、工程、装置数据也迁移为带 schema 的源数据和生成文件。
2. 增加 JSON Schema、字段级验证、外链定期检查和变更日志。
3. 将报告生成、图片压缩和链接审计纳入独立的内容流水线。
4. 将 D1 知识表确定为写入控制面，把静态 JSON 明确为版本化发布投影。
5. 建立 PostgreSQL + S3 对象存储的内网科学平台，并增加 MDSplus/NAS/PLM 只读适配器。
6. 对 DINA、MEQ、工程代理模型和实验数据服务建立统一 SimulationRun/ResultManifest 合约，而不是把研究条目直接当作运行模型。
7. 在影子模式、HIL、VVUQ 和权限治理成熟后，逐步形成数字孪生运行服务；实时控制与保护保持独立安全域。
