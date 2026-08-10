# FusionDigital

FusionDigital 是由新奥聚变人工智能团队维护的聚变数字孪生知识与协作平台。项目把聚变物理、工程仿真、集成控制、智能诊断、能量转化、辅机模拟、数据基座、人机交互、总体集成与智能原生工作组织为可检索、可引用、可持续更新的网站。

- 在线站点：[fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site](https://fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site)
- 开发团队：新奥聚变人工智能团队
- 联系人：tianshao1992@gmail.com

> 本项目是研究与工程规划知识库，不是装置保护系统、核安全分析结论或特定装置的实时控制软件。网页中的证据等级只描述公开材料直接证明到哪一步。

## 当前内容

| 模块 | 路由 | 主要内容 |
| --- | --- | --- |
| 总览 | `/` | FusionDigital 价值主张、十个知识模块、路线图 |
| 物理模拟 | `/physics` | 多尺度物理、代码图谱、集成模拟与数字孪生差距 |
| 工程仿真 | `/engineering` | 电磁、结构、热流体、中子、材料及实验验证链 |
| 智能原生 | `/ai` | 九域 AI 工作、论文、代码、装置与证据分级检索 |
| 全球装置 | `/facilities` | 装置建设与运行状态、原始来源链接 |

## 快速开始

要求 Node.js `>=22.13.0`。首次克隆后执行：

```bash
npm ci
npm run dev
```

常用命令：

```bash
npm run dev              # 本地开发
npm run build            # 生产构建
npm test                 # 构建并运行页面渲染测试
npm run lint             # 代码规范检查
npm run check            # lint + build + tests
npm run research:ai      # 重建智能原生 JSON、CSV 与 TypeScript 数据
npm run research:audit   # 审计智能原生条目、领域、论文和代码链接结构
npm run research:report  # 重新生成智能原生 Word 报告（需要 Python）
```

`dev`、`build` 与 `start` 命令不依赖 POSIX 环境变量写法，可在 Windows PowerShell、macOS 和 Linux 使用。

## Python 调研工具

数据审计和网站数据生成仅依赖 Python 3 标准库。生成 Word 报告还需要：

```bash
python -m pip install -r requirements-research.txt
```

如果 Python 不在默认 PATH，可设置 `PYTHON` 指向解释器。源数据位于 `research/ai-native/sources/`，生成脚本位于 `scripts/research/`。

智能原生数据链如下：

```text
research/ai-native/sources/*.json
        ↓ normalize + projectId 去重 + 九域关联
public/data/fusion-ai-native-landscape.json
app/ai/aiResearch.ts
public/fusion-ai-native-paper-code-index.csv
        ↓ audit
网页检索目录与 Word 报告
```

运行 `npm run research:ai` 后，应审查生成差异并提交源数据与生成文件，避免网页数据和研究底稿分叉。

## 与 Codex 协同开发

1. 在 Codex 中直接打开本目录作为项目根目录。
2. 让 Codex 先阅读 `CONTRIBUTING.md`、`docs/ARCHITECTURE.md` 和 `docs/CONTENT_MAINTENANCE.md`。
3. 每个主题使用独立 Git 分支；多人或多个 Codex 任务并行时，优先使用独立 worktree。
4. 终端脚本可以与 Codex 同时运行，但不要让两者同时写同一文件或同时重建同一份生成数据。
5. 所有变更通过 Pull Request 合并，由领域专家和软件维护者分别审核科学口径与实现质量。

推荐分支命名：

```text
content/physics-transport-update
content/facilities-2026q3
feature/ai-catalog-filter
fix/mobile-navigation
```

## 目录结构

```text
app/                         网站路由、组件、样式与页面数据
public/                      报告、图片、CSV/JSON 与下载资源
research/ai-native/sources/  智能原生调研源数据和研究说明
scripts/research/            数据生成、审计与 Word 报告脚本
tests/                       服务端渲染与关键内容断言
docs/                        架构、内容维护与协作说明
.github/                     CI 与 Pull Request 模板
.openai/hosting.json         Sites 项目标识和可选资源声明
```

详细说明见 [项目架构](docs/ARCHITECTURE.md)、[内容维护手册](docs/CONTENT_MAINTENANCE.md) 和 [贡献指南](CONTRIBUTING.md)。

## 托管与发布

生产站点由 OpenAI Sites 托管。源码的协作主仓库建议使用组织名下的私有 GitHub 仓库，`main` 只接收通过检查和审核的 Pull Request。Sites 内部远端用于生产发布，不应作为合作伙伴的唯一协作入口，也不要在 Git 配置、脚本或文档中保存短期发布凭证。

发布原则：

- 合并前运行 `npm run check`。
- 调研数据变更同时运行 `npm run research:ai`。
- 只部署已经推送并通过验证的同一提交。
- 报告、图片和公开数据不得包含装置敏感参数、访问令牌或未获授权资料。

## Collaboration in English

FusionDigital is a fusion digital-twin research atlas and collaboration portal maintained by the ENN Fusion AI Team. Clone the repository, run `npm ci` and `npm run dev`, work on a topic branch, and submit changes through pull requests. Scientific content and software implementation require separate review. See `CONTRIBUTING.md` and `docs/` before editing research data or generated artifacts.

## License and data rights

当前仓库尚未声明开源许可证。除非项目负责人另行确认，代码、报告、图像和调研数据均按团队协作资料管理；外部复用前应核对原始论文、第三方图片、商业软件和装置数据的许可条件。
