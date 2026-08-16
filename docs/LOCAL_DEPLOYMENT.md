# FusionDigital 本地部署与复现手册

这份手册用于新同事从 Codeup 或 GitHub 全新克隆后，在 Windows、macOS 或 Linux 上复现当前网站。以下命令都应在仓库根目录执行；以 `package-lock.json` 为依赖事实基线，不使用全局安装的框架命令。公开运行时资产的完整清单、下载和授权边界见[运行时资产获取与校验](./ASSET_BOOTSTRAP.md)。

## 1. 能复现到什么程度

本地环境可以完整复现：

- 所有公开页面、站内确定性检索、知识图谱与数字样机；
- vinext + Vite + Cloudflare Worker 的开发和生产构建；
- 本地 D1 schema，以及账户、配额、知识实体、候选审核等数据库表；
- 配置密钥后的 OpenAI、Anthropic、DeepSeek 与 Kimi/Moonshot 调用链。

Git 克隆已经包含 Paramak、EXL-50U 浏览器模型、公开 EFIT 派生数据和其余网页下载资源。ITER 高清教育可视化的 18 个运行时 GLB 分片独立分发：联网部署可由 Worker 从审核过的 HTTPS 镜像按需获取；离线/自包含部署须先运行资产 hydration。两种模式使用同一个锁文件校验字节数和 SHA-256。

以下能力只在 OpenAI Sites 托管环境中成立，普通本地启动不会自动复现：

- Sign in with ChatGPT（SIWC）登录入口和平台注入的可信身份头；
- Sites 生产 D1、生产密钥及其访问策略；
- Sites 版本保存、公开发布和生产域名。

因此，未登录的本地环境仍能使用 `/search` 和 `/api/search`；`/api/ask` 会安全回退为带来源的确定性检索。即便本机配置了任一供应商密钥，当前实现也不会在缺少可信 SIWC 身份和配额账本时进行不计费的模型调用，这是预期的安全行为。

## 2. 前置条件

必需：

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Git | 2.40+ | 克隆和检查版本 |
| Node.js | `>=22.13.0` | CI 固定使用 `22.13.0`；推荐使用最新 Node 22 LTS |
| npm | 随 Node 22 提供 | 必须使用 `npm ci` |
| 内存 | 建议 8 GB+ | 构建包含较大的知识索引和三维资产 |
| 可用磁盘 | 建议 3 GB+ | 源码、约 400 MB 依赖、构建物、本地 D1 状态与可选 ITER hydration |

可选：

- Python 3.12：仅在重建研究数据、Word 报告或科学图时需要；浏览和构建网站不需要。
- Git LFS：当前恢复合同不依赖 LFS；不要在个人分支自行迁移历史。

先检查版本：

```bash
git --version
node --version
npm --version
```

如使用 `nvm`、`fnm` 或 Volta，请先切换到 Node 22。不要使用 Node 20 或更早版本。

## 3. 从 Codeup 或 GitHub 全新克隆

团队协作首选 Codeup SSH。先在个人 Codeup 账户登记本机 SSH **公钥**，然后执行：

```bash
git clone git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
cd FusionDigital
git rev-parse HEAD
npm ci
npm run assets:status
npm run assets:verify:tracked
```

需要从 GitHub 恢复时：

```bash
git clone https://github.com/tianshao1992/fusion-physics-atlas.git fusion-physics-atlas
cd fusion-physics-atlas
git rev-parse HEAD
npm ci
npm run assets:status
npm run assets:verify:tracked
```

复现负责人应记录 `git rev-parse HEAD` 的完整 40 位 SHA。`npm ci` 会严格安装锁文件版本，并在依赖与锁文件不一致时直接失败；不要用 `npm install` 悄悄改写 `package-lock.json`。

克隆会下载较大的公开报告、图片和适合 Git 分发的浏览器三维派生模型，仓库传输量明显高于普通前端项目。尤其不要删除以下资产后再判断网站“可运行”：

- `public/data/`：站内检索和知识图谱快照；
- `public/models/`：Paramak 与 EXL‑50U 浏览器模型，以及 ITER 运行时清单；
- `public/data/exl50u-efit/`、`public/data/exl50u-efit-v2/`：公开的 EFIT 标量、轮廓、拓扑派生物和分片；
- `public/figures/`：页面科学图；
- `public/*.pdf`、`public/*.docx`：公开报告下载。

如克隆中断，优先重新运行 `git fetch` / `git pull --ff-only`，并通过 `git status --short` 确认工作区干净。

### 3.1 补齐 ITER 18 个高清运行时分片

日常联网开发可让 Worker 使用默认外部镜像；需要验证全部公开内容、准备内网部署或断网运行时执行：

