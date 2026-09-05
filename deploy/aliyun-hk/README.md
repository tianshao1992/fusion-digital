# FusionDigital 阿里云香港公开匿名版部署

本目录用于把 FusionDigital 以**公开匿名、只读镜像**部署到 Ubuntu 24.04
阿里云香港 ECS `i-j6c5xpt6lvn9fdpujlt7`，公网入口为 100 Mbps `BGP_PRO` 精品 EIP
`47.75.119.239`。这是 `fusiondigital.club` 的**唯一生产部署方式**，正式入口支持：

- `https://fusiondigital.club/`
- `https://www.fusiondigital.club/`

此方案不迁移 OpenAI Sites 的 D1、SIWC 身份或个人模型密钥能力。账户 API、
研究候选写入/审核 API、ChatGPT 登录与回调入口在 Nginx 层直接返回 404；所有
进入 Node 的请求都会清除四个 `oai-authenticated-user-*` 身份头。公开问答固定
使用站内确定性检索，不调用外部模型。

访问统计是唯一的本机 sidecar 例外：Nginx 限流后只把 4 KiB JSON body、Origin 与
Content-Type 交给 `127.0.0.1:3101` 的专用 collector，并关闭该 location 的 access log。
collector 严格校验后在内存中对 event/visitor/session 标识做 HMAC，只有脱敏结果能写入
短期 JSONL journal 与本机 SQLite；请求绝不进入香港应用 Node、D1 或认证代码。Sites
只在管理员鉴权后经双向 HMAC 精确端点读取聚合报表，公开页面不回源 Sites。详见
[`docs/ANALYTICS.md`](../../docs/ANALYTICS.md)。

OpenAI Sites 只使用平台分配的 `*.chatgpt.site` 同步协作地址，不得绑定上述两个生产
名称；正式发布时其 source SHA 必须与香港 active release 一致。`.openai/hosting.json`
不是生产托管声明。所有机器和 Codex 在操作前
还必须遵守根目录 [`AGENTS.md`](../../AGENTS.md) 与
[`docs/RELEASE.md`](../../docs/RELEASE.md)。

## 0. 生产不变量

- Codeup `master`、GitHub `main`、构建提交、服务器 release 与 Sites source 必须是
  同一个完整 SHA；先同步和校验 Git，再构建、上传。
- 发布包必须在干净的 detached worktree 中以 `public-anonymous` 模式构建，通过
  SSH/SCP 安装到新的不可变 release 目录。
- `fusiondigital.club` 与 `www.fusiondigital.club` 的阿里云 DNS 所有线路只能返回
  `47.75.119.239`。
- 严禁 apex/`www` 指向 `custom-domains.chatgpt.site`、Cloudflare 或其他平台；旧
  Cloudflare 地址 `162.159.143.30`、`172.66.3.26` 必须从所有分线路记录中删除。
- 发布/回滚应用不得隐式修改 DNS。应用回滚只切换
  `/srv/fusiondigital/current`；主机故障时只单独分享 Sites 平台 URL。

## 1. 运行结构与安全边界

```text
Internet :80/:443
        |
        v
Nginx (TLS、身份头清理、写 API 关闭、受控资产映射)
        |-- public reads --> vinext 127.0.0.1:3000 (public-anonymous)
        |-- analytics POST --> collector 127.0.0.1:3101 --> HMAC journal + SQLite
        `-- signed admin report --> collector --> aggregate-only signed response
```

不要在安全组中开放 3000 或 3101 端口。`server.mjs` 将应用监听地址硬编码为
`127.0.0.1`，并在 `NEXT_PUBLIC_FUSIONDIGITAL_MODE` 不是
`public-anonymous` 时拒绝启动。

生产入口在证书存在时固定启用 HTTP/2。构建会为 1 KiB 以上的 JS/CSS 生成无损
gzip sidecar，Nginx 优先发送这些逐字节可逆的传输副本；PNG、WebP、GLB、EFIT
及其他展示资产保持原始文件，不做有损处理。原始 `.jsonl.gz` 数据显式禁用 HTTP
Content-Encoding，确保 Range 和压缩字节 SHA-256 契约不变。

服务器只需要以下运行文件，不需要源码树或完整 `node_modules`：

```text
dist/
package.json
node_modules/vinext/
deploy/aliyun-hk/server.mjs
deploy/aliyun-hk/verify-runtime-assets.mjs
assets/runtime-assets.lock.json
```

`vinext` 是开发依赖，因此服务器执行 `npm ci --omit=dev` 后不能运行
`vinext start`。本方案直接携带已锁定的、纯 JavaScript 的 `vinext` 包，并由
最小启动器导入 `vinext/server/prod-server`。

## 2. 本地生成可复现发布包

构建需要明显多于生产 ECS 的运行预算，必须在开发机或 CI 完成，不能在生产服务器上
构建。应从准备发布的已提交 SHA 建立隔离 worktree；下面示例不会使用当前工作区
中的未提交文件。

```powershell
$Repo = "D:\Code\FusionDigital"
$Sha = (git -C $Repo rev-parse HEAD).Trim()
$ShortSha = $Sha.Substring(0, 12)
$Stage = "D:\Code\FusionDigital-deploy-$ShortSha"
$Bundle = Join-Path $env:TEMP "fusiondigital-$ShortSha.tgz"

