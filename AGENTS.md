# FusionDigital Codex 协作与生产发布约束

本文件对仓库根目录及全部子目录生效。任何机器上的 Codex、自动化代理或人工维护者
在修改、同步或发布本项目之前，都必须遵守以下规则。详细步骤见
[`docs/RELEASE.md`](docs/RELEASE.md) 和
[`deploy/aliyun-hk/README.md`](deploy/aliyun-hk/README.md)。

## 1. 不可变的生产拓扑

- 唯一生产入口是 `https://fusiondigital.club/` 和
  `https://www.fusiondigital.club/`。
- 两个名称必须由阿里云 DNS 解析到阿里云香港 ECS
  `i-j6c5xpt6lvn9fdpujlt7` 的 100 Mbps `BGP_PRO` 精品 EIP
  `47.75.119.239`，运行模式必须是 `public-anonymous`。
- OpenAI Sites 只使用其平台分配的 `*.chatgpt.site` 地址，不是 `fusiondigital.club`
  的生产源站或 DNS 备用源站；但每次正式发布必须把与香港 release 相同的完整提交
  SHA 同步部署到该平台地址。
- `.openai/hosting.json` 只声明 Sites 预览项目资源，不授予修改生产域名或 DNS 的
  权限。
- 严禁把 `fusiondigital.club` 或 `www.fusiondigital.club` 绑定到 Sites，严禁创建或
  恢复指向 `custom-domains.chatgpt.site`、Cloudflare 或其他托管平台的 A、AAAA、
  CNAME、ALIAS/ANAME 记录。
- 已知旧香港轻量地址 `47.82.66.79` 和旧 Cloudflare 地址 `162.159.143.30`、
  `172.66.3.26` 不得出现在任何线路的
  生产解析中。阿里云 DNS 的默认、电信、联通、移动、境内、境外等分线路记录必须
  删除或全部指向 `47.75.119.239`；不能只修正其中一条线路。

### 1.1 阿里云内地备案前 staging

- `39.96.61.9` 仅是 Alibaba Cloud Linux 3 的 **pre-ICP staging** 地址，不是生产
  地址，不得写入 `deploy/production-contract.json` 的生产 A 记录，不得为它切换
  `fusiondigital.club`、`www` 或任何分线路 DNS。
- staging 只能按 [`deploy/aliyun-mainland/README.md`](deploy/aliyun-mainland/README.md)
  通过 IP + `Host` 头验收；不得把它描述为已经上线或国内生产可用。
- 只有 ICP 备案获批、网站页脚展示真实备案号、生产合同/DNS 测试/发布文档与回滚
  方案在同一提交中更新并通过审核后，才能另行执行生产 DNS 迁移。在该提交生效前，
  本文件中的香港生产不变量与 `47.75.119.239` DNS 硬门禁继续完整有效。
- `aliyun-mainland` 与 `aliyun-vm` 是自包含公开匿名构建目标；`aliyun-hk` 必须保留为
  当前生产和回滚兼容目标。三者都必须使用 `public-anonymous`，不得借 staging 开启
  身份、审核、写 API、D1 或任意客户端指定的资产上游。

## 2. Git 事实源

- Codeup `master` 是唯一协作事实源；GitHub `main` 是同一提交的公开镜像。
- 正式发布时 Codeup `master`、GitHub `main`、本地 `HEAD`、香港 ECS release 和
  OpenAI Sites source 必须是同一个完整提交 SHA；任一端未成功都不得宣布发布完成。
  Git 远端别名可因机器不同而变化，操作前必须先用
  `git remote -v` 核对 URL。同步脚本会枚举远端并按准确仓库 URL 自动识别；有
  歧义时使用 `FUSIONDIGITAL_CODEUP_REMOTE` 与 `FUSIONDIGITAL_GITHUB_REMOTE`
  显式指定，不得凭别名猜测。
- 开始工作前先获取 Codeup `master` 和 GitHub `main`。另一台机器已有提交时，先
  审查并纳入本地历史；不得凭缓存分支覆盖远端。
