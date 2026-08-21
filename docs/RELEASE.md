# FusionDigital 生产发布、DNS 门禁与回滚

本手册是 `fusiondigital.club` 的唯一生产发布流程。任何机器或 Codex 都应先阅读根目录
[`AGENTS.md`](../AGENTS.md)，再执行本手册。香港服务器的首次安装、打包和 Nginx
细节见[阿里云香港公开匿名版部署](../deploy/aliyun-hk/README.md)。

## 1. 发布事实表

| 对象 | 唯一约定 |
| --- | --- |
| 协作事实源 | Codeup `master` |
| 公开镜像 | GitHub `main`，必须与 Codeup `master` 为同一完整 SHA |
| 生产域名 | `fusiondigital.club`、`www.fusiondigital.club` |
| 生产主机 | 阿里云香港 ECS `i-j6c5xpt6lvn9fdpujlt7` + 100 Mbps `BGP_PRO` 精品 EIP `47.75.119.239` |
| 生产模式 | `public-anonymous`，公开只读；身份、审核和写 API 关闭 |
| 生产部署 | 本地/CI 构建不可变包，经 SSH/SCP 安装到香港服务器 |
| Sites 定位 | 按需生成、独立且非阻塞的 `*.chatgpt.site` 预览/人工备用地址 |
| DNS 权威 | 阿里云 DNS；apex 与 `www` 的所有线路只能到 `47.75.119.239` |

`.openai/hosting.json` 是 Sites **预览项目**的资源声明，不是生产域名托管声明。

> 正式发布必须让 Codeup `master`、GitHub `main`、本地 `HEAD` 与香港 ECS release
> 使用同一个完整提交 SHA。Sites 预览不参与生产发布门禁。

Sites 保存或发布新版本不得触发 `fusiondigital.club` 的自定义域名绑定、验证或 DNS 修改。
所谓“人工备用”仅指故障时单独分享平台 URL，不代表自动或手工把生产 DNS 切到
Sites。

## 2. 多机器 Git 一致性

### 2.1 远端识别（不依赖机器别名）

不同机器可能把 Codeup 命名为 `origin` 或 `codeup`，GitHub 也可能使用其他别名。
操作前始终先核对：

```powershell
git remote -v
```

目标仓库必须分别是：

- Codeup：`git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git`（或同仓库 HTTPS URL）
- GitHub：`https://github.com/tianshao1992/fusion-digital.git`（或同仓库 SSH URL）

新机器从 Codeup 克隆后若尚无任何远端指向 GitHub，添加一次：

```powershell
git remote add github https://github.com/tianshao1992/fusion-digital.git
git remote -v
```

若已有其他别名指向同一 GitHub 仓库，直接保留并让脚本自动识别，不要再创建重复
远端；若 `github` 名称已被占用但 URL 不正确，也不要静默覆盖，应先人工核对。

`npm run release:sync-remotes` 会枚举远端并按准确仓库 URL 自动识别 Codeup 与
GitHub，不要求两台机器使用同一别名。如果一个机器配置了多个同仓库远端，或
自动识别存在歧义，应在当前终端显式指定别名：

```powershell
$env:FUSIONDIGITAL_CODEUP_REMOTE = "origin"  # 按 git remote -v 的事实修改
$env:FUSIONDIGITAL_GITHUB_REMOTE = "github"  # 按 git remote -v 的事实修改
npm run release:sync-remotes
```

不要仅凭 `origin` 这个名字判断仓库，也不要为统一别名删除已有远端或盲目执行
`set-url`。凭据、令牌和私钥不得写入 URL、环境变量值或文档。

### 2.2 每次工作前获取并处理其他机器的提交

```powershell
git status --short --branch
$CodeupRemote = "origin"  # 按 git remote -v 核对后填写
$GitHubRemote = "github"  # 按 git remote -v 核对后填写
git fetch --prune $CodeupRemote
git fetch --prune $GitHubRemote
git log --oneline --decorate --graph --all -30
```

Codeup `master` 是事实源。在本地没有独立提交且工作树干净时，可以快进：

```powershell
git switch master
git merge --ff-only "$CodeupRemote/master"
```