git -C $Repo worktree add --detach $Stage $Sha
Set-Location $Stage

npm ci
npm run assets:verify:tracked

# 仓库门禁要求两个外置 bundle 的 GLB 此时尚未进入 public；先在干净树上完成全量检查。
npm run check

# 香港稳定部署必须把 ITER 与 EXL-50U 总装两个外置 bundle 都纳入 dist；
# 两个 source-dir 都必须是仓库外、已审核且与当前 lock 完全一致的独立目录。
if (-not $env:FUSION_ITER_RELEASE_SOURCE) {
  throw "FUSION_ITER_RELEASE_SOURCE is required for the ITER bundle"
}
if (-not $env:FUSION_EXL50U_GA_RELEASE_SOURCE) {
  throw "FUSION_EXL50U_GA_RELEASE_SOURCE is required for the EXL-50U bundle"
}
npm run assets:hydrate -- --bundle iter-high-detail-v1 `
  --source-dir $env:FUSION_ITER_RELEASE_SOURCE
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1 `
  --source-dir $env:FUSION_EXL50U_GA_RELEASE_SOURCE
npm run assets:verify

$env:NEXT_PUBLIC_FUSIONDIGITAL_MODE = "public-anonymous"
$env:FUSIONDIGITAL_BUILD_TARGET = "aliyun-hk"
npm run build

# postbuild 必须生成 JS/CSS 的无损 gzip sidecar；至少应存在一个文件。
if (-not (Get-ChildItem "dist\client\assets" -Recurse -File -Filter "*.gz" | Select-Object -First 1)) {
  throw "Aliyun build did not generate static gzip sidecars"
}

$ReleaseManifest = [ordered]@{
  schemaVersion = 2
  commitSha = $Sha
  mode = "public-anonymous"
  buildTarget = "aliyun-hk"
  deploymentProfile = "aliyun-hk-production"
}
$ReleaseManifestJson = $ReleaseManifest | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText(
  (Join-Path $PWD ".fusiondigital-release.json"),
  $ReleaseManifestJson,
  [System.Text.UTF8Encoding]::new($false)
)

node deploy/aliyun-hk/verify-runtime-assets.mjs .

tar.exe -czf $Bundle dist package.json node_modules/vinext deploy/aliyun-hk `
  assets/runtime-assets.lock.json .fusiondigital-release.json
$BundleSha256 = (Get-FileHash -LiteralPath $Bundle -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Bundle: $Bundle"
Write-Host "Bundle SHA-256: $BundleSha256"
Write-Host "Commit: $Sha"
```

若本机没有已 hydrate 的目录，改为：

```powershell
npm run assets:hydrate -- --bundle iter-high-detail-v1 `
  --source-dir "D:\controlled\iter-high-detail-v1"
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1 `
  --source-dir "D:\controlled\exl50u-general-assembly-v1"
npm run assets:verify
```

两个 bundle 都没有默认网络源，必须显式提供各自的 `--source-dir`，或配置独立、已审核、
无重定向并直接返回 `200/206` 的不可变 HTTPS 镜像。GitHub Releases 的常规下载 URL
会 `302` 到另一 origin，按 fail-closed 合同必须拒绝，不能再作为默认值。ITER 使用
`FUSION_ASSET_SOURCE_DIR` / `FUSION_ASSET_BASE_URL`；EXL-50U 总装使用独立的
`FUSION_EXL50U_GA_ASSET_SOURCE_DIR` / `FUSION_EXL50U_GA_ASSET_BASE_URL`。两个 bundle
不能共用、猜测目录或让国内用户浏览时临时回源。

### 2.1 EXL-50U 总装从 metadata-only 到正式激活

正式发布状态固定为 20 个公开匿名 high GLB，总计 270,978,652 B（271.0 MB）。能力足够的
桌面客户端可以自动串行加载；窄屏、省流量或低内存客户端必须由用户显式启动。active
发布不包含标准 preview 或降级回退，任一分片下载、摘要、解码或聚合检查失败都必须
fail closed。下列步骤既是首次激活流程，也是以后替换派生版本时必须原子重复的
流程。项目器只读取公开派生 manifest 与 GLB，不读取 STEP、BOM、PMI 或源装配标签；
GLB JSON 必须没有任意 `name` / `extras`，唯一公开根名 `EXL50U_GA_VISUALIZATION` 由
运行时合成，不写回 GLB。正式格式固定为 Float32 POSITION、normalized Int8 NORMAL、
Uint32 indices、Meshopt 与 GPU instancing。

