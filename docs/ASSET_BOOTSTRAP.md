# FusionDigital 运行时资产获取与校验

本手册定义“同一提交在另一台机器上应看到同一网页内容”的资产合同。源码仓库保存网站代码、内容和适合 Git 分发的公开派生物；体积较大的 ITER 高清教育可视化采用独立资产包。所有外置文件都由 `assets/runtime-assets.lock.json` 锁定文件名、字节数和 SHA-256，下载或导入后必须通过校验，不能凭目录中“看起来有文件”判断复现成功。

## 1. 哪些内容随 Git，哪些需要补齐

| 内容 | 新克隆是否已有 | 分发方式 | 边界 |
| --- | --- | --- | --- |
| 网页源码、知识图谱、检索索引、报告、图片和公开下载文件 | 是 | Git | 以目标提交为准 |
| Paramak 浏览器 GLB、公开 STEP、清单与许可证 | 是 | Git | 仅按其随附许可证使用 |
| EXL-50U 标准/高清浏览器 GLB、海报和转台帧 | 是 | Git | 仅为经审核的非工程可视化派生物 |
| EXL-50U EFIT v1/v2 标量、重采样轮廓、拓扑派生数据和分片 | 是 | Git | 不含原始 G-EQDSK、psi 网格或源实验档案 |
| ITER 高清教育可视化 18 个 Meshopt GLB 分片 | 否 | HTTPS 镜像下载，或从已下载目录导入 | 约 98.5 MB；只包含经审核的运行时派生物 |
| 原始 EXL-50U / ITER CAD、STEP、B-Rep、PMI、尺寸、公差与装配元数据 | 否，且禁止补入 | 受控工程数据系统 | 不进入 Codeup、普通 Git、内网公开下载或百度网盘 |
| 原始 EFIT 档案、G-file、psi 网格和未脱敏实验数据 | 否，且禁止补入 | 受控实验数据系统 | 不进入 Codeup、普通 Git、内网公开下载或百度网盘 |

因此，“展示当前网页所有内容”是指复现当前获准公开的网页与运行时派生物，不是把源 CAD、源 EFIT 或其他受控工程资料复制到协作仓库。

## 2. 新机器完整恢复

要求 Git 2.40+、Node.js 22.13.0+ 和随 Node 提供的 npm。Codeup 使用团队成员自己的 SSH 公钥授权；不要复制他人的私钥。

```bash
git clone git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
cd FusionDigital
git rev-parse HEAD
npm ci
npm run assets:status
npm run assets:verify:tracked
npm run assets:hydrate
npm run assets:verify
npm run db:local:migrate
npm run db:local:verify
npm run check
npm run dev
```

记录 `git rev-parse HEAD` 的完整 SHA。`assets:verify:tracked` 检查随 Git 交付的公开运行时树；`assets:hydrate` 只补齐锁文件声明的外置资产；`assets:verify` 再对两部分做完整校验。导入采用临时文件、长度和 SHA-256 校验后再替换最终文件，已正确存在的文件会被复用。

如果只进行不需要 ITER 高清模式的页面开发，可以先执行 `assets:verify:tracked` 并启动网站；完整交付或离线部署必须继续完成 `assets:hydrate` 与 `assets:verify`。

## 3. 从稳定 HTTPS 镜像获取

默认下载源写在资产锁文件中。团队把同一份 18 文件包上传到内网对象存储后，可为一次恢复覆盖下载根地址：

### Windows PowerShell

```powershell
$env:FUSION_ASSET_BASE_URL = "https://download.example.internal/FusionDigital/iter-high-detail-v1"
npm run assets:hydrate
npm run assets:verify
Remove-Item Env:FUSION_ASSET_BASE_URL
```

### macOS / Linux

```bash
FUSION_ASSET_BASE_URL="https://download.example.internal/FusionDigital/iter-high-detail-v1" npm run assets:hydrate
npm run assets:verify
```

