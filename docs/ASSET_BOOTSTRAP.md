# FusionDigital 运行时资产获取与校验

本手册定义“同一提交在另一台机器上应看到同一网页内容”的资产合同。源码仓库保存网站代码、内容和适合 Git 分发的小型公开派生物；ITER 高清教育可视化与 EXL-50U 总装公开匿名派生采用独立外置资产包。所有外置文件都由 `assets/runtime-assets.lock.json` 锁定文件名、字节数和 SHA-256，下载或导入后必须通过校验，不能凭目录中“看起来有文件”判断复现成功。

## 1. 哪些内容随 Git，哪些需要补齐

| 内容 | 新克隆是否已有 | 分发方式 | 边界 |
| --- | --- | --- | --- |
| 网页源码、知识图谱、检索索引、报告、图片和公开下载文件 | 是 | Git | 以目标提交为准 |
| Paramak 浏览器 GLB、公开 STEP、清单与许可证 | 是 | Git | 仅按其随附许可证使用 |
| EXL-50U 2026 升级版标准/高清浏览器 GLB、清单与海报 | 是 | Git | 经审核的较小型非工程可视化派生物；不等于总装包 |
| EXL-50U 总装 manifest、公开说明、catalog 激活记录、Worker 白名单与摘要锁 | 是 | Git | 五项必须在同一应用提交中保持一致；不含总装 GLB |
| EXL-50U 总装 1 个 preview + 20 个 high 匿名 Meshopt GLB | 否 | 固定提交的 HTTPS 镜像，或从已审核目录导入 | 总量不超过 300 MiB；20 个 high 文件仅是运输分片，不表达 BOM、工程系统或源装配树 |
| EHL-2 初步设计约半面数 Meshopt GLB、清单与公开说明 | 是 | Git | 仅为用户授权的非工程浏览器派生物；不含五个源 GLB |
| EXL-50U EFIT v1/v2 标量、重采样轮廓、拓扑派生数据和分片 | 是 | Git | 不含原始 G-EQDSK、psi 网格或源实验档案 |
| ITER 高清教育可视化 18 个 Meshopt GLB 分片 | 否 | HTTPS 镜像下载，或从已下载目录导入 | 约 98.5 MB；只包含经审核的运行时派生物 |
| 原始 EXL-50U / EHL-2 / ITER CAD、STEP、B-Rep、PMI、尺寸标注、权威尺寸表、公差与装配元数据 | 否，且禁止补入 | 受控工程数据系统 | 不进入 Codeup、普通 Git、内网公开下载或百度网盘；公开可视几何可保留近似米制尺度，但不得作为测量或工程尺寸依据 |
| 原始 EFIT 档案、G-file、psi 网格和未脱敏实验数据 | 否，且禁止补入 | 受控实验数据系统 | 不进入 Codeup、普通 Git、内网公开下载或百度网盘 |

因此，“展示当前网页所有内容”是指复现当前获准公开的网页与运行时派生物，不是把源 CAD、源 EFIT 或其他受控工程资料复制到协作仓库。

## 2. 新机器完整恢复

要求 Git 2.40+、Node.js 22.13.0+ 和随 Node 提供的 npm。Codeup 使用团队成员自己的 SSH 公钥授权；不要复制他人的私钥。

```bash
git clone --branch master --single-branch git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
cd FusionDigital
git rev-parse HEAD
npm ci
npm run assets:status
npm run assets:verify:tracked
npm run assets:hydrate -- --bundle iter-high-detail-v1 --source-dir "/reviewed/iter-high-detail-v1"
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1 --source-dir "/reviewed/exl50u-general-assembly-v1"
npm run assets:verify
npm run db:local:migrate
npm run db:local:verify
npm run check
npm run dev
```

记录 `git rev-parse HEAD` 的完整 SHA。`assets:verify:tracked` 检查随 Git 交付的公开运行时树；`assets:hydrate` 只补齐锁文件声明的外置资产；`assets:verify` 再对两部分做完整校验。导入采用临时文件、长度和 SHA-256 校验后再替换最终文件，已正确存在的文件会被复用。