```powershell
$PrivateBuild = "D:\controlled\exl50u-ga-private-v9" # 仓库外、已存在且只保存私有输入/收据
$Exporter = Join-Path $PrivateBuild "exporter"
$RawManifest = Join-Path $PrivateBuild "exl50u-fdmesh-raw-20260905-r10\assembly.private.json"
$ToolingEvidence = Join-Path $PrivateBuild "public-derivative-tooling.v9.private.json"
$QemEvidence = Join-Path $PrivateBuild "exl50u-public-derivative-v9.qem.private.json"       # 必须不存在
$VisualReport = Join-Path $PrivateBuild "exl50u-public-derivative-v9.visual-qa.private.json" # 必须不存在
$Python = "C:\path\to\the-reviewed-cadquery-environment\python.exe"
$Edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$Reviewed = "D:\controlled\exl50u-ga-reviewed"       # 仓库外，只含已 QA 公开派生
$Projected = "D:\controlled\exl50u-ga-release-v1"   # 必须是不存在的新目录

# $Stage 是当前 clean release worktree；--node-root 必须指向它，不能复制某台开发机的脏路径。
& $Python "$Exporter\build_public_derivative_cli.py" `
  --manifest $RawManifest --output $Reviewed `
  --private-qem-evidence $QemEvidence `
  --private-visual-qa-report $VisualReport `
  --private-tooling-evidence $ToolingEvidence `
  --node-root $Stage --edge $Edge --visual-qa-backend swiftshader `
  --preview-ratios "0.03,0.03" --high-ratios "0.70,0.65" `
  --preview-max-error 0.02 --high-max-error 0.0005

npm run assets:project-exl50u-general-assembly -- `
  --derivative-manifest "$Reviewed\public-derivative-manifest.json" `
  --asset-dir $Reviewed --output $Projected --as-of YYYY-MM-DD

# 人工复核投影 manifest/notice 不含私有元数据后，把两者纳入激活提交；GLB 不进 Git。
New-Item -ItemType Directory -Force "public\models\exl50u-general-assembly-v1" | Out-Null
Copy-Item "$Projected\model-manifest.json" "public\models\exl50u-general-assembly-v1\model-manifest.json"
Copy-Item "$Projected\PUBLICATION-NOTICE.md" "public\models\exl50u-general-assembly-v1\PUBLICATION-NOTICE.md"

npm run assets:generate-exl50u-general-assembly-allowlist
npm run assets:check-exl50u-general-assembly-allowlist
$CatalogCandidate = "D:\controlled\device-catalog.exl50u-ga.activated.json" # 必须不存在
npm run assets:activate-exl50u-general-assembly-catalog -- `
  --catalog "public\models\device-catalog.json" `
  --manifest "$Projected\model-manifest.json" `
  --output $CatalogCandidate
# 人工复核候选后，以候选完整替换 public/models/device-catalog.json。激活器会拒绝
# ASSETS PENDING、无 GLB、八系统、共同原点/common-origin 等旧管线文案，并固定
# online-public-simplified / public-static / real-3d 与正式 manifestEndpoint。
# 先精确暂存新 manifest/notice、已复核 catalog 和生成白名单；refresh-lock 只枚举
# git ls-files，未暂存的新文件不会进入 Git-managed runtime lock。禁止使用 git add .。
git add -- "public/models/exl50u-general-assembly-v1/model-manifest.json" `
  "public/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md" `
  "public/models/device-catalog.json" `
  "worker/exl50u-general-assembly-assets.generated.ts"
npm run assets:refresh-lock
git add -- "assets/runtime-assets.lock.json"
npm run assets:hydrate -- --bundle exl50u-general-assembly-v1 --source-dir $Projected
npm run assets:verify
node --test tests/external-runtime-bundle-contract.test.mjs tests/runtime-assets.test.mjs
```

这里的私有 exporter/tooling 必须是 v9：它逐三角形处理无法生成有限法线的极小 sliver，
并对每个 high definition 执行目标保留门禁，禁止因为单个退化面把整件替换成最低覆盖几何。
公开 `derivationEvidence` 仍使用兼容的 exact v8 七键匿名结构；私有工具版本和公开证据结构
是两个不同的版本轴，不能因为公开结构仍为 v8 而复用旧 exporter 或旧 tooling receipt。

`public/models/exl50u-general-assembly-v1/model-manifest.json` 是仓库测试的正式激活开关。
正式激活或更新必须在同一提交中加入/更新 manifest、`PUBLICATION-NOTICE.md`、catalog、
精确 Worker 白名单和 runtime lock；五者不可拆分提交，也不能通过临时移走 manifest 让
测试退回 metadata-only。
下列五组验收会据此进入 **active 分支**，验证 real-3d catalog、manifest endpoint、20 个 high 文件
白名单与 runtime lock 相干；仅历史 pre-activation 提交在 manifest 不存在时严格要求
metadata-only、空白名单且 lock 未激活。八系统私有转换管线由独立测试继续验证，不能替代
正式匿名派生的 active 验收。

```powershell
node --test tests/external-runtime-bundle-contract.test.mjs `
  tests/exl50u-general-assembly.test.mjs tests/rendered-html.test.mjs tests/efit-ui.test.mjs
npx tsx --test tests/exl50u-anonymous-shard-viewer.test.mts
```

