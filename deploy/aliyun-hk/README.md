# FusionDigital 阿里云香港公开匿名版部署

本目录用于把 FusionDigital 以**公开匿名、只读镜像**部署到 Ubuntu 24.04
阿里云香港轻量应用服务器。正式入口支持：

- `https://fusiondigital.club/`
- `https://www.fusiondigital.club/`

此方案不迁移 OpenAI Sites 的 D1、SIWC 身份或个人模型密钥能力。账户 API、
研究候选写入/审核 API、ChatGPT 登录与回调入口在 Nginx 层直接返回 404；所有
进入 Node 的请求都会清除四个 `oai-authenticated-user-*` 身份头。公开问答固定
使用站内确定性检索，不调用外部模型。

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
npm run build

$IterFiles = Get-ChildItem "dist\client\models\iter-high-detail-v1" -File
if ($IterFiles.Count -ne 18) {
  throw "ITER high-detail bundle is incomplete"
}
if (($IterFiles | Measure-Object Length -Sum).Sum -ne 98507692) {
  throw "ITER high-detail bundle has the wrong byte length"
}

tar.exe -czf $Bundle dist package.json node_modules/vinext deploy/aliyun-hk
Write-Host "Bundle: $Bundle"
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

## 4. 安装首个 release

`RELEASE` 使用包名中的 12 位提交 SHA。release 目录不可复用或覆盖：

```bash
RELEASE="<12_CHAR_COMMIT_SHA>"
BUNDLE="/tmp/fusiondigital-${RELEASE}.tgz"
TARGET="/srv/fusiondigital/releases/${RELEASE}"

sudo test ! -e "$TARGET"
sudo install -d -m 0750 -o root -g fusiondigital "$TARGET"
sudo tar -xzf "$BUNDLE" -C "$TARGET"

sudo test -f "$TARGET/dist/server/index.js"
sudo test -f "$TARGET/dist/server/ssr/index.js"
sudo test -f "$TARGET/node_modules/vinext/dist/server/prod-server.js"
test "$(sudo find "$TARGET/dist/client/models/iter-high-detail-v1" -maxdepth 1 -type f | wc -l)" -eq 18

sudo chown -R root:fusiondigital "$TARGET"
sudo find "$TARGET" -type d -exec chmod 750 {} \;
sudo find "$TARGET" -type f -exec chmod 640 {} \;
sudo ln -sfn "$TARGET" /srv/fusiondigital/current
```

安装服务定义并启动：

```bash
sudo install -m 0644 \
  /srv/fusiondigital/current/deploy/aliyun-hk/fusiondigital.service \
  /etc/systemd/system/fusiondigital.service
sudo systemctl daemon-reload
sudo systemctl enable --now fusiondigital
sudo systemctl status fusiondigital --no-pager
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

服务把 V8 heap 限制为 384 MiB，并设置 systemd `MemoryHigh=550M`、
`MemoryMax=700M`。vinext 只在启动时缓存小于 64 KiB 的静态文件；大型报告、
模型和 EFIT 数据由 Nginx 直接流式发送。

## 5. 安装 Nginx 边界

```bash
sudo install -m 0644 \
  /srv/fusiondigital/current/deploy/aliyun-hk/nginx.conf \
  /etc/nginx/sites-available/fusiondigital
sudo ln -sfn /etc/nginx/sites-available/fusiondigital \
  /etc/nginx/sites-enabled/fusiondigital
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

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

## 6. DNS 与 HTTPS

先记录阿里云 DNS 中原 A 记录，确认它可以用于快速回滚。验证服务器后再切换：

1. `@` 的 A 记录指向香港服务器公网 IPv4；
2. `www` 使用同一 A 记录，或 CNAME 到 `fusiondigital.club`；
3. 保留现有域名所有权验证 TXT；
4. 等待 TTL 生效后确认 apex 和 `www` 都解析到新服务器。

DNS 生效后申请同时覆盖两个名称的证书：

```bash
sudo /srv/fusiondigital/current/deploy/aliyun-hk/finalize-https.sh \
  '<ADMIN_EMAIL>'
```

部署时若曾临时让 SSH 监听 443，脚本会先将 SSH 恢复为仅监听 22，再通过 Certbot
签发双域名证书、启用 HTTPS 重定向并开启自动续期 timer。省略邮箱参数时脚本使用
Certbot 的无邮箱注册方式，适合短期临时环境，但不会收到证书到期通知。

如果暂时没有 `www` DNS，首轮只为 apex 申请证书；创建 `www` 解析后再扩展证书。

## 7. 上线验收

基础状态：

```bash
systemctl is-active fusiondigital nginx
journalctl -u fusiondigital -n 100 --no-pager
free -h
curl -fsSI https://fusiondigital.club/
curl -fsSI https://www.fusiondigital.club/
```

公开能力：

```bash
curl -fsS 'https://fusiondigital.club/api/search?q=tokamak&limit=5' >/dev/null
curl -fsSI https://fusiondigital.club/device-assets/exl50u-interactive/model-manifest.json
curl -fsSI https://fusiondigital.club/device-data/exl50u-efit/index.json
```

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

## 8. 发布新版本与回滚

每次发布使用全新不可变 release 目录。切换前记录当前目标：

```bash
PREVIOUS="$(readlink -f /srv/fusiondigital/current)"
NEW_RELEASE="/srv/fusiondigital/releases/<NEW_12_CHAR_COMMIT_SHA>"

sudo test -f "$NEW_RELEASE/dist/server/index.js"
sudo ln -sfn "$NEW_RELEASE" /srv/fusiondigital/current
sudo systemctl restart fusiondigital
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

应用验收失败时原子回滚：

```bash
sudo test -f "$PREVIOUS/dist/server/index.js"
sudo ln -sfn "$PREVIOUS" /srv/fusiondigital/current
sudo systemctl restart fusiondigital
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

若服务器整体不可用，在阿里云 DNS 恢复切换前记录的原 A 记录即可回到原托管
入口。不要删除旧 release，直到新版本经过国内多网络验收。

## 9. 预期不可用能力

公开匿名镜像有意关闭：

- ChatGPT/SIWC 登录、退出与 callback；
- 账户、角色、配额、审计和个人模型密钥；
- 研究候选创建、提交、审核等所有写操作；
- Cloudflare D1 与 Images binding；
- 任意客户端指定的模型或资产上游。

这些限制属于部署信任边界，不应通过伪造请求头、开放 3000 端口或删除 Nginx
404 规则来绕过。