如果只进行不需要外置高清几何的页面开发，可以先执行 `assets:verify:tracked` 并启动网站；此时 ITER 高清与 EXL-50U 总装几何不可视为已复现。完整交付或离线/自包含部署必须补齐两个 bundle，再完成 `assets:hydrate` 与 `assets:verify`。

## 3. 从稳定 HTTPS 镜像获取

资产锁不保存默认网络源。ITER 18 文件与 EXL-50U 总装 21 文件上传到审核过的静态资产
仓库后，必须为每次恢复分别设置根地址。正式 Sites 双 bundle 必须固定到该资产仓库的同
一个 40 位完整提交 SHA：

### Windows PowerShell

```powershell
$AssetCommit = "<40位小写资产提交SHA>"
$env:FUSION_ASSET_BASE_URL = "https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/$AssetCommit/iter-high-detail-v1"
$env:FUSION_EXL50U_GA_ASSET_BASE_URL = "https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/$AssetCommit/exl50u-general-assembly-v1"
npm run assets:hydrate -- --bundle iter-high-detail-v1
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1
npm run assets:verify
Remove-Item Env:FUSION_ASSET_BASE_URL
Remove-Item Env:FUSION_EXL50U_GA_ASSET_BASE_URL
```

### macOS / Linux

```bash
ASSET_COMMIT="<40位小写资产提交SHA>"
FUSION_ASSET_BASE_URL="https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/${ASSET_COMMIT}/iter-high-detail-v1" \
FUSION_EXL50U_GA_ASSET_BASE_URL="https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/${ASSET_COMMIT}/exl50u-general-assembly-v1" \
npm run assets:hydrate -- --bundle iter-high-detail-v1
FUSION_ASSET_BASE_URL="https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/${ASSET_COMMIT}/iter-high-detail-v1" \
FUSION_EXL50U_GA_ASSET_BASE_URL="https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/${ASSET_COMMIT}/exl50u-general-assembly-v1" \
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1
npm run assets:verify
```

正式 Sites/HK 双端 evidence 使用的公开镜像根地址必须满足以下条件（开发机的离线恢复优先
使用 `--source-dir`）：

- 精确使用 `https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/<40位小写提交SHA>/<精确bundle-id>`；其他仓库、branch/tag、短 SHA、浏览器登录页、临时签名链接和网盘分享页不能作为根地址；
- 两个根地址后分别直接拼接锁文件中的 18 个 ITER 文件名和 21 个 EXL 文件名即可下载，服务端不得改名或在线重新压缩；
- 支持普通 `GET`，建议同时支持 `HEAD`、`Range`、正确的 `Content-Length` 和 `application/octet-stream` 或 `model/gltf-binary`；
- 对协作机器和部署网络可达，证书链由组织信任；不要用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 绕过证书校验；
- URL、仓库、脚本和日志中不包含账号、口令、Cookie、访问令牌或带凭证的查询参数。
- URL 不得包含 userinfo、query、fragment 或额外路径。Worker 使用 `redirect: manual`，
  任何 3xx、`Response.redirected=true` 或最终 URL 与固定 raw origin/repository/full-SHA/
  bundle/filename 不完全一致都失败。GitHub Releases 的常规 `302` 下载 URL、生产域名与
  `*.chatgpt.site` 都不能作为该镜像。

维护者更新镜像时应先从已通过 `assets:verify` 的目录生成上传区，再把文件原样上传：

```bash
npm run assets:stage -- --bundle iter-high-detail-v1 --output .runtime-assets/iter-upload-pack
npm run assets:stage -- --bundle exl50u-general-assembly-v1 --output .runtime-assets/exl-upload-pack
```

`assets:stage` 每次只处理一个 bundle。两个输出根都包含同一份
`runtime-assets.lock.json`，并分别包含 `iter-high-detail-v1/` 或
`exl50u-general-assembly-v1/` 子目录；汇入同一个资产仓库提交时保留 bundle 目录层级。

上传完成后，在一台没有缓存的机器上以新镜像地址执行 `assets:hydrate` 和 `assets:verify`。只有这次冷恢复通过后，才能通知同伴切换镜像。

## 4. 从百度网盘手工导入

