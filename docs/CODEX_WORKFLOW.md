# 脚本、Codex 与多人并行开发

## 推荐模型

不要让所有人和所有自动化任务直接修改同一个工作目录。推荐以 Codeup `master` 为
唯一协作基线，每个开发者、脚本任务或 Codex 任务使用独立分支；GitHub `main` 仅
镜像同一个发布提交。真正并行时使用 Git worktree，并遵守根目录
[`AGENTS.md`](../AGENTS.md)。

```text
master
├─ content/facilities-update       专家 A + Codex
├─ feature/community-search        开发者 B
└─ research/engineering-surrogate  脚本批处理 + 专家 C
```

## 单人同时使用终端和 Codex

安全的并行方式：

- 终端运行只读命令、测试或本地开发服务器，Codex 修改源文件。
- Codex 完成修改后，终端运行生成脚本和检查。
- 长时间仿真或数据处理写入独立的临时/结果目录，不直接覆盖网页数据。

需要避免：

- Codex 与脚本同时写 `app/ai/aiResearch.ts`。
- 两个任务同时运行 `npm run research:ai`。
- 在未提交的同一文件上同时进行人工大改和自动格式化。
- 开发任务直接向阿里云香港生产环境部署临时分支，或把生产域名绑定到 Sites。

## 使用 worktree

先用 `git remote -v` 识别 Codeup 的实际远端别名（例如 `origin` 或 `codeup`），再从
它的 `master` 建立 worktree：

```powershell
$CodeupRemote = "origin" # 按 git remote -v 的事实修改
git fetch $CodeupRemote
git worktree add ../fusiondigital-facilities -b content/facilities-update "$CodeupRemote/master"
git worktree add ../fusiondigital-ai -b feature/ai-catalog "$CodeupRemote/master"
```

分别在两个目录中打开终端或 Codex。完成并合并后：

```bash
git worktree remove ../fusiondigital-facilities
git worktree prune
```

删除 worktree 前确认分支已经推送或不再需要，避免丢失未提交工作。

## 给 Codex 的任务上下文

建议每个任务说明：

1. 修改目标与不在范围内的内容。
2. 需要先读的文档和数据文件。
3. 科学来源与不可推断的边界。
4. 允许修改的目录。
5. 必须运行的测试或生成脚本。
6. 是否允许提交、推送、创建 Pull Request 或发布。

示例：

```text
请更新 /facilities 中 EXL-50U 的公开建设状态。
先阅读 CONTRIBUTING.md 与 docs/CONTENT_MAINTENANCE.md；
只使用装置官网和原始论文，不推断未公开参数；
修改 app/facilities，补渲染测试；运行 npm run check；
提交到 content/exl50u-update，但不要发布生产站点。
```

## Pull Request 中的人机分工

- Codex：数据结构检查、链接清单、重复项、页面实现、测试和变更摘要。
- 领域专家：物理含义、装置适用性、证据等级和关键限制。
- 软件审核人：类型、交互、可访问性、性能和回归风险。
- 发布维护者：合并提交、Codeup/GitHub SHA、阿里云香港 release、DNS/TLS 与国内
  三网生产验收。Sites 只管理独立平台预览 URL。

AI 生成的科学文字、图注和证据分级必须由人类专家承担最终审核责任。