不要复制或 Git add `$Projected\*.glb`；`.gitignore` 与 lock 只允许跟踪 manifest、公告、
生成白名单和真实摘要锁。Sites 构建不 hydrate 这两个外置缓存，postbuild 会删除两类
GLB 并保持展开包小于 256 MiB；其运行时值
`EXL50U_GENERAL_ASSEMBLY_ASSET_BASE_URL` 必须精确配置为
`https://raw.githubusercontent.com/tianshao1992/fusion-physics-atlas-assets/<40位小写提交SHA>/exl50u-general-assembly-v1`；
不得使用其他仓库、分支/tag/短 SHA、香港生产域名、Sites 域名或任何会重定向的
Releases 下载地址。ITER 与 EXL 两个根地址必须固定到**同一个资产仓库完整提交 SHA**；
ITER Worker 对应变量是
`ITER_HIGH_DETAIL_ASSET_BASE_URL`，EXL Worker 对应变量是
`EXL50U_GENERAL_ASSEMBLY_ASSET_BASE_URL`。Worker 先尝试本地精确文件，再代理显式目录；
白名单以外路径始终 404。香港构建则保留两类缓存并逐文件复核字节数与 SHA-256。
投影后的 DeviceManifest 必须保留 exact v8 匿名 `derivationEvidence` 七键：`kind`、
`selectedAttempt`、`sourceInputCleaning`、`previewVisualLod`、`highQem`、`highPartition` 与
`coverage`。`previewVisualLod` 中的 sloppy visual LOD（`selectedTargetTriangleRatio = 0.03`、
`simplifierNormalizedErrorLimit = 0.02`）仅保留为受控派生 QA 收据，不进入 active 浏览器资产，
也不得作为 high 失败回退。high 固定使用 QEM 与 `0.70/0.65` 两次尝试；2026-09-05 正式
high 派生的 20 个 GLB 实测总量为 270,978,652 B（271.0 MB），后续版本仍以新派生物的
实测值为准；两档派生证据各自保存互斥计数闭合的
`outputCleaning`。high 还必须满足
`highQem.outputCleaning.finalTriangles >= floor(0.98 * selectedTargetTriangleRatio * sourceInputCleaning.sanitizedTriangles)`，
用于阻断 r6 一类发布尺度的 high 聚合坍缩；逐 definition 的 98% 目标保留由私有 v9 exporter
在生成阶段另行强制，不能由这条公开聚合指标替代。私有 preview QA 还必须携带 canonical 10-view visual QA 收据，十视角最差
silhouette IoU 不低于 0.97、最坏 normalized depth p99 不高于 0.02。20 个 high 文件只是
运输分片；`highPartition.geometryChunkCount` 是解码 GLB primitive/mesh 的实际几何 chunk
总数，二者不得混同，并须与 high 三角面及零缺失 coverage 对账。

完整 canonical visual report、QEM 私有收据、源 manifest、仅用于投影前交叉核验的
`geometryAccounting`、源路径/摘要、定义或 occurrence ID 均留在仓库外受控目录；公开
DeviceManifest 只能包含上述匿名计数和小写 64 字符 receipt SHA-256，不得投影这些私有字段。
`sourceInputCleaning` 仅记录 exact-zero/repeated-index 清理及稳定顶点重映射的匿名计数，不含
任何逐定义拓扑保留声明或旧版简化语义，也不得用任意 epsilon 吞掉正面积三角形。20 个 high GLB
总量仍受 300 MiB 硬门禁约束，不能按某次实际产物大小放宽。

公开 GLB 和 manifest 的 `boundsMetres` 会保留用于浏览器取景的近似米制尺度。公开包排除的
是源 CAD、PMI、尺寸标注和权威尺寸表，而不是声称可视几何没有尺度；这些近似坐标与包围盒
只能用于外观展示，不得作为测量、设计、制造或任何工程尺寸依据。

EXL-50U 正式 manifest 的访问策略在 schema、投影器、运行时提取器、catalog 激活器、
runtime lock 与香港安装器各层都必须精确为 `classification=PUBLIC`、
`redistributionAllowed=true`、`engineeringUseAllowed=false`。任何一层出现 `INTERNAL`、
不可再分发、源 CAD 声明或工程用途声明，都必须阻断激活和安装，不能由另一层兜底放行。

两个 Worker `*_ASSET_BASE_URL` 只接受上述固定 raw origin/repository、40 位小写完整
提交 SHA 和精确 bundle id；userinfo、query、fragment、编码路径或尾随额外段均拒绝。
Worker 使用 `redirect: manual`，任何 3xx、`Response.redirected=true` 或最终 URL 与
期望的 origin/repository/commit/bundle/filename 不完全一致都返回失败。runtime lock、
formal pair evidence 与两份发布文档使用同一口径。

上传时使用已经验证的服务器 SSH 访问方式，不要把私钥、密码或临时凭证放入仓库或
命令记录。每台开发机必须使用自己的 SSH 密钥，不能从另一台机器、聊天或网盘复制
私钥。新机器首次接入按以下顺序完成：

