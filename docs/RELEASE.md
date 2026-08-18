# FusionDigital 发布与回滚

## 1. 远端职责与正式入口

- `codeup`：Codeup 协作主仓库（SSH），作为团队协作与国内恢复基线。
- `github`：GitHub 公开镜像，用于外部协作、Pull Request 和 CI。
- Sites 内部源仓库：仅使用发布时生成的短期凭据，不保存为长期 Git 远端。

正式访问入口是 <https://fusiondigital.club/>；Sites 平台地址仅作为托管回源和故障排查入口。域名的 DNS、所有权验证和 TLS 状态由阿里云 DNS 与 Sites 控制面管理，不写入 `.openai/hosting.json`。

`codeup/master` 是 Codeup 协作事实基线。每次正式发布后，`codeup/master`、`github/main` 和 Sites 版本记录的提交 SHA 必须完全一致；Codeup 的旧 `main` 仅作迁移期兼容，不作为新发布输入。

## 2. 双远端一致性同步

不要分别手工推送两个仓库。完成变更、测试和提交后，在干净工作树中运行：

```powershell
npm run release:sync-remotes
```

该命令固定执行普通（非 force）推送 `git push codeup HEAD:master` 和 `git push github HEAD:main`。推送前，它会拒绝以下任一情况：

- 工作树含已跟踪或未跟踪的未提交文件；
- `codeup/master` 或 `github/main` 含当前 `HEAD` 尚未纳入的提交；
- 预检两次读取的远端目标分支不一致，或本地 `HEAD` 在同步过程中发生变化。

两个远端都通过读取、祖先关系和 `git push --dry-run` 写入预检后才开始推送；推送结束后使用 `git ls-remote` 再次读取两个目标分支，并要求二者都精确等于开始时记录的本地 `HEAD`。脚本不使用 force、不修改 Git 历史，也不读取、拼接或输出远端 URL 和凭据。若命令失败，先人工检查并合并远端变化，不要绕过保护直接强推。

## 3. 发布前条件

- Pull Request 已合并，必要的科学和软件审核均完成。
- `npm run research:ai`、`npm run research:control` 与 `npm run research:diagnostics` 没有产生未提交差异。
- `npm run check` 通过。
- 关键报告、JSON、CSV 和图片存在且非空。
- 公开站点内容已经完成敏感信息与第三方许可复核。
- 当前工作区干净，发布者记录精确提交 SHA。

## 4. Sites 发布

生产发布应通过 Codex 的 Sites 托管流程完成：

1. 从目标提交进行生产构建。
2. 使用短期、单次命令认证把同一提交推送到 Sites 内部源仓库。
3. 打包同一提交产生的 `dist/`，确认入口、托管声明和下载资产完整。
4. 保存 Sites 版本。
5. 经公开发布确认后部署该已保存版本。
6. 等待部署状态成功，并确认 `https://fusiondigital.club/` 的 DNS、TLS 和 HTTP 状态正常。
7. 在干净工作树中运行 `npm run release:sync-remotes`，把同一精确提交同步到 Codeup 与 GitHub，再在变更记录或 GitHub Release 中记录日期、提交、主要内容和已知限制。

不得把 Sites 临时令牌写入远端 URL、Git 配置、GitHub Actions、脚本、日志或文档。GitHub CI 只验证，不直接持有生产发布权限。

## 5. 回滚

发现严重错误时：

1. 立即停止新的内容合并和发布。
2. 在 Sites 中重新部署最近一个已知正常的已保存版本。
3. 在 GitHub 创建修复 Issue，记录影响页面和开始时间。
4. 从 `master` 创建修复分支，不在生产远端直接修改历史。
5. 修复通过审核和 CI 后发布新版本。

回滚站点不会自动撤销已经下载的报告或对外传播内容。若涉及敏感信息或凭证，先执行撤销、轮换和通知流程。

## 6. 发布节奏

- 普通内容：合并后按批次发布。
- 装置状态或重要链接修正：审核后尽快发布。
- 大型报告/图版：独立版本发布，避免与无关页面变更混合。
- 安全修复：最小范围、优先回滚、随后补充完整复盘。

## 7. 二进制资产

当前仓库含大型 DOCX/PDF/PNG。频繁替换会快速增加 Git 历史。近期保持实际文件进入 Sites 构建包；中期应评估版本化对象存储或发布附件，同时确保生产包拿到真实文件而不是 Git LFS 指针。