- 不得强推、重写共享历史或为“保持一致”删除远端提交。远端发生分叉时停止发布，
  在独立分支/worktree 中完成可审核的合并。
- 工作树中已有修改和未跟踪文件属于使用者。不得清理、覆盖、暂存或提交与当前任务
  无关的文件。

## 3. 固定发布顺序

1. 核对仓库、分支、工作树与远端 URL，获取两个远端并处理其他机器的更新。
2. 在准备发布的精确提交上运行资产校验和 `npm run check`。
3. 仅在干净工作树中运行 `npm run release:sync-remotes`，确认 Codeup `master` 与
   GitHub `main` 都等于该提交。若主工作区含无关的用户修改/未跟踪文件，应从目标
   SHA 创建专用 clean detached worktree 执行；不得为发布而 stash、移动或删除它们。
4. 从该提交创建两个 detached worktree：按香港部署手册构建
   `NEXT_PUBLIC_FUSIONDIGITAL_MODE=public-anonymous` 且
   `FUSIONDIGITAL_BUILD_TARGET=aliyun-hk` 的不可变发布包；同时使用
   `FUSIONDIGITAL_BUILD_TARGET=sites` 生成 Sites 官方归档。香港目标仅免除 Sites 包体
   上限，不得放宽匿名安全边界或资产完整性检查；两个归档必须来自同一完整 SHA。
5. 通过 SSH/SCP 上传到 `47.75.119.239`，安装到新的 release 目录，原子切换
   `/srv/fusiondigital/current`；不得在生产 ECS 上构建源码。
6. 先用 IP + Host/SNI 验证服务，再运行
   `npm run release:verify-dns` 执行版本化 DNS 合同硬门禁；
   AliDNS no-ECS、全球兜底、通用境内与国内三网硬探针不合格时不得宣布上线。本机
   `system-default` 仅作 advisory，关闭 VPN/代理后用于人工复核；Clash 等产生的
   `198.18.0.0/15` fake-IP 不能掩盖可信 DoH 硬探针的失败。
7. 香港验收通过后，把同一 SHA 的 Sites 归档保存并公开部署到固定项目，只使用平台
   分配的 `*.chatgpt.site` 地址；不得创建或恢复生产域名绑定。
8. 先比较合同固定清单中的两端共享资产，完成双域名 TLS/HTTP、匿名安全边界、可信
   DNS 与境内电信、联通、移动节点检查；再把逐路径字节数/SHA-256、报告摘要及 Git、
   香港 active release、Sites succeeded deployment 证据写到仓库外。最后在干净工作树
   运行 `npm run release:verify-pair -- --evidence <path>`。任一检查失败都不得完成发布。

应用回滚只切换香港 ECS 上的旧 release。禁止把生产域名“回滚”到旧轻量服务器、
Sites 或 Cloudflare；服务器故障期间可单独分享 Sites 平台预览地址，但不得自动改动
生产 DNS。

## 4. Codex 操作门禁

- 当用户要求“发布/部署 `fusiondigital.club`”时，默认且唯一流程是阿里云香港 SSH
  部署；不得调用 Sites 自定义域名绑定流程。
- 正式发布必须同步更新 Sites 平台地址；单独的临时预览仍需用户明确要求。任何 Sites
  操作都不得创建、验证、绑定、恢复或建议修改 apex/`www` 的 DNS。
- 以下任一条件成立时必须停止生产发布并说明原因：两个远端 SHA 不一致、工作树不
  干净、构建/测试失败、服务器 release SHA 无法核对、Sites source/deployment SHA
  无法核对或不同步、任一可信 DNS 硬探针不是
  `47.75.119.239`、境内
  节点出现系统性 403/5xx、证书验证失败。本机系统解析若受 fake-IP 影响应明确标注
  advisory，不得误报为真实公网地址。
- 不在命令、文档、Git URL、日志或提交中保存密码、私钥、Cookie、临时令牌和阿里云
  凭证。涉及验证码、付款、实名、删除或域名所有权变更时由用户本人确认。
