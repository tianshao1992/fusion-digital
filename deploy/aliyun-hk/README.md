# FusionDigital 阿里云香港公开匿名版部署

本目录用于把 FusionDigital 以**公开匿名、只读镜像**部署到 Ubuntu 24.04
阿里云香港轻量应用服务器 `47.82.66.79`。这是 `fusiondigital.club` 的**唯一生产
部署方式**，正式入口支持：

- `https://fusiondigital.club/`
- `https://www.fusiondigital.club/`

此方案不迁移 OpenAI Sites 的 D1、SIWC 身份或个人模型密钥能力。账户 API、
研究候选写入/审核 API、ChatGPT 登录与回调入口在 Nginx 层直接返回 404；所有
进入 Node 的请求都会清除四个 `oai-authenticated-user-*` 身份头。公开问答固定
使用站内确定性检索，不调用外部模型。

OpenAI Sites 仅保留平台分配的 `*.chatgpt.site` 预览/人工备用地址，不得绑定上述
两个生产名称。`.openai/hosting.json` 不是生产托管声明。所有机器和 Codex 在操作前
还必须遵守根目录 [`AGENTS.md`](../../AGENTS.md) 与
[`docs/RELEASE.md`](../../docs/RELEASE.md)。

## 0. 生产不变量

- Codeup `master`、GitHub `main`、构建提交和服务器 release 必须是同一个完整
  SHA；先同步和校验 Git，再构建、上传。
- 发布包必须在干净的 detached worktree 中以 `public-anonymous` 模式构建，通过
  SSH/SCP 安装到新的不可变 release 目录。
- `fusiondigital.club` 与 `www.fusiondigital.club` 的阿里云 DNS 所有线路只能返回
  `47.82.66.79`。
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
        |
        v
vinext 127.0.0.1:3000 (public-anonymous)
```

不要在安全组中开放 3000 端口。`server.mjs` 将监听地址硬编码为
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
```

`vinext` 是开发依赖，因此服务器执行 `npm ci --omit=dev` 后不能运行
`vinext start`。本方案直接携带已锁定的、纯 JavaScript 的 `vinext` 包，并由
最小启动器导入 `vinext/server/prod-server`。

## 2. 本地生成可复现发布包

构建需要明显多于 1 GiB 内存，必须在开发机或 CI 完成，不能在轻量服务器上
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

# 仓库门禁要求外置 ITER 文件此时尚未进入 public；先在干净树上完成全量检查。
npm run check

# 国内稳定部署必须把 ITER 18 个高清分片纳入 dist。若原工作区已经 hydrate，
# 优先从已校验目录导入；否则直接运行 npm run assets:hydrate。
npm run assets:hydrate -- --source-dir "$Repo\public\models\iter-high-detail-v1"
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

$IterFiles = Get-ChildItem "dist\client\models\iter-high-detail-v1" -File
if ($IterFiles.Count -ne 18) {
  throw "ITER high-detail bundle is incomplete"
}
if (($IterFiles | Measure-Object Length -Sum).Sum -ne 98507692) {
  throw "ITER high-detail bundle has the wrong byte length"
}