百度网盘分享链接通常需要登录、提取码或客户端，并可能返回 HTML 页面而不是模型文件，不适合作为自动化下载根地址。推荐流程是：维护者上传由 `assets:stage` 生成的完整目录或压缩包；使用者在浏览器/客户端手工下载、解压，然后由脚本校验并合入项目。

```powershell
# Windows PowerShell 示例；两个目录分别含锁文件声明的精确文件名
npm run assets:hydrate -- --bundle iter-high-detail-v1 --source-dir "D:\Downloads\FusionDigital-iter-high-detail-v1"
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1 --source-dir "D:\Downloads\FusionDigital-exl50u-general-assembly-v1"
npm run assets:verify
```

```bash
# macOS / Linux 示例
npm run assets:hydrate -- --bundle iter-high-detail-v1 --source-dir "$HOME/Downloads/FusionDigital-iter-high-detail-v1"
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1 --source-dir "$HOME/Downloads/FusionDigital-exl50u-general-assembly-v1"
npm run assets:verify
```

不要把网盘 Cookie、提取码、个人账号或长期凭证写入仓库。若文件名、字节数或 SHA-256 不符，脚本应拒绝导入；应重新下载或让发布者重新上传，不要修改锁文件来迎合未知文件。

## 5. 两种部署模式

### Sites 预览模式（非生产）

OpenAI Sites 的静态发布包有约 256 MiB 上限。ITER 18 片与 EXL-50U 总装 1 preview + 20 high
都不进入 Git/Sites 静态归档。Sites Worker 只接受两个清单中的精确摘要路径，并从同一资产
提交的两个目录按需取回不可变文件。发布 Sites 预览时使用未 hydrate 的干净克隆，保持
`public/models/iter-high-detail-v1/` 中无 GLB、`public/models/exl50u-general-assembly-v1/`
中只有 Git 管理的 manifest/notice 而无 GLB，只运行：

```bash
npm ci
npm run assets:verify:tracked
npm run check
```

Sites 运行时镜像只能通过 `ITER_HIGH_DETAIL_ASSET_BASE_URL` 和
`EXL50U_GENERAL_ASSEMBLY_ASSET_BASE_URL` 显式设置，且必须精确为
`https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/<40位小写提交SHA>/<精确bundle-id>`；
两个变量的 `<40位小写提交SHA>` 必须完全相同。
代码中没有默认网络源；未设置且本地文件不存在时 Worker 返回 `503`。客户端不能传入
任意上游 URL；其他仓库、branch/tag/短 SHA、userinfo、query、fragment、额外路径、
任何 3xx/已重定向响应或最终 URL 漂移都会被拒绝。GitHub Releases 常规下载 URL不能使用。

### 阿里云香港生产 / 其他自包含模式

阿里云香港生产或需要断开公网仍能展示完整三维资产时，先在部署工作区分别 hydrate
ITER 与 EXL-50U 总装，再运行 `assets:verify` 和构建。香港生产必须本地包含并校验全部
18 个 ITER 分片与 21 个 EXL 文件；安装器在缺失或哈希不符时硬失败，运行时不得回源
GitHub 或其他外部镜像。
只有其他明确允许联网的 Worker 目标才能采用 local-first，并在本地不存在时回退到
受控外部镜像。下面示例是香港 `public-anonymous` 生产目标；实际打包、manifest 和
安装必须继续遵守
[香港部署手册](../deploy/aliyun-hk/README.md)，不能把普通 `npm run build` 产物直接
当作发布包。

```bash
npm ci
npm run assets:hydrate -- --bundle iter-high-detail-v1 --source-dir "/path/to/extracted/iter-high-detail-v1"
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1 --source-dir "/path/to/extracted/exl50u-general-assembly-v1"
npm run assets:verify
export NEXT_PUBLIC_FUSIONDIGITAL_MODE=public-anonymous
export FUSIONDIGITAL_BUILD_TARGET=aliyun-hk
npm run build
npm run start
```

`public/models/iter-high-detail-v1/*.glb`、`public/models/exl50u-general-assembly-v1/*.glb`
和 `.runtime-assets/` 是本机恢复/分发内容，不提交到应用 Git。香港打包系统必须显式保留
两个 GLB 目录；Sites 打包系统必须从干净工作区构建并删除两类本地缓存，避免突破静态包
上限。