若本地、Codeup 或 GitHub 有彼此未包含的提交，停止发布，在独立分支或 worktree 中
审查并完成常规合并；禁止强推、重置共享历史或删除对方提交。工作树中已有修改和
未跟踪文件属于使用者，Codex 不得擅自清理、覆盖、暂存或提交。

### 2.3 发布提交同步

变更、审核和测试完成后，先提交到本地，再从**干净工作树**运行：

```powershell
npm run release:sync-remotes
```

若主工作区含与本次发布无关的用户修改或未跟踪文件，不要 stash、移动、删除或误提交。
从目标提交建立一次性 clean detached worktree，并在其中同步：

```powershell
$ReleaseSha = git rev-parse HEAD
$SyncWorktree = Join-Path ([System.IO.Path]::GetTempPath()) "fusiondigital-sync-$($ReleaseSha.Substring(0,12))"
git worktree add --detach $SyncWorktree $ReleaseSha
Push-Location $SyncWorktree
try {
  npm run release:sync-remotes
} finally {
  Pop-Location
}
```

验证完成后再使用 `git worktree remove $SyncWorktree` 清理该专用 worktree；先确认变量
仍指向刚创建的精确临时路径，不得对主工作区执行递归删除。

脚本会进行远端读取、祖先关系、两次 `push --dry-run` 和发布后 SHA 校验，然后使用
普通 refspec 把 `HEAD` 推送到识别出的 Codeup `master` 与 GitHub `main`。它不会
force，也不修改历史。任一步失败都要先处理远端变化，不能绕过门禁手工强推。

最后单独读取事实值：

```powershell
git rev-parse HEAD
git ls-remote git@codeup.aliyun.com:fiatlux/DT/FusionDigital.git refs/heads/master
git ls-remote https://github.com/tianshao1992/fusion-digital.git refs/heads/main
```

三处完整 SHA 不一致时，不得部署生产。

## 3. 固定生产发布顺序

每次生产发布严格遵循以下顺序：

1. **同步**：获取两个远端，处理另一台机器提交，并确认目标提交历史完整。
2. **校验**：在目标提交上运行生成器（如适用）、`npm run assets:verify:tracked` 和
   `npm run check`；敏感信息和第三方许可复核完成。
3. **镜像**：运行 `npm run release:sync-remotes`，确认 Codeup `master`、GitHub
   `main` 与本地 `HEAD` 为同一 SHA。
4. **隔离构建**：从目标 SHA 建立 detached worktree，补齐并校验 ITER 运行时资产，
   设置 `NEXT_PUBLIC_FUSIONDIGITAL_MODE=public-anonymous` 和
   `FUSIONDIGITAL_BUILD_TARGET=aliyun-hk` 后生成不可变香港发布包。
5. **SSH 部署**：把香港发布包上传到 `47.75.119.239`，安装到全新的 SHA release 目录，
   原子切换 `/srv/fusiondigital/current` 并重启服务。生产机不从 GitHub 拉资源，也不
   执行源码构建。必须调用版本化的 `deploy/aliyun-hk/install-release.sh`；
   安装器会校验 JS/CSS 无损 gzip sidecar、ITER/EFIT 受控路径，并在证书存在时恢复
   HTTPS/HTTP2，禁止直接复制 Nginx 配置绕过这些门禁。
6. **源站预检**：在改动 DNS 前，使用 IP + Host/SNI 验证新 release、Nginx、公开
   资源和匿名安全边界。
7. **DNS 硬门禁**：运行 `npm run release:verify-dns`，并检查阿里云 DNS 所有线路，
   确保两个名称只返回 `47.75.119.239`。
8. **公网验收**：验证香港双域名 TLS/HTTP、关键页面、搜索、模型清单、Range 请求和
   禁用接口，再用境内电信、联通、移动多节点拨测香港入口。
9. **留痕**：记录日期、完整 SHA、服务器 release 目录、包 SHA-256、生产 URL、验证
   结果和已知限制。

Sites 预览是独立、非阻塞步骤。只有用户明确要求时才生成，并且不得插入任何生产
DNS 操作，也不能代替香港构建、部署、DNS 与公网验收步骤。

