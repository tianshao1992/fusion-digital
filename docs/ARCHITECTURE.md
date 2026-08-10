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
- OpenAI Sites 负责生产托管

站点当前没有业务数据库和用户写入功能；`.openai/hosting.json` 中 D1/R2 均为空。新增社区投稿、账号、评论或文件上传前，必须先设计鉴权、审核、数据保留和内容治理。

## 3. 页面结构

```text
app/layout.tsx                 全站元数据与基础布局
app/page.tsx                   社区总览
app/physics/page.tsx           物理模拟与集成模拟
app/engineering/page.tsx       Tokamak 工程仿真
app/ai/page.tsx                智能原生专题
app/facilities/page.tsx        全球装置状态
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

## 6. 双层仓库与发布

建议采用两类远端：

```text
GitHub 协作主仓库
  ├─ 分支、Issue、Pull Request、评审、CI
  └─ main：可发布的唯一协作基线
             ↓ 发布维护者同步
OpenAI Sites 内部源仓库
  └─ 与生产站点版本绑定，不保存长期协作凭证
             ↓
OpenAI Sites 生产站点
```

GitHub 是人和 Codex 的协作入口；Sites 内部仓库是生产发布通道。不要让合作伙伴直接共享短期 Sites 凭证，也不要让两个远端长期存在不同的 `main` 历史。

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
- 生产站点只部署已保存版本
- 公开文件不含敏感参数或凭证
- 报告下载与结构化数据均可访问

## 8. 未来演进

推荐按以下顺序推进：

1. 将物理、工程、装置数据也迁移为带 schema 的源数据和生成文件。
2. 增加 JSON Schema、字段级验证、外链定期检查和变更日志。
3. 将报告生成、图片压缩和链接审计纳入独立的内容流水线。
4. 增加专家身份、投稿暂存区和审核队列，再开放社区写入。
5. 对 DINA、MEQ、工程代理模型和实验数据服务建立 API 合约，而不是把研究条目直接当作运行模型。
6. 在影子模式、HIL、VVUQ 和权限治理成熟后，逐步形成数字孪生运行服务。