## 6. Codeup SSH 协作

Codeup 仓库的标准 SSH 地址是：

```text
git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
```

第一次使用时，在本机生成独立 SSH 密钥并把**公钥**添加到个人 Codeup 账户；推荐 ED25519。私钥只保存在本机安全存储中，不发给同伴，不上传仓库或网盘。官方说明见 [Codeup 配置 SSH 密钥](https://help.aliyun.com/zh/yunxiao/user-guide/configure-ssh-key)。

```bash
ssh-keygen -t ed25519 -C "your-name@company"
ssh -T git@codeup.aliyun.com
git clone --branch master --single-branch git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
```

已有本地仓库需要增加 Codeup 镜像时，先只读检查目标历史：

```bash
git remote add codeup git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
git ls-remote --heads codeup
git fetch codeup
```

确认目标为空，或 `codeup/master` 与本地/GitHub 历史兼容后，再推送同一个已验证提交：

```bash
git push codeup HEAD:master
```

如果 Codeup 已有不相关历史，停止并由仓库管理员决定迁移/合并方案；不要直接 `--force`。日常双远端发布应在 `npm run check` 通过后，以同一个提交分别推送 GitHub 和 Codeup。

Codeup 支持 Git LFS，但当前恢复合同不依赖 LFS。不要在个人分支临时执行 `git lfs migrate`；该命令会重写历史，只有团队明确决定把某类资产迁入 Codeup LFS、完成容量和授权审查并安排全员重新同步时才能使用。参考 [Codeup Git LFS](https://help.aliyun.com/zh/yunxiao/user-guide/codeup-git-lfs-feature-introduction) 与 [LFS 迁移说明](https://help.aliyun.com/zh/yunxiao/user-guide/lfs-migration-guide)。

## 7. 发布者更新资产包

外置资产只能由获授权的维护者更新。一次更新应同时完成：

1. 从受控源生成新的**浏览器运行时派生物**，在受控环境完成几何、授权和非工程用途审查；原始 CAD/STEP、BOM、PMI 与源装配标签不得进入公开候选；
2. 把 ITER 18 文件与 EXL 21 文件原样发布到同一个资产仓库提交，并完成无缓存冷下载、字节数和 SHA-256 校验；
3. 对 EXL 总装先验证 exact v8 `derivationEvidence` 七键：`sourceInputCleaning`、sloppy
   `previewVisualLod`（`selectedTargetTriangleRatio = 0.03`、
   `simplifierNormalizedErrorLimit = 0.02`）、按 `selectedAttempt` 固定为 `0.70/0.65` 的 QEM `highQem`、两份独立 `outputCleaning`、`highPartition` 与
   `coverage` 必须互相闭合；canonical 10-view visual QA 必须达到 silhouette IoU >= 0.97、
   normalized depth p99 <= 0.02；high 聚合三角形必须达到
   `floor(0.98 * selectedTargetTriangleRatio * sourceInputCleaning.sanitizedTriangles)`，该下限不用于 sloppy preview。完整 visual report、QEM 收据、源 manifest、
   `geometryAccounting`、源路径/摘要和 definition/occurrence ID 留在仓库外，只把匿名计数和
   receipt SHA-256 投影到 DeviceManifest；随后投影 manifest/notice、激活 catalog、生成精确
   Worker 白名单并刷新 runtime lock，这五项必须位于同一个应用提交；
4. 在干净工作区运行 `assets:verify:tracked`，在同时 hydrate 两个 bundle 的完整工作区运行 `assets:verify`；
5. 分别用带 `--bundle` 的 `assets:stage` 生成两个自包含上传区；不得把两个外置 GLB 目录提交到应用 Git；
6. 在 Pull Request 中记录应用提交 SHA、资产提交 SHA、两个 bundle 的文件数/总字节数/哈希校验结果、镜像可达性和授权审核人。

锁文件更新表示公开运行时合同发生变化，不能仅因为下载文件与锁不一致就修改它。

## 8. 故障排查

### `assets:hydrate` 返回 404、403 或下载到 HTML

确认 `FUSION_ASSET_BASE_URL` 是直接文件根地址，不是仓库页面、网盘分享页或需交互登录的入口。用浏览器无痕窗口或 `curl -I` 检查“根地址/精确文件名”。如果镜像要求个人 Cookie，改用手工下载后 `--source-dir` 导入。

### 字节数或 SHA-256 不一致

该文件不是锁定版本，可能被截断、代理重写或发布者上传错误。保留错误信息并重新获取；不要关闭校验，不要手工把错误文件重命名为锁定文件，也不要把新哈希直接写入锁文件。

### 下载中断或留下临时文件

重新运行 `assets:hydrate`。正确文件会跳过，未完成文件会重新获取；只有验证成功的临时文件才会原子替换最终目标。不要把 `.partial` 或 `.runtime-assets/` 提交到 Git。

### `assets:verify:tracked` 失败

先执行 `git status --short` 和 `git rev-parse HEAD`，确认使用的是预期提交且没有误删/改写公开资产。若克隆传输中断，执行 `git fetch`、`git pull --ff-only` 后重试；仍失败时从同一提交全新克隆，不要用修改锁文件的方式掩盖损坏。

### 本地完整校验通过，但 ITER / EXL 外置几何仍加载失败

确认是在 hydration 后构建/启动，且自包含部署产物保留 ITER 18 文件与 EXL 21 文件。
检查反向代理是否允许 GLB、Range 请求和单文件不超过 24 MiB 的响应。公网镜像模式还要
确认部署环境能访问两个固定 SHA 根地址，而不只是开发电脑能访问。

### Sites 提示发布包过大

通常是把本机 hydration 目录带进了 Sites 构建。改用目标 SHA 的未 hydrate 干净 worktree，
确认 ITER 与 EXL 两类 GLB 都不进入归档，再运行 `assets:verify:tracked` 和构建。不要通过
降低模型质量或删除 Git 已跟踪的网页内容来规避上限。

### SSH 在认证前断开或超时

运行 `ssh -Tv git@codeup.aliyun.com` 判断是网络阻断还是密钥问题。若连接在 SSH banner 前关闭，应让网络管理员开放到 Codeup 的 SSH 通道；若显示 `Permission denied (publickey)`，检查 Codeup 账户中登记的是当前私钥对应的 `.pub` 公钥。不要改用共享私钥，也不要把私钥粘贴到聊天或 Issue。

### Codeup 推送大文件失败

普通命令行单文件与仓库容量受 Codeup 策略限制；当前 98.5 MB ITER 包按本手册放在外部镜像，不应临时塞进普通 Git。需要改变分发方式时先做团队级 LFS/对象存储设计和历史迁移评审，参考 [Codeup 推送限制](https://help.aliyun.com/zh/yunxiao/user-guide/push-restricted-issues) 与 [容量说明](https://help.aliyun.com/zh/yunxiao/user-guide/capacity-and-cleanup-instructions)。

## 9. 复现记录

交接或验收时记录：

```text
Repository URL:
Commit SHA:
Asset lock schema/version:
Asset source: explicit pinned HTTPS / internal HTTPS / manual source-dir
assets:verify:tracked: PASS / FAIL
assets:hydrate: PASS / FAIL / intentionally skipped
assets:verify: PASS / FAIL / intentionally skipped
Asset repository full commit SHA (shared by both Sites bundle URLs):
ITER 18-shard total bytes and verification result:
EXL-50U general assembly 1-preview + 20-high total bytes and verification result:
npm run check: PASS / FAIL
Deployment mode: Sites external / internal self-contained
Smoke test: Paramak / EXL-50U / EFIT / ITER high-detail / EHL-2 preliminary derivative
Known deviations:
```

验收“所有当前网页内容”的最低标准是：目标应用提交可克隆、Git 内公开资产通过校验、
ITER 18 分片与 EXL-50U 总装 21 文件在完整模式下都通过校验、Sites 两个根地址固定到同一
资产提交、构建与关键页面测试通过，并且没有任何受控源 CAD、源 EFIT、凭证或私密下载
地址进入应用仓库和公开分发包。