### 3.1 内地 pre-ICP staging 不属于生产发布

阿里云内地 `39.96.61.9` 只用于备案前部署验证。它不得替换本手册事实表中的香港
生产主机，也不得进入 `deploy/production-contract.json` 的期望 A 记录。staging
验收必须使用 IP + `Host: fusiondigital.club`，不得为测试修改 apex、`www` 或任何
运营商/地域分线路 DNS。

内地生产切换是独立的基础设施变更，至少需要同时满足：

1. ICP 备案获批；
2. 网站页脚展示真实备案号并链接 `https://beian.miit.gov.cn/`；
3. 同一提交更新 `AGENTS.md`、生产合同、DNS 单测、发布手册和回滚方案；
4. Codeup `master`、GitHub `main`、本地 HEAD 与内地服务器 release 完整 SHA 一致；
5. 双域名证书、匿名安全边界、Range 请求及国内三网均通过验证。

在该变更提交完成前，生产仍是 `47.75.119.239`，现有 DNS 硬门禁不得放宽。具体 staging
流程见[阿里云内地备案前预部署](../deploy/aliyun-mainland/README.md)。

## 4. DNS 硬门禁

### 4.1 阿里云控制台必须满足

对 `@` 和 `www` 分别检查所有启用记录，而不只是“默认”线路：

- A 记录值只能是 `47.75.119.239`；推荐每个名称只保留一条默认线路 A 记录；
- 若保留电信、联通、移动、境内、境外等分线路，所有线路也必须指向同一 IP；
- 不得存在指向 `custom-domains.chatgpt.site` 或任何 Sites/Cloudflare 主机名的
  CNAME、ALIAS/ANAME；
- 不得存在旧香港轻量 A 记录 `47.82.66.79` 或旧 Cloudflare A 记录
  `162.159.143.30`、`172.66.3.26`；
- 不得存在把流量带往其他平台的 AAAA 记录；
- 域名所有权验证 TXT 可保留，它不参与 HTTP 路由；
- 建议 TTL 为 600 秒。修改后至少等待一个旧 TTL，再做最终拨测。

“一部分节点 200、另一部分节点 Cloudflare 403”通常表示分线路或递归 DNS 缓存
仍指向旧平台，不是前端代码故障。此时应修复 DNS，不能再次发布 Sites 来掩盖问题。

### 4.2 本机只读核验

版本化事实源是 [`deploy/production-contract.json`](../deploy/production-contract.json)。
它声明生产域名/IP、禁止目标，以及本机 advisory、无 ECS、全球回退、通用境内、
电信、联通、移动等探针。首先运行：

```powershell
npm run release:verify-dns
```

AliDNS no-ECS、全球回退 ECS `8.8.8.0/24`、通用境内 ECS 和电信/联通/移动 ECS
是跨机器一致的
**阻塞性硬门禁**：其中任一返回旧 Cloudflare/Sites、其他 A、任何 AAAA 或查询失败
都必须以非零状态退出。本机 `system-default` 只作 advisory，因为 Clash 等 VPN/代理
可能返回 `198.18.0.0/15` fake-IP；关闭 VPN/代理后可用它做人工无 VPN 复核，但它的
异常既不能导致不同机器得出相反发布结论，也不能掩盖可信 DoH 硬探针失败。

需要独立人工交叉检查时，以下 PowerShell 还会对多个递归解析器执行硬断言：

```powershell
$Expected = "47.75.119.239"
$Names = @("fusiondigital.club", "www.fusiondigital.club")
$Resolvers = @("223.5.5.5", "119.29.29.29", "1.1.1.1")

foreach ($Resolver in $Resolvers) {
  foreach ($Name in $Names) {
    $Addresses = @(
      Resolve-DnsName $Name -Type A -Server $Resolver -DnsOnly |
        Where-Object Type -eq "A" |
        Select-Object -ExpandProperty IPAddress -Unique
    )
    if ($Addresses.Count -ne 1 -or $Addresses[0] -ne $Expected) {
      throw "$Name via $Resolver resolved to: $($Addresses -join ', ')"
    }
  }
}
```