1. 在新机器生成独立 ED25519 密钥；私钥只保存在该机器的安全存储中。
2. 通过已验证的阿里云 Workbench/云助手读取服务器
   `/etc/ssh/ssh_host_ed25519_key.pub` 的 SHA-256 指纹，并与新机器首次连接显示的
   指纹逐字核对。禁止使用 `StrictHostKeyChecking=no`，也不能仅凭 `ssh-keyscan`
   的结果建立信任。只有指纹完全一致后，才接受该主机公钥并写入本机
   `known_hosts`。
3. 只把新机器的**公钥**通过受控通道追加到服务器授权列表；不得覆盖已有公钥。
4. 用 `BatchMode=yes`、`IdentitiesOnly=yes` 和 `StrictHostKeyChecking=yes` 完成一次
   无交互验证后，才能让该机器上的 Codex 执行上传或发布。

首次初始化若仅有阿里云 Workbench/云助手免密通道，可先用其文件上传功能放入发布包
和安装器；在普通 SSH 公钥尚未独立验证前，不得关闭现有登录方式：

```powershell
$Server = "47.75.119.239"
$IdentityFile = "$env:USERPROFILE\.ssh\fusiondigital_aliyun_hk"
if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
  throw "Missing this machine's FusionDigital SSH private key."
}
$SshOptions = @(
  "-i", $IdentityFile,
  "-o", "BatchMode=yes",
  "-o", "IdentitiesOnly=yes",
  "-o", "StrictHostKeyChecking=yes"
)

& ssh @SshOptions "root@${Server}" "true"
if ($LASTEXITCODE -ne 0) {
  throw "Strict SSH preflight failed; do not upload."
}
& scp @SshOptions $Bundle "root@${Server}:/tmp/fusiondigital-$ShortSha.tgz"
& scp @SshOptions "deploy/aliyun-hk/install-release.sh" `
  "root@${Server}:/tmp/install-fusiondigital-release.sh"
```

仓库保存的是现有 ECS/EIP 的应用发布合同，不是可从零创建云资源的 IaC。实例规格、
系统盘、计费方式、安全组和账号权限必须在阿里云控制台按实时资源核对；不得仅凭本文
重建、替换或购买服务器。若以后需要灾备重建，应另行审核不含凭据的 Terraform/ROS
合同，并与应用发布变更分开提交。

必须始终调用仓库内的安装器，而不是手工覆盖 current、systemd 和 Nginx。安装器会
核对完整提交 SHA、包 SHA-256、runtime lock、每个已激活外置 bundle 的逐文件字节数与
SHA-256、EFIT 入口、每个 gzip sidecar 的解压字节一致性，并在已有证书时从版本化模板
恢复 HTTPS/HTTP2 配置。对历史 pre-activation release，metadata-only 分支会递归检查
整个 `dist/client`，拒绝放在任意其他目录中的 EXL bundle、1.4 formal manifest 或摘要
命名匿名 GLB；当前 active release 则要求 manifest、20 个 high GLB 与 lock 全部存在，且旧 preview 路径必须为 404。安装器还会把全部
`dist/client/**/*.glb` 与 Git/external lock 的精确 path、字节和 SHA-256 对账。Nginx 的
所有 GLB `location =` 只能从完整校验后的 runtime lock 逐文件渲染，不能用目录或正则放宽：

```bash
sudo bash /tmp/install-fusiondigital-release.sh \
  "/tmp/fusiondigital-<SHORT_SHA>.tgz" \
  "<FULL_COMMIT_SHA>" \
  "<64_CHAR_LOWERCASE_SHA256>"
```

生产安装器会在应用、Nginx、TLS 和资产探针通过后，自动安装并验证同一 release 的统计
collector、SQLite 与本机 TLS 报表桥；任一步失败都会使整个 release 回滚。首次执行前
必须按 [`docs/ANALYTICS.md`](../../docs/ANALYTICS.md) 安全配置香港专用匿名化密钥和
Sites/HK 共用报表桥密钥。不要把 Secret 放在上述命令行中。

## 3. Ubuntu 24.04 初始化

在阿里云 ECS 安全组中仅开放需要的 TCP 端口：22、80、443。应用端口 3000 不得
开放到公网。

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg openssl nginx certbot python3-certbot-nginx
```

