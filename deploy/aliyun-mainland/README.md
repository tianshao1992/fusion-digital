# FusionDigital 阿里云内地备案前预部署

本目录只用于在阿里云内地实例 `39.96.61.9` 上进行 **pre-ICP staging**。它不是当前
生产环境，不得承载 `fusiondigital.club` 或 `www.fusiondigital.club` 的公网 DNS。
当前生产仍是香港服务器 `47.82.66.79`，并继续受
[`deploy/production-contract.json`](../production-contract.json) 约束。

只有同时满足以下条件，才能另起一个经过评审的生产拓扑变更提交：

1. ICP 备案已获批；
2. 网站页脚已展示真实备案号并链接工信部备案系统；
3. 生产合同、DNS 测试、发布文档与回滚方案已在同一提交中更新；
4. Codeup `master`、GitHub `main`、本地提交和待部署 release 的完整 SHA 一致；
5. 新源站、双域名证书、国内三网与匿名安全边界均已通过验证。

在该变更提交完成并批准前，禁止修改 apex、`www` 或任何分线路记录。不要运行香港
目录中的 `finalize-https.sh`；其中的 443/SSH 引导逻辑不适用于内地实例。

## 1. 已实测的基础环境

- Alibaba Cloud Linux 3（OpenAnolis Edition）；
- kernel `5.10.134-19.1.al8.x86_64`；
- `dnf`；
- Nginx `1.24.0`，运行用户 `nginx`，加载 `/etc/nginx/conf.d/*.conf`；
- Node.js `24.19.0`、npm `11.17.0`；
- SELinux `Disabled`，firewalld `inactive`；
- vinext 服务首次启动约需 1 秒，因此安装器使用有界重试而不是一次性探测。

阿里云安全组在 staging 阶段应仅允许管理来源访问 TCP 22 和 80；不要开放 3000，
也不要在备案和证书流程完成前开放或配置生产 443。防火墙策略由阿里云安全组管理，
脚本不会修改 firewalld。

## 2. 构建不可变发布包

必须从目标提交建立 clean detached worktree。下面操作不会读取或打包主工作区中的
未提交文件：

```powershell
$Repo = "D:\Code\FusionDigital"
$Sha = (git -C $Repo rev-parse HEAD).Trim()
$ShortSha = $Sha.Substring(0, 12)
$Stage = "D:\Code\FusionDigital-mainland-$ShortSha"
$Bundle = Join-Path $env:TEMP "fusiondigital-mainland-$ShortSha.tgz"

git -C $Repo worktree add --detach $Stage $Sha
Set-Location $Stage
npm ci
npm run assets:verify:tracked

# 质量门在尚未 hydrate 的 clean tree 中执行。显式清除匿名构建模式并固定
# Sites 目标，避免调用者终端残留的阿里云环境变量绕过 Sites 包体门禁。
Remove-Item Env:NEXT_PUBLIC_FUSIONDIGITAL_MODE -ErrorAction SilentlyContinue
$env:FUSIONDIGITAL_BUILD_TARGET = "sites"
npm run check

# 把已校验的 ITER 运行时分片导入隔离 worktree；若没有本地镜像，改用
# `npm run assets:hydrate` 从锁定 HTTPS 地址获取。
npm run assets:hydrate -- --source-dir "$Repo\public\models\iter-high-detail-v1"
npm run assets:verify

$env:NEXT_PUBLIC_FUSIONDIGITAL_MODE = "public-anonymous"
$env:FUSIONDIGITAL_BUILD_TARGET = "aliyun-mainland"
npm run build

$ReleaseManifest = [ordered]@{
  schemaVersion = 2
  commitSha = $Sha
  mode = "public-anonymous"
  buildTarget = "aliyun-mainland"
  deploymentProfile = "aliyun-mainland-pre-icp"
}
[System.IO.File]::WriteAllText(
  (Join-Path $PWD ".fusiondigital-release.json"),
  ($ReleaseManifest | ConvertTo-Json -Compress),
  [System.Text.UTF8Encoding]::new($false)
)

$IterFiles = Get-ChildItem "dist\client\models\iter-high-detail-v1" -File
if ($IterFiles.Count -ne 18) { throw "ITER high-detail bundle is incomplete" }
if (($IterFiles | Measure-Object Length -Sum).Sum -ne 98507692) {
  throw "ITER high-detail bundle has the wrong byte length"
}

tar.exe -czf $Bundle dist package.json node_modules/vinext deploy/aliyun-mainland .fusiondigital-release.json
$BundleSha256 = (Get-FileHash -LiteralPath $Bundle -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Bundle: $Bundle"
Write-Host "Bundle SHA-256: $BundleSha256"
Write-Host "Commit: $Sha"
```