镜像根地址必须满足以下条件：

- 使用稳定的 `https://` 地址；浏览器登录页、临时签名链接和网盘分享页不能作为根地址；
- 根地址后直接拼接锁文件中的 18 个精确文件名即可下载，服务端不得改名或在线重新压缩；
- 支持普通 `GET`，建议同时支持 `HEAD`、`Range`、正确的 `Content-Length` 和 `application/octet-stream` 或 `model/gltf-binary`；
- 对协作机器和部署网络可达，证书链由组织信任；不要用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 绕过证书校验；
- URL、仓库、脚本和日志中不包含账号、口令、Cookie、访问令牌或带凭证的查询参数。

维护者更新镜像时应先从已通过 `assets:verify` 的目录生成上传区，再把文件原样上传：

```bash
npm run assets:stage -- --output .runtime-assets/upload-pack
```

输出根目录包含 `runtime-assets.lock.json` 和 `iter-high-detail-v1/` 子目录；上传或压缩时保留这层结构。

上传完成后，在一台没有缓存的机器上以新镜像地址执行 `assets:hydrate` 和 `assets:verify`。只有这次冷恢复通过后，才能通知同伴切换镜像。

## 4. 从百度网盘手工导入

百度网盘分享链接通常需要登录、提取码或客户端，并可能返回 HTML 页面而不是模型文件，不适合作为自动化下载根地址。推荐流程是：维护者上传由 `assets:stage` 生成的完整目录或压缩包；使用者在浏览器/客户端手工下载、解压，然后由脚本校验并合入项目。

```powershell
# Windows PowerShell 示例；目录中应能找到锁文件声明的 18 个精确文件名
npm run assets:hydrate -- --source-dir "D:\Downloads\FusionDigital-iter-high-detail-v1"
npm run assets:verify
```

```bash
# macOS / Linux 示例
npm run assets:hydrate -- --source-dir "$HOME/Downloads/FusionDigital-iter-high-detail-v1"
npm run assets:verify
```

不要把网盘 Cookie、提取码、个人账号或长期凭证写入仓库。若文件名、字节数或 SHA-256 不符，脚本应拒绝导入；应重新下载或让发布者重新上传，不要修改锁文件来迎合未知文件。

## 5. 两种部署模式

### Sites / 公网默认模式

OpenAI Sites 的静态发布包有约 256 MiB 上限。ITER 18 片不进入默认 Git/Sites 静态归档；生产 Worker 只接受清单中的精确同源路径，并从受控外部镜像取回不可变文件。发布 Sites 时使用干净克隆，保持 `public/models/iter-high-detail-v1/` 不存在，只运行：

```bash
npm ci
npm run assets:verify:tracked
npm run check
```

运行时镜像可通过部署环境变量 `ITER_HIGH_DETAIL_ASSET_BASE_URL` 指向团队内可访问的稳定 HTTPS 根地址。未设置时使用代码中审核过的默认发布源。变量只配置根地址，客户端不能传入任意上游 URL。

### 内网 / 自包含模式

需要断开公网仍能展示 ITER 高清模型时，先在部署工作区运行 `assets:hydrate` 和 `assets:verify`，再构建。Worker 对 18 个精确路径采用 local-first：本地校验通过的分片优先；本地不存在时才回退到外部镜像。

```bash
npm ci
npm run assets:hydrate -- --source-dir "/path/to/extracted/iter-high-detail-v1"
npm run assets:verify
npm run build
npm run start
```

`public/models/iter-high-detail-v1/` 和 `.runtime-assets/` 是本机恢复/分发目录，不提交到 Git。内网打包系统必须显式保留该目录；Sites 打包系统则必须从干净工作区构建，避免突破静态包上限。

## 6. Codeup SSH 协作

Codeup 仓库的标准 SSH 地址是：

```text
git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
```