```bash
npm run assets:hydrate
npm run assets:verify
```

使用内网稳定 HTTPS 根地址：

```powershell
# Windows PowerShell
$env:FUSION_ASSET_BASE_URL = "https://download.example.internal/FusionDigital/iter-high-detail-v1"
npm run assets:hydrate
npm run assets:verify
```

```bash
# macOS / Linux
FUSION_ASSET_BASE_URL="https://download.example.internal/FusionDigital/iter-high-detail-v1" npm run assets:hydrate
npm run assets:verify
```

百度网盘文件应手工下载并解压，再从本地目录导入；不要把网盘分享页或临时 URL 当作自动下载地址：

```bash
npm run assets:hydrate -- --source-dir "/path/to/extracted/iter-high-detail-v1"
npm run assets:verify
```

脚本只接受 `assets/runtime-assets.lock.json` 声明的精确文件，并核对长度和 SHA-256。`public/models/iter-high-detail-v1/` 是被 Git 忽略的本机恢复目录。原始 EXL-50U / ITER CAD、STEP、B-Rep、PMI 和原始 EFIT/G-file/psi 网格不是这个资产包的一部分，也不得放入 Codeup、网盘或普通内网下载区。

## 4. 环境变量

网站不配置任何密钥也可以启动。需要试验服务端模型配置时：

### Windows PowerShell

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

### macOS / Linux

```bash
cp .env.example .env.local
${EDITOR:-vi} .env.local
```

可用变量：

| 变量 | 必需 | 作用 |
| --- | --- | --- |
| `LLM_DEFAULT_PROVIDER` | 否 | 默认供应商：`openai` / `anthropic` / `deepseek` / `kimi` |
| `LLM_CREDENTIAL_KEK_V1` | 用户级 API 管理必需 | 32-byte 无填充 base64url；必须作为 Secret，用于个人密钥 AES-256-GCM 加密 |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | 否 | OpenAI 服务端密钥及模型 |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | 否 | Anthropic 服务端密钥及模型 |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | 否 | DeepSeek 服务端密钥及模型 |
| `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` | 否 | Kimi/Moonshot 服务端密钥及模型 |
| `MOONSHOT_REGION` | 否 | `cn` 或 `international`；默认 `cn` |
| `ITER_HIGH_DETAIL_ASSET_BASE_URL` | 否 | ITER 18 片运行时镜像根地址；生产建议稳定 HTTPS，未设时使用审核过的默认源 |
| `PORT` | 否 | `npm run start` 的端口，默认 `3000` |

线上供应商密钥应在 Sites 的 Runtime environment variables 中设置为 Secret；不要写入 `.openai/hosting.json`。完整说明见 [大模型供应商配置](./LLM_PROVIDER_CONFIGURATION.md)。

`FUSION_ASSET_BASE_URL` 与 `FUSION_ASSET_SOURCE_DIR` 是运行 `assets:hydrate` 时的本机进程变量，不是网站运行时密钥；应按 3.1 节只在当前终端设置。`ITER_HIGH_DETAIL_ASSET_BASE_URL` 才是 Worker 运行时镜像配置，且不能包含账号、口令、query 或 hash。

安全规则：

- 真实密钥只放在被 Git 忽略的 `.env.local`，不要写入 `.env.example`、源码、截图、Issue、日志或命令历史。
- 不要使用 `NEXT_PUBLIC_`、`VITE_` 前缀保存服务端密钥，这些前缀可能进入浏览器产物。
- 怀疑密钥进入 Git 后，应先撤销/轮换，再处理历史；仅删除最新文件不够。

## 5. 三种本地运行方式

### 5.1 开发模式（推荐日常开发）

```bash
npm run dev
```

终端会打印实际 Local URL，通常是 `http://localhost:5173`。请以终端输出为准；如果默认端口被占用，Vite 会选择其他端口。保持该进程运行，代码改动将热更新。

### 5.2 生产构建与本地生产服务器

```bash
npm run build
npm run start
```

默认打开 `http://localhost:3000`。可显式指定端口：

```powershell
# Windows PowerShell
$env:PORT = "4173"
npm run start
```

```bash
# macOS / Linux
PORT=4173 npm run start
```

`npm run start` 服务的是最近一次 `npm run build` 生成的 `dist/`；修改源码后必须重新构建。该路径适合复现 SSR、路由、静态资源和 API，但不等同于 Sites 生产身份层。

### 5.3 本地 D1 初始化

开发服务器会在项目内 `.wrangler/state/` 保存 Miniflare/D1 状态。首次克隆后，在启动需要数据库的本地流程之前，执行：