`aliyun-vm` 是与 `aliyun-mainland` 等价的通用构建别名；发布记录应优先使用更明确的
`aliyun-mainland`。`aliyun-hk` 仍保留为现有香港生产和回滚兼容目标。

## 3. 首次初始化

先在阿里云控制台读取实例 SSH 主机密钥指纹，与首次连接显示的指纹逐字核对，再写入
本机 `known_hosts`。禁止使用 `StrictHostKeyChecking=no`。

上传两个独立脚本并执行一次性 bootstrap：

```powershell
$Server = "39.96.61.9"
scp deploy/aliyun-mainland/bootstrap-alinux3.sh "root@${Server}:/tmp/"
scp deploy/aliyun-mainland/install-release.sh "root@${Server}:/tmp/"
ssh "root@${Server}" "bash /tmp/bootstrap-alinux3.sh"
```

bootstrap 会验证 Alibaba Cloud Linux 3/x86_64、安装实测软件包、配置 NodeSource 24、
严格核对 Node `24.19.0`，并建立只读运行用户和 release 根目录。若 NodeSource 当前
版本不再是已验证版本，脚本会停止，维护者必须重新验证后显式更新版本，不能静默漂移。

## 4. 安装 staging release

```powershell
scp $Bundle "root@${Server}:/tmp/fusiondigital-mainland-$ShortSha.tgz"
ssh "root@${Server}" (
  "bash /tmp/install-release.sh " +
  "/tmp/fusiondigital-mainland-$ShortSha.tgz $Sha $BundleSha256"
)
```

安装器会依次校验：

- 完整 Git SHA 和发布包 SHA-256；
- 全局部署锁，以及发布包为 root 所有、非链接且不可被组或其他用户写入；
- 先复制到仅 root 可读的私有快照，再从同一快照完成哈希、成员和解包校验；
- archive 不包含绝对路径或 `..` 路径穿越，且解包前仅允许普通文件和目录，拒绝
  symlink、hardlink、device、FIFO、socket 等特殊类型；
- 解包后再次拒绝链接、特殊文件和多硬链接文件，并验证每个 realpath 都留在临时
  release 目录内；
- manifest schema、提交 SHA、`public-anonymous` 模式、构建目标和 staging profile；
- vinext 运行入口以及 Nginx/systemd 配置；
- ITER 恰好 18 个文件、合计 `98,507,692` 字节。

校验完成后才把临时目录改名为不可变 release，通过同文件系统临时软链和 `mv -T`
原子切换 `/srv/fusiondigital/current`。服务启动最多重试 30 次、每次间隔 1 秒；Nginx
重启、应用重启或健康检查失败时，会事务化恢复之前的 `current`、Nginx 配置、systemd
unit、enable/active 状态并重新加载旧服务，同时保留失败 release 供审计。

## 5. 不改 DNS 的 staging 验收

服务器本机：

```bash
systemctl is-active fusiondigital nginx
readlink -f /srv/fusiondigital/current
curl -fsSI -H 'Host: fusiondigital.club' http://127.0.0.1/
curl -fsS -H 'Host: fusiondigital.club' \
  'http://127.0.0.1/api/search?q=tokamak&limit=5' >/dev/null
```

已获安全组授权的测试机：

```powershell
# 裸 IP 或未知 Host 必须命中 default_server 并返回 404。
curl.exe -sS -o NUL -w "%{http_code}`n" http://39.96.61.9/

# 只有显式 canonical Host 才进入应用 vhost。
curl.exe -fsSI -H "Host: fusiondigital.club" http://39.96.61.9/
curl.exe -fsSI -H "Host: fusiondigital.club" -H "Range: bytes=0-1023" `
  http://39.96.61.9/device-assets/iter-high-detail/v1/cs.d1a8a1b30b9da86cd5d428012c3ce599fb16eca0b4778da3507bd26ceba78cdb.high.meshopt.glb
```

第二个请求必须返回 `206` 和正确的 `Content-Range`。同时验证账户、审核、写 API、
直接模型路径仍返回 404。测试请求使用 Host 头直达 staging IP，不需要也不得改 DNS。

## 6. staging 回滚

安装器会在新版本启动失败时自动回滚。人工回滚只允许切换内地 staging 服务器上的
历史 release：

```bash
PREVIOUS=/srv/fusiondigital/releases/<KNOWN_GOOD_FULL_SHA>
test -f "$PREVIOUS/dist/server/index.js"
ln -s "$PREVIOUS" /srv/fusiondigital/current.next
mv -Tf /srv/fusiondigital/current.next /srv/fusiondigital/current
systemctl restart fusiondigital
curl -fsS -o /dev/null -H 'Host: fusiondigital.club' http://127.0.0.1/
```

该操作不授权修改生产 DNS。当前香港生产回滚仍按原生产手册执行。