第一次使用时，在本机生成独立 SSH 密钥并把**公钥**添加到个人 Codeup 账户；推荐 ED25519。私钥只保存在本机安全存储中，不发给同伴，不上传仓库或网盘。官方说明见 [Codeup 配置 SSH 密钥](https://help.aliyun.com/zh/yunxiao/user-guide/configure-ssh-key)。

```bash
ssh-keygen -t ed25519 -C "your-name@company"
ssh -T git@codeup.aliyun.com
git clone git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
```

已有本地仓库需要增加 Codeup 镜像时，先只读检查目标历史：

```bash
git remote add codeup git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git
git ls-remote --heads codeup
git fetch codeup
```

确认目标为空，或 `codeup/main` 与本地/GitHub 历史兼容后，再推送同一个已验证提交：

```bash
git push codeup main
```

如果 Codeup 已有不相关历史，停止并由仓库管理员决定迁移/合并方案；不要直接 `--force`。日常双远端发布应在 `npm run check` 通过后，以同一个提交分别推送 GitHub 和 Codeup。

Codeup 支持 Git LFS，但当前恢复合同不依赖 LFS。不要在个人分支临时执行 `git lfs migrate`；该命令会重写历史，只有团队明确决定把某类资产迁入 Codeup LFS、完成容量和授权审查并安排全员重新同步时才能使用。参考 [Codeup Git LFS](https://help.aliyun.com/zh/yunxiao/user-guide/codeup-git-lfs-feature-introduction) 与 [LFS 迁移说明](https://help.aliyun.com/zh/yunxiao/user-guide/lfs-migration-guide)。

## 7. 发布者更新资产包

外置资产只能由获授权的维护者更新。一次更新应同时完成：

1. 从受控源生成新的**浏览器运行时派生物**，在受控环境完成几何、授权和非工程用途审查；
2. 更新网站模型清单和 `assets/runtime-assets.lock.json`，保持 18 个稳定部件身份、精确文件名、字节数和 SHA-256 一致；
3. 在干净工作区运行 `assets:verify:tracked`，在完整工作区运行 `assets:verify`；
4. 用 `assets:stage` 生成上传区，原样上传到内网对象存储或网盘包；
5. 从另一个空目录做一次冷下载/导入验证；
6. 提交代码与锁文件，不提交恢复出来的 18 个 GLB，也不提交任何源 CAD/源 EFIT；
7. 在 Pull Request 中记录资产包版本、总字节数、哈希校验结果、镜像可达性和授权审核人。

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

### 本地完整校验通过，但 ITER 高清仍加载失败

确认是在 hydration 后构建/启动，且部署产物保留 `public/models/iter-high-detail-v1/`。检查反向代理是否允许 GLB、Range 请求和约 20 MiB 的单文件响应。公网镜像模式还要确认部署环境能访问镜像，而不只是开发电脑能访问。

### Sites 提示发布包过大

通常是把本机 hydration 目录带进了 Sites 构建。把 `public/models/iter-high-detail-v1/` 移到仓库外或改用干净克隆，再运行 `assets:verify:tracked` 和构建。不要通过降低模型质量或删除 Git 已跟踪的网页内容来规避上限。

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
Asset source: default HTTPS / internal HTTPS / manual source-dir
assets:verify:tracked: PASS / FAIL
assets:hydrate: PASS / FAIL / intentionally skipped
assets:verify: PASS / FAIL / intentionally skipped
ITER 18-shard total bytes and verification result:
npm run check: PASS / FAIL
Deployment mode: Sites external / internal self-contained
Smoke test: Paramak / EXL-50U / EFIT / ITER high-detail
Known deviations:
```

验收“所有当前网页内容”的最低标准是：目标提交可克隆、Git 内公开资产通过校验、ITER 18 分片在需要完整模式时通过校验、构建与关键页面测试通过，并且没有任何受控源 CAD、源 EFIT、凭证或私密下载地址进入仓库和分发包。