```bash
npm run db:local:migrate
npm run db:local:verify
```

迁移命令使用已提交的 `wrangler.local.jsonc` 和 `drizzle/`，只操作本机 `.wrangler/state/`，不会连接生产数据库。它会建立 migration ledger，因而可重复运行。

如果本地 schema 需要完全重置，请先停止开发服务器，再删除项目内的 `.wrangler/state/`，然后重新执行上述两个命令。不要把 `.wrangler/` 提交到 Git；不要把本地命令改成 `--remote`。

> `npm run build` 会把 `.openai/hosting.json` 和 `drizzle/` 打入 `dist/.openai/`，供 Sites 发布流程使用。本地 D1 初始化与生产迁移是两个不同边界。

## 6. 完整验证流程

### 6.1 与 GitHub CI 相同的核心检查

```bash
npm run assets:verify:tracked
npm run check
```

该命令执行 ESLint、生产构建以及页面/三维资产发布策略测试。当前 CI 还会在 Ubuntu、Windows 和 macOS 上重建三套调研数据，再确认生成物没有漂移。

需要完全模拟 CI 时执行：

```bash
npm run research:ai
npm run research:control
npm run research:diagnostics
git diff --exit-code
npm run check
```

如果只是在复现已提交网站，不需要先重建研究数据；直接 `npm run check` 即可。研究脚本可能改写受版本控制的生成物，运行后必须检查 `git diff`。

### 6.2 启动后的人工验证清单

在开发或生产本地服务器运行时检查：

- [ ] `/` 能打开，导航中可见“知识图谱”。
- [ ] `/physics`、`/engineering`、`/control`、`/diagnostics` 能打开。
- [ ] `/search` 搜索 `EXL-50U` 能返回带来源记录。
- [ ] `/knowledge-graph` 能加载关系图和筛选器。
- [ ] `/digital-prototype#prototype-workspace` 能切换 Paramak、EXL‑50U 与 ITER；EXL‑50U 标准/高清模型能显示。
- [ ] 完整资产模式下，`npm run assets:verify` 通过，ITER 可加载 18 个高清分片并显示部件选择。
- [ ] 未配置密钥时，“询问 FusionDigital”显示确定性检索回退，而不是白屏或泄漏配置。
- [ ] `/account` 与 `/research-review` 在没有 Sites 身份时显示登录边界，而不是把客户端输入当作身份。

### 6.3 API 冒烟检查

服务器运行后，可在另一终端检查公开检索：

```powershell
# Windows PowerShell；按实际端口修改 URL
Invoke-RestMethod "http://localhost:5173/api/search?q=EXL-50U&limit=3"
```

```bash
# macOS / Linux；按实际端口修改 URL
curl -fsS "http://localhost:5173/api/search?q=EXL-50U&limit=3"
```

## 7. 数据库和 schema 维护

- `db/schema.ts` 是 Drizzle schema 源。
- `drizzle/*.sql` 是应随源码提交的迁移。
- `.openai/hosting.json` 声明 Sites 逻辑 D1 binding 名 `DB`，不包含真实生产数据库 ID 或凭证。
- `wrangler.local.jsonc` 只为本地迁移提供同名 binding 和占位 UUID，不得用于生产发布。

修改 schema 的标准流程：

```bash
# 修改 db/schema.ts 后
npm run db:generate

# 人工审阅新生成的 drizzle/*.sql，再在本地库验证
npm run db:local:migrate
npm run db:local:verify
npm run check
```

不要手工修改已经发布过的 migration；追加新 migration。生产 D1 的迁移由 Sites 保存/部署版本时按项目资源声明处理，本地复现者不需要也不应持有生产数据库凭证。

## 8. Python 调研工具（可选）

普通网站构建不依赖 Python。如果需要重新生成 Word 报告和科学图：

```bash
python -m venv .venv
```