应用要求 Node.js `>=22.13.0`。推荐安装并固定当前 LTS 主版本；以下示例使用
Node.js 24：

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list >/dev/null
sudo apt-get update
sudo apt-get install -y nodejs
node --version
```

2 GiB ECS 应至少确认已有 2 GiB swap；若阿里云扩展尚未创建，下列命令才会补齐。
swap 只是突发保护，不能用于在服务器上构建：

```bash
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  if [ ! -e /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
  fi
  sudo swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab \
  || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/90-fusiondigital.conf
sudo sysctl --system
```

创建只读运行用户和 release 根目录。Nginx worker 加入 `fusiondigital` 组后才能
读取组权限为 640/750 的发布文件：

```bash
sudo adduser --system --group --home /srv/fusiondigital fusiondigital 2>/dev/null || true
sudo usermod -aG fusiondigital www-data
sudo install -d -m 0750 -o root -g fusiondigital \
  /srv/fusiondigital /srv/fusiondigital/releases
```

## 4. 安装 release 与 Nginx 边界

唯一允许的安装入口是第 2 节上传的版本化 `install-release.sh`。不得手工解包、直接
修改 `/srv/fusiondigital/current`、复制 `nginx.conf` 或覆盖 systemd unit；这些旁路
会跳过归档安全检查、并发锁、gzip/外置资产/EFIT 门禁、TLS renderer 与事务回滚。

第 3 节初始化与包管理只执行一次；日常 release 安装器不会运行 `apt`、改 NodeSource、
swap 或用户组。安装器使用完整 SHA 建立不可变 release，在写入任何 Nginx/systemd 配置前备份当前
状态；若配置校验、服务启动或资源 smoke test 任一失败，会恢复旧 current、配置与
服务状态，并删除失败 release 以允许同一 SHA 重试。

服务把 V8 heap 限制为 384 MiB，并设置 systemd `MemoryHigh=550M`、
`MemoryMax=700M`。vinext 只在启动时缓存小于 64 KiB 的静态文件；大型报告、
模型和 EFIT 数据由 Nginx 直接流式发送。

Nginx 配置同时支持 apex 和 `www`。在切换 DNS 前，先用公网 IP 和 Host 头验证；
此时不需要修改本机 hosts：

```bash
curl -fsSI -H 'Host: fusiondigital.club' http://127.0.0.1/
curl -fsS -H 'Host: fusiondigital.club' \
  'http://127.0.0.1/api/search?q=tokamak&limit=5' >/dev/null
```

从另一台机器验证公网入口：

```bash
curl -fsSI -H 'Host: fusiondigital.club' http://<SERVER_IP>/
```

## 5. DNS 与 HTTPS 零停机切换

### 5.1 推荐路径：DNS-01 预签证书

保持生产 DNS 指向上一源站，先用经批准的 ACME DNS-01 客户端或 AliDNS 插件为
`fusiondigital.club` 与 `www.fusiondigital.club` 一次性签发证书，并把完整的 Certbot
托管文件安装到新 ECS。API 凭证必须使用临时、最小权限 secret，不得写入仓库、脚本、
命令历史或发布记录；DNS-01 工具还必须提供可审计的自动续期方式，不能依赖无人值守
时必然失败的手工 TXT 提示。

若切换当日确实没有 AliDNS 最小权限 API 凭据，允许把一次性人工 DNS-01 作为仅用于
切换前预签与 SNI 验收的桥接措施。`finalize-https.sh` 检测到 Certbot renewal
`authenticator = manual` 时会醒目告警，但不会阻断预切 SNI 验收。DNS 全部切到新 EIP
前，桥接签发的完整命令是：

```bash
sudo certbot certonly --manual --preferred-challenges=dns \
  --cert-name fusiondigital.club \
  --agree-tos --email '<ADMIN_EMAIL>' \
  -d fusiondigital.club -d www.fusiondigital.club
```

按 Certbot 提示依次添加并验证 `_acme-challenge` TXT；不要加入 `-i nginx`，也不要使用
`certbot run -a manual -i nginx` 绕过仓库的 Nginx 事务。DNS 全部切到新 EIP 后，必须
在正式完成前把续期认证迁移为 Nginx/受控 HTTP-01 并验证实际续期路径：

```bash
sudo certbot reconfigure --cert-name fusiondigital.club --nginx
sudo certbot renew --dry-run
```

还必须确认 `/etc/letsencrypt/renewal/fusiondigital.club.conf` 的 `authenticator` 已不再是
`manual`。迁移或 dry-run 任一步失败都不能宣布正式发布完成；不得把人工 TXT 作为
长期续期方案。

人工 `certonly --manual` 只生成证书对；启用 TLS 前只要求这两个文件同时存在且非空，
缺任意一个都会 fail closed：

```bash
sudo test -s /etc/letsencrypt/live/fusiondigital.club/fullchain.pem
sudo test -s /etc/letsencrypt/live/fusiondigital.club/privkey.pem
```

共享 helper 会在证书对完整但 Nginx support state 不完整时幂等执行 Certbot 2.9 的
受控 plugin prepare；该命令只初始化 installer/plugin，不签发证书，也不把证书安装进
站点配置：

```bash
sudo certbot plugins --prepare --installers
```

它逐一校验并固定为 `root:root 0644` 的四个状态文件是：

- `/etc/letsencrypt/options-ssl-nginx.conf`（Certbot 2.9 实测 774 B）；
- `/etc/letsencrypt/ssl-dhparams.pem`（实测 424 B）；
- `/etc/letsencrypt/.updated-options-ssl-nginx-conf-digest.txt`（64 位十六进制，64 B）；
- `/etc/letsencrypt/.updated-ssl-dhparams-pem-digest.txt`（64 位十六进制，64 B）。

任一已有状态路径为符号链接、特殊文件、空文件、非 `root:root 0644`，或 prepare 后
仍缺文件、摘要格式/内容不匹配或 prepare 后 `nginx -t` 失败时都会 fail closed。只有
显式执行 `finalize-https.sh` 才允许 helper 写入 `/etc/letsencrypt`；普通
`install-release.sh` 与 renderer 只读检查状态，不会借发布应用修改 Certbot。因而全新
ECS 的“证书 2 个 + support state 0 个”必须经 finalize 安全初始化后才能 render TLS；
普通 release 遇到该状态会 fail closed。support 状态机只接受 0/4 `ABSENT` 或完整、
权限与摘要均验证通过的 4/4 `READY`；1–3/4、空文件、符号链接或摘要不匹配都是
`INVALID`，即使没有证书也硬失败。没有证书但 support 为 `READY` 时仍保持 HTTP-only。
`finalize-https.sh` 会在任何 `certbot certonly` 前先用只读 `--inspect-only` 执行这套
分类；`INVALID` 会立即退出且不会调用 Certbot，`ABSENT`/`READY` 才能继续。该预检
不会在无证书时提前 prepare；只有证书对已经就绪后才执行完整 helper。

然后运行 HTTPS 收尾脚本。已有完整证书时，它会先核对至少 7 天有效期、双域名覆盖及
证书/私钥公钥一致性，再跳过签发并启用 TLS：

```bash
sudo /srv/fusiondigital/current/deploy/aliyun-hk/finalize-https.sh \
  '<ADMIN_EMAIL>'
```

脚本在修改前备份 Nginx 站点配置；render、`nginx -t`、reload、双域名健康检查或
HTTP/2 检查任一步失败，都会恢复原配置并再次 reload。脚本不会修改、校验或重载
SSH，也不会写入 `sshd_config`。若 `sshd` 或其他非 Nginx 服务占用 443，它保持 SSH
与 Nginx 原样并安全退出。

此时生产 DNS 仍未切换。必须先从外部机器用新 EIP + SNI 验证两个名称：

```powershell
curl.exe -fsSI --resolve "fusiondigital.club:443:47.75.119.239" https://fusiondigital.club/
curl.exe -fsSI --resolve "www.fusiondigital.club:443:47.75.119.239" https://www.fusiondigital.club/
```

两条命令以及公开检索、资产 Range、匿名安全边界全部通过后，才修改阿里云 DNS：

1. `@` 只保留指向 `47.75.119.239` 的 A 记录；
2. `www` 只保留指向 `47.75.119.239` 的 A 记录；
3. 推荐两个名称各保留一条“默认”线路记录。若确需保留电信、联通、移动、境内、
   境外等分线路，则**每一条**都必须指向 `47.75.119.239`；
4. 删除 `custom-domains.chatgpt.site` 或其他 Sites/Cloudflare 主机名的 CNAME，删除
   旧香港轻量 `47.82.66.79`、`162.159.143.30`、`172.66.3.26` 等旧地址，删除把
   流量导向其他平台的 AAAA/ALIAS/ANAME；
5. 保留现有域名所有权验证 TXT；建议 TTL 设为 600 秒；
6. 至少等待一个旧 TTL，再确认 apex 和 `www` 在多个解析器及国内三网节点都只
   返回 `47.75.119.239`。

### 5.2 退化路径：HTTP-01 维护窗口

只有无法使用 DNS-01 时，才能安排明确维护窗口使用 HTTP-01。先记录 DNS 回退证据、
通知窗口、确认 80 端口与双域名 Host 请求可达，再把 apex 和 `www` 全部切到新 EIP，
随后显式运行：

```bash
sudo /srv/fusiondigital/current/deploy/aliyun-hk/finalize-https.sh \
  --http-01 '<ADMIN_EMAIL>'
```

没有 `--http-01` 且不存在完整证书时，脚本会拒绝隐式签发。HTTP-01 失败时 Nginx
配置会自动回滚，但 DNS 已经切换，维护者必须在窗口内修复签发或按已审核方案恢复
DNS；不得把这段暴露期描述为零停机。

### 5.3 DNS 硬门禁

不要只检查阿里云控制台第一行记录。默认与运营商/地域分线路并存会造成不同节点命中
不同源站。切换后运行：

```powershell
npm run release:verify-dns
Resolve-DnsName fusiondigital.club -Type A -Server 223.5.5.5 -DnsOnly
Resolve-DnsName www.fusiondigital.club -Type A -Server 223.5.5.5 -DnsOnly
Resolve-DnsName fusiondigital.club -Type A -Server 119.29.29.29 -DnsOnly
Resolve-DnsName www.fusiondigital.club -Type A -Server 119.29.29.29 -DnsOnly
```

AliDNS no-ECS、全球兜底、通用境内及国内三网 ECS 结果是阻塞性硬门禁。本机
`system-default` 仅作 advisory；若 VPN/代理返回 `198.18.0.0/15` fake-IP，应关闭
VPN 后人工复核，不能用 fake-IP 结果覆盖或忽略可信 DoH 的失败。完整断言见
[生产发布手册](../../docs/RELEASE.md#4-dns-硬门禁)。

若本次使用了一次性人工 DNS-01，DNS 硬门禁通过后还必须完成 5.1 中的 renewal
authenticator 迁移和 `certbot renew --dry-run`，再进入上线完成确认。

## 6. 上线验收

基础状态：

```bash
systemctl is-active fusiondigital nginx
journalctl -u fusiondigital -n 100 --no-pager
free -h
curl -fsSI https://fusiondigital.club/
curl -fsSI https://www.fusiondigital.club/
curl -fsSI --http2 https://fusiondigital.club/
```

公开能力：

```bash
curl -fsS 'https://fusiondigital.club/api/search?q=tokamak&limit=5' >/dev/null
curl -fsSI https://fusiondigital.club/device-assets/exl50u-interactive/model-manifest.json
curl -fsSI https://fusiondigital.club/models/exl50u-general-assembly-v1/model-manifest.json
curl -fsSI https://fusiondigital.club/device-data/exl50u-efit/index.json
curl -fsSI -H 'Accept-Encoding: gzip' https://fusiondigital.club/assets/<HASHED_ASSET>.js
```

JS/CSS 响应应包含 `Content-Encoding: gzip`，而
`/device-data/exl50u-efit-v2/*.jsonl.gz` 响应不得包含该头。

ITER Range 请求应返回 206 和 `Content-Range`：

```bash
curl -fsSI -H 'Range: bytes=0-1023' \
  'https://fusiondigital.club/device-assets/iter-high-detail/v1/cs.d1a8a1b30b9da86cd5d428012c3ce599fb16eca0b4778da3507bd26ceba78cdb.high.meshopt.glb'
```

安装器会从 lock 对 ITER 与 EXL-50U 总装 bundle 各选一个真实摘要路径，强制验证
`206`、精确 `Content-Length` / `Content-Range`、identity 编码、immutable cache 和全部
安全头。手工复核 EXL 路径时从 lock 读取，不能填占位摘要：

```bash
EXL_ROUTE=$(node -e 'const x=require("./assets/runtime-assets.lock.json"); const b=x.externalBundles.find((v)=>v.id==="exl50u-general-assembly-v1"); if(!b?.files?.[0]?.route) process.exit(2); console.log(b.files[0].route)')
curl -fsSI -H 'Accept-Encoding: gzip' -H 'Range: bytes=0-1023' "https://fusiondigital.club$EXL_ROUTE"
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://fusiondigital.club/device-assets/exl50u-general-assembly/v1/unknown.glb
```

第一条必须返回 `206`，并包含 `Cache-Control: public, max-age=31536000, immutable`；
第二条必须始终返回 `404`。

安全边界应返回 404，即使客户端伪造平台身份头：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'oai-authenticated-user-id: forged-user' \
  https://fusiondigital.club/api/account
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'oai-authenticated-user-email: forged@example.invalid' \
  https://fusiondigital.club/api/research/runs
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://fusiondigital.club/signin-with-chatgpt
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://fusiondigital.club/callback
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://fusiondigital.club/models/exl50u-interactive/model-manifest.json
```

最后使用国内电信、联通、移动的外部节点检查 DNS、TLS、首页、JS/CSS、数字样机
清单和 Range 请求。用户浏览器控制台不应再出现对 GitHub Releases、OpenAI Sites
或 Cloudflare D1 的运行时依赖。

## 7. 发布新版本与回滚

每次发布都重新调用第 2、4 节的安装器。它只接受全新的完整 SHA release，并在安装
失败时自动恢复旧版本。已成功发布后的人工回滚也应由维护者明确记录目标 SHA，先
验证该 release 的 manifest 与文件完整性，再在维护窗口原子切换；不得用手工回滚
作为日常发布旁路。

若服务器整体不可用，优先修复主机或切换到服务器上的已知正常 release。可以把
Sites 平台分配的 `*.chatgpt.site` URL 单独发给使用者作为人工备用，但不得把
`fusiondigital.club` 或 `www` 的 DNS 改回 Sites/Cloudflare。生产 IP 迁移属于独立
基础设施变更，必须另行完成审批、证书、DNS 和回滚设计。不要删除旧 release，直到
新版本经过国内多网络验收。

## 8. 预期不可用能力

公开匿名镜像有意关闭：

- ChatGPT/SIWC 登录、退出与 callback；
- 账户、角色、配额、审计和个人模型密钥；
- 研究候选创建、提交、审核等所有写操作；
- Cloudflare D1 与 Images binding；
- 任意客户端指定的模型或资产上游。

专用匿名统计写入和签名报表桥只进入 loopback collector；Nginx 不记录身份或网络元数据，
collector 也只在 HMAC 后落盘。它们不是应用 Node 写 API，也不改变以上边界。管理员页面
和统计查询 API 仍只存在于 Sites，香港公网固定返回 404；桥只返回聚合数据并要求时戳、
nonce 与双向 HMAC。

这些限制属于部署信任边界，不应通过伪造请求头、开放 3000 端口或删除 Nginx
404 规则来绕过。