显式递归解析器不可达属于“未验证”，不能被当作通过。最终仍必须使用境内多运营商
节点复核；所有成功解析的节点都应到 `47.75.119.239`，不得出现旧源站或 Cloudflare 403。

## 5. 源站与公网验收

先绕过 DNS 验证源站证书和应用：

```powershell
curl.exe -fsSI --resolve "fusiondigital.club:443:47.75.119.239" https://fusiondigital.club/
curl.exe -fsSI --resolve "www.fusiondigital.club:443:47.75.119.239" https://www.fusiondigital.club/
```

再验证公开 DNS 路径：

```powershell
curl.exe -fsSI https://fusiondigital.club/
curl.exe -fsSI https://www.fusiondigital.club/
curl.exe -fsS "https://fusiondigital.club/api/search?q=tokamak&limit=5" | Out-Null
```

生产匿名边界至少应满足：

- 首页、搜索、公开模型/数据清单返回成功；
- ITER Range 请求返回 `206` 和 `Content-Range`；
- TLS 协商支持 HTTP/2，JS/CSS 在客户端声明 `Accept-Encoding: gzip` 时返回无损
  `Content-Encoding: gzip`；EFIT `.jsonl.gz` 保持 identity 编码并支持 Range；
- `/api/account`、`/api/research/runs`、`/signin-with-chatgpt`、`/callback` 返回
  `404`；伪造 `oai-authenticated-user-*` 请求头不能改变结果；
- 服务器 `readlink -f /srv/fusiondigital/current` 的 release ID 对应本次完整 SHA；
- 国内电信、联通、移动节点无系统性 DNS 失败、403 或 5xx。

任一硬门禁失败时，保留上一正常 release，停止宣布上线并记录失败证据。

## 6. Sites 预览规则

- Sites 只能发布到平台分配的 `*.chatgpt.site` 地址。
- Sites 预览只在用户明确要求时生成；其成功或失败不改变香港生产发布结论。
- Sites 平台地址可以用于视觉验收或香港服务器故障时的人工备用访问，但不是中国大陆稳定
  访问承诺，也不是生产 DNS 的回源。
- 禁止在 Sites 控制面添加 `fusiondigital.club` 或 `www.fusiondigital.club`；若已
  存在绑定，应先解除绑定，再确认阿里云 DNS 仍满足第 4 节。
- 禁止根据 Sites 的自定义域名引导创建 CNAME 或 Cloudflare A 记录。
- Sites 预览不得触发生产回滚、修改 DNS 或改变香港 release。

## 7. 回滚与故障恢复

### 7.1 应用回滚

在香港 ECS 上把 `/srv/fusiondigital/current` 原子切换到上一正常 release；重启
`fusiondigital`，重复源站与公网验收。不得删除故障 release，直到复盘和证据保留
完成。Sites 预览保持独立，不参与生产应用回滚。

### 7.2 DNS 漂移恢复

若解析再次出现 Sites/Cloudflare：

1. 截图或导出当前阿里云 DNS 记录，记录影响开始时间；
2. 将 `@`、`www` 的所有线路恢复为 `47.75.119.239`，删除冲突的 CNAME/AAAA/A；
3. 保留验证 TXT，等待旧 TTL；
4. 重跑第 4、5 节，并完成国内多运营商拨测；
5. 核查最近的 Sites 发布或域名操作，防止自动恢复自定义域名。

### 7.3 主机整体故障

优先修复/回滚香港主机。紧急情况下可以把 Sites 平台 URL 单独发给使用者，但不得
把 apex 或 `www` 重新指向 Sites/Cloudflare。任何生产主机或 IP 迁移都需要明确的
变更审批、双栈/证书/DNS 方案和回滚计划，不能被普通代码发布隐式触发。

## 8. 发布记录模板

```text
时间（Asia/Shanghai）：
发布人/执行 Codex：
Codeup master SHA：
GitHub main SHA：
服务器 release：
发布包 SHA-256：
DNS 检查（apex/www；解析器/节点）：
TLS/HTTP/公开能力/匿名边界：
国内电信/联通/移动拨测：
回滚 release：
已知限制：
```