tar.exe -czf $Bundle dist package.json node_modules/vinext deploy/aliyun-hk .fusiondigital-release.json
$BundleSha256 = (Get-FileHash -LiteralPath $Bundle -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Bundle: $Bundle"
Write-Host "Bundle SHA-256: $BundleSha256"
Write-Host "Commit: $Sha"
```

若本机没有已 hydrate 的目录，改为：

```powershell
npm run assets:hydrate
npm run assets:verify
```

默认下载源是 GitHub Releases；必须在本地完成下载和 SHA-256 校验，再把文件随
`dist` 上传。不要让国内用户浏览时回源 GitHub。

上传时使用服务器自己的 SSH 密钥或临时密码，不要把私钥放入仓库或命令记录：

```powershell
scp $Bundle "root@<SERVER_IP>:/tmp/fusiondigital-$ShortSha.tgz"
scp "deploy/aliyun-hk/install-release.sh" "root@<SERVER_IP>:/tmp/install-fusiondigital-release.sh"
```

必须始终调用仓库内的安装器，而不是手工覆盖 current、systemd 和 Nginx。安装器会
核对完整提交 SHA、包 SHA-256、ITER 字节数、EFIT 入口、每个 gzip sidecar 的解压
字节一致性，并在已有证书时从版本化模板恢复 HTTPS/HTTP2 配置：

```bash
sudo bash /tmp/install-fusiondigital-release.sh \
  "/tmp/fusiondigital-<SHORT_SHA>.tgz" \
  "<FULL_COMMIT_SHA>" \
  "<64_CHAR_LOWERCASE_SHA256>"
```

## 3. Ubuntu 24.04 初始化

在阿里云轻量应用服务器防火墙中仅开放需要的 TCP 端口：22、80、443。

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx
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

1 GiB 主机应配置 2 GiB swap，但 swap 只是突发保护，不能用于在服务器上构建：

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
会跳过归档安全检查、并发锁、gzip/ITER/EFIT 门禁、TLS renderer 与事务回滚。

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

## 5. DNS 与 HTTPS

先导出或截图阿里云 DNS 当前记录用于审计；旧记录只能作为调查证据，不能被默认
视为可用回滚目标。配置必须满足：

1. `@` 只保留指向 `47.82.66.79` 的 A 记录；
2. `www` 只保留指向 `47.82.66.79` 的 A 记录；
3. 推荐两个名称各保留一条“默认”线路记录。若确需保留电信、联通、移动、境内、
   境外等分线路，则**每一条**都必须指向 `47.82.66.79`；
4. 删除 `custom-domains.chatgpt.site` 或其他 Sites/Cloudflare 主机名的 CNAME，删除
   `162.159.143.30`、`172.66.3.26` 等旧 Cloudflare A 记录，删除把流量导向其他
   平台的 AAAA/ALIAS/ANAME；
5. 保留现有域名所有权验证 TXT；建议 TTL 设为 600 秒；
6. 至少等待一个旧 TTL，再确认 apex 和 `www` 在多个解析器及国内三网节点都只
   返回 `47.82.66.79`。

不要只检查阿里云控制台第一行记录。默认与运营商/地域分线路并存会造成部分国内
节点命中香港源站、另一部分节点命中 Cloudflare 并返回 403。完整 PowerShell DNS
断言见[生产发布手册](../../docs/RELEASE.md#4-dns-硬门禁)。

仓库内的 [`deploy/production-contract.json`](../production-contract.json) 是生产
DNS 的机器可读事实源。本机首先运行版本化硬门禁：

```powershell
npm run release:verify-dns
```

AliDNS no-ECS、全球兜底、通用境内及国内三网 ECS 结果是阻塞性硬门禁。本机
`system-default` 仅作 advisory；若 VPN/代理返回 `198.18.0.0/15` fake-IP，应关闭
VPN 后人工复核，不能用 fake-IP 结果覆盖或忽略可信 DoH 的失败。

然后至少执行以下独立只读检查；任一可信结果出现其他地址都应停止上线：

```powershell
Resolve-DnsName fusiondigital.club -Type A -Server 223.5.5.5 -DnsOnly
Resolve-DnsName www.fusiondigital.club -Type A -Server 223.5.5.5 -DnsOnly
Resolve-DnsName fusiondigital.club -Type A -Server 119.29.29.29 -DnsOnly
Resolve-DnsName www.fusiondigital.club -Type A -Server 119.29.29.29 -DnsOnly
```

DNS 生效后申请同时覆盖两个名称的证书：

```bash
sudo /srv/fusiondigital/current/deploy/aliyun-hk/finalize-https.sh \
  '<ADMIN_EMAIL>'
```

部署时若曾临时让 SSH 监听 443，脚本会先将 SSH 恢复为仅监听 22，再通过 Certbot
签发双域名证书、从版本化模板启用 HTTPS 重定向与 HTTP/2，并开启自动续期 timer。
后续 release 的安装器会检测现有证书并保留这套 TLS 配置，不再依赖 Certbot 修改过的
临时文件。省略邮箱参数时脚本使用 Certbot 的无邮箱注册方式，适合短期临时环境，
但不会收到证书到期通知。

执行脚本前，apex 与 `www` 都必须已解析到香港源站并能通过 HTTP 验证；任一名称未就绪
时停止签发，不使用单域名证书绕过固定双域名拓扑。

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

这些限制属于部署信任边界，不应通过伪造请求头、开放 3000 端口或删除 Nginx
404 规则来绕过。