激活环境：

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
source .venv/bin/activate
```

安装并运行：

```bash
python -m pip install -r requirements-research.txt
npm run research:report
npm run research:control:report
npm run research:diagnostics:report
```

如果 `python` 命令不可用，可在 PowerShell 使用 `py -3.12`，或把环境变量 `PYTHON` 指向解释器。报告生成还可能依赖本机字体和 Word/PDF 渲染条件，因此应对生成差异进行视觉审核。

## 9. 常见故障

### `npm ci` 报 Node 版本或原生包错误

确认 `node --version` 至少为 `v22.13.0`，删除当前 `node_modules` 后重新运行 `npm ci`。不要删除或重建锁文件来掩盖版本问题。

### Windows PowerShell 禁止执行 `npm.ps1`

在当前终端使用 `npm.cmd ci`、`npm.cmd run dev`，或由管理员按组织策略配置 PowerShell 执行策略；不要关闭整机安全策略。

### macOS 开发模式监听不到文件改动

仓库已在 Codex Seatbelt 环境启用轮询。普通终端若仍受文件系统/网络盘限制，先把仓库放到本地磁盘；必要时仅对当前会话设置 `CODEX_SANDBOX=seatbelt` 再启动，代价是更高的文件监听开销。

### 端口占用

以终端打印的 URL 为准，或给生产服务器设置 `PORT`。开发服务器一般会自动尝试下一个可用端口。

### D1 报 `binding DB is unavailable` 或 `no such table`

先运行 `npm run db:local:migrate`，再重启开发服务器。确认 `wrangler.local.jsonc`、`.openai/hosting.json` 中 binding 都是 `DB`，且没有把 `.wrangler/state/` 指到另一个目录。

### 本地登录跳转 404 或没有账户数据

SIWC 是 Sites 平台能力，不是本仓库自建的本地用户名密码系统。普通 localhost 应按“匿名只读检索”验证；不要通过手工伪造 `oai-authenticated-user-*` 请求头绕过身份边界。

### 已配置模型 Key 但仍返回检索结果

模型调用同时要求可信 SIWC 身份和可用的 D1 配额账本。普通本地匿名会话回退是设计行为，不表示 key 失效。禁止为了演示而移除这一授权门。

### 数字样机空白、加载慢或高清模型失败

- 先运行 `npm run assets:status` 和 `npm run assets:verify:tracked`，确认 Git 内资产完整；
- ITER 高清模式还要运行 `npm run assets:hydrate` 和 `npm run assets:verify`；如用内网镜像，根地址必须能直接拼接锁文件中的精确文件名，不能是登录页或网盘分享页；
- 使用支持 WebGL2 的当前版 Chrome、Edge、Firefox 或 Safari；
- 关闭会拦截本地大文件请求的浏览器插件；
- 低内存设备先切换“标准”精度；高清 EXL‑50U 文件约 13 MB，解压后的 GPU 占用远大于下载大小。

### Sites 构建包超过约 256 MiB

不要在已经 hydration 的工作区发布 Sites。把本机 `public/models/iter-high-detail-v1/` 移出仓库，或从干净克隆执行 `npm run assets:verify:tracked` 与构建；Sites 生产默认由 Worker 从外部镜像按需取得 ITER 18 片。不要通过删除 Git 已跟踪页面内容或进一步压缩模型来规避上限。

### Codeup SSH 连接失败

执行 `ssh -Tv git@codeup.aliyun.com`。在 SSH banner 前断开通常是网络出口阻断；`Permission denied (publickey)` 表示应检查个人 Codeup 账户登记的公钥。不要共用或上传私钥，也不要在没有审计远端历史时强制推送。更完整说明见[运行时资产获取与校验](./ASSET_BOOTSTRAP.md#6-codeup-ssh-协作)。

### `npm run build` 内存不足

关闭多余 Node/浏览器进程并保证 8 GB 以上可用内存。极端情况下可临时提高 Node heap，但不要把机器相关参数提交到脚本：

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=4096"
npm run build
```

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### 仓库显示大量换行差异

`.gitattributes` 已统一文本为 LF，并保留 Windows 脚本的 CRLF。确认 Git 没有用全局规则覆盖仓库属性；不要对二进制报告、图片、GLB 或 STEP 执行文本格式化。

## 10. 复现交付记录模板

明天复现时建议把下面内容附在 Issue、测试记录或交接单中：

```text
Repository URL:
Commit SHA:
OS / architecture:
Node / npm version:
Fresh clone: PASS / FAIL
npm ci: PASS / FAIL
assets:verify:tracked: PASS / FAIL
assets:hydrate: PASS / FAIL / intentionally skipped
assets:verify: PASS / FAIL / intentionally skipped
npm run db:local:migrate: PASS / FAIL
npm run db:local:verify: PASS / FAIL
npm run check: PASS / FAIL
npm run dev URL:
npm run build + npm run start: PASS / FAIL
Search / graph / Paramak / EXL-50U / EFIT / ITER smoke tests: PASS / FAIL
LLM provider keys configured: provider names only (never record values)
Known deviations:
```

复现通过的最低标准是：指定 SHA 可全新克隆、Git 内公开资产通过 `assets:verify:tracked`、需要完整/离线模式时 ITER 18 片通过 `assets:verify`、`npm ci` 和 `npm run check` 成功、开发与本地生产服务器均可打开、公开检索/图谱/数字样机通过冒烟检查，并且没有受控源 CAD、源 EFIT 或凭证混入工作区。
