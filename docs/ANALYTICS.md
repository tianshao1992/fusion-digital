# FusionDigital 匿名访问统计与管理员报表

本功能统计 `fusiondigital.club` 与 `www.fusiondigital.club` 的公开访问，同时保持香港
生产的 `public-anonymous` 信任边界。脱敏事件的权威存储位于香港 ECS 本机；Sites
协作地址只在服务端完成管理员鉴权并读取签名聚合报表，不开放公共统计写接口。统计只
描述匿名浏览器和会话行为，不能也不得被解释为真实自然人、机构或实验装置用户身份。

## 1. 能看到什么

管理员报表位于 Sites 平台地址的 `/admin/analytics`，从 `/account` 的管理员入口进入。
页面与读取 API 都在服务端强制要求有效、未停用且具有 `admin` 角色的账户；隐藏导航
入口不是授权机制。香港公网对 `/admin/analytics`、`/api/analytics/report`、SIWC 登录
和身份头继续返回 404。

报表提供：

- 今日活跃浏览器（DAU）、近七日活跃浏览器（WAU）、本月活跃浏览器（MAU）、选定窗口 UV、PV 与会话数；
- 7 / 30 / 90 天 PV、UV、会话趋势；
- 平均参与时长、单页会话比例、星期和小时热力图；
- 热门页面、首页区段、数字样机、EFIT 炮号、知识节点与检索结果分桶；
- 采集来源、桌面 / 平板 / 手机粗粒度分布；
- 最近匿名会话的入口、退出和访问序列。

“访客”是浏览器本地产生的随机标识，不是人数。该标识留在同一浏览器本地，以减少
跨月 WAU、MAU 和 30/90 天 UV 重复计数；会话在 30 分钟无活动后轮换。香港 loopback
collector 在任何落盘前即使用香港专用匿名化密钥按 `event`、`visitor`、`session` 三个独立
scope 做 HMAC；写入 SQLite 前再生成固定 24 字符不可逆标识。因此这些指标仍是隐私
优先、客户端报告并经滥用过滤的近似运营指标：跨浏览器、清理存储、隐私模式与多设备
会被分别计数，自动化客户端也可能伪造事件。不得用于审计、计费、安全判断或识别人。

## 2. 明确不采集什么

collector 日志、SQLite 与任何应用日志均不保存下列数据。Nginx 只在进程共享内存中短暂
使用来源 IP 做限流，统计 location 的 access log 已关闭；IP 不会被转发或持久化：

- IP 地址、完整 User-Agent、Cookie、邮箱、SIWC subject 或账户 ID；
- URL 查询串、搜索词、智能体问题、自由文本、模型提示词或回答；
- 完整 referrer URL 或主机名；只保留 `search:google`、`ai:chatgpt`、`code:github`、
  `social:wechat`、`other` 等固定来源分类；IP、内网主机和未知深层域名统一为 `other`；
- EFIT 每帧拖动、鼠标轨迹、按键内容或表单输入。

路径只能来自代码中的公开路由白名单；内容键还必须匹配对应页面和事件类型的语义
白名单。知识图谱节点上传的是公开节点 ID 的固定短摘要，不发送原始 ID；collector 用
当前 release 生成的只读映射展示标签。统计 POST 明确使用 `credentials: omit` 与
`Referrer-Policy: no-referrer`，不会携带账户 Cookie 或页面 URL。浏览器设置
`Do Not Track: 1` 或 Global Privacy Control 时不会创建标识或发送事件。

SQLite 脱敏事件保留 120 天，启动、写入、报表读取及每小时维护都会触发清理；完全停流
期间也由运行中的 collector 定时清理。报表只开放最长 90 天窗口。数据库通过 SQLite
`max_page_count` 设定约 1 GiB 上限；达到容量或发生写入错误时 collector 健康检查转为
503 并退出等待 systemd 重启，不会静默返回陈旧成功。没有浏览器本地统计数据库、模拟
数据或身份反查接口。

## 3. 两个部署平面如何协作

```text
fusiondigital.club browser
  -> same-origin POST /api/analytics/events
  -> Nginx rate/body limit + access_log off
  -> 127.0.0.1 collector: strict JSON/Origin/semantic validation
  -> scoped HMAC JSONL short journal + second-HMAC local SQLite (120 days)

Sites /api/analytics/report
  -> requireRole(["admin"])
  -> signed POST https://fusiondigital.club/__fusiondigital_analytics_report_v1
  -> Nginx exact route -> loopback collector -> aggregate-only signed response
  -> response HMAC + schema validation -> /admin/analytics ECharts dashboard
```

香港浏览器不请求 Sites、D1 或其他跨域上游；公开页面不会因 Sites 不可达而变慢。Nginx
只把 4 KiB 内的 JSON body、Origin 与 Content-Type 代理给 `127.0.0.1:3101`，不传 Cookie、
User-Agent、referrer、IP、`X-Forwarded-*` 或客户端 `x-fd-*` 头，并关闭该 location 的
access log。collector 只接受两个正式 Origin 和精确字段/语义白名单；未知字段、自由文本、
非法 UTF-8 与错误值只在内存中拒绝，既不进入日志也不写入错误消息。

报表桥是独立的精确 TLS 路径，不进入香港应用 Node。它使用独立、可轮换的桥接密钥；
请求和响应再使用不同的派生 HMAC
密钥，并绑定方法、路径或状态、正文摘要、五分钟时戳及一次性 nonce；collector 持久化
nonce 防重放，Sites 在解析 JSON 前验证响应签名、大小和 schema。知道路径但没有密钥的
请求不能读取聚合数据。浏览器永远不会获得桥接密钥，也不会直接请求该路径。

项目自有 logrotate 合同以 `0640 fusionanalytics:fusionanalytics` 创建文件，保留 8 个
不压缩轮转段；collector 每次追加重新打开文件，启动时按旧到新顺序流式、幂等补写
SQLite。该 JSONL 只用于短期崩溃/安装恢复，不是完整 120 天备份。SQLite 位于
`/var/lib/fusiondigital-analytics/analytics.sqlite`，目录和数据库仅专用服务用户可访问，
采用 WAL、`synchronous=FULL`、`secure_delete=ON`、定期清理与 checkpoint。

当前没有异地主机级统计备份；ECS 整机或系统盘丢失可能丢失历史统计。新增加密异地备份
必须作为单独的隐私、密钥与恢复方案审核，不能把数据库直接放入 Git、Sites 或发布包。

## 4. 数据库与本地验证

Sites D1 仍承载账户、角色、配额、审计和其他控制面数据；已提交的
`analytics_events` migration 作为旧版本兼容保留，但新统计事件不再写入 D1。数据库与
仓库检查仍必须运行：

```powershell
npm run db:generate
npm run db:local:migrate
npm run db:local:verify
npm run check
```

测试会把相同夹具写入 D1 兼容实现和香港 SQLite，实现 7 / 30 / 90 天报表逐字段等价
检查；这不改变香港 SQLite 的生产权威边界。

本地或 Sites 中的账户首次登录后只自动获得 `member`。仓库没有开放公网角色授予页面；
站点所有者必须在受控的 Sites / D1 管理面以准确 `user_id` 完成带审计的带外 `admin`
授权。不得根据邮箱、请求头、URL 参数或“第一个注册用户”自动授予。所有统计读取接口
仍会再次执行 `requireRole(["admin"])`，账户被停用或角色撤销后立即拒绝。

## 5. 正式启用香港本地统计与报表桥

启用前必须先完成同一完整 SHA 的香港 + Sites 正式配对发布。生成两个彼此独立、至少
32 字节的随机 base64url 密钥：

- 稳定匿名化密钥 `FUSIONDIGITAL_ANALYTICS_PSEUDONYM_SECRET`：只保存于香港 root-only 文件；
- 可轮换报表桥密钥 `FUSIONDIGITAL_ANALYTICS_REPORT_SECRET`：同一值保存于 Sites 加密 Secret
  与香港 root-only 文件。

旧版本的 `FUSIONDIGITAL_ANALYTICS_INGEST_SECRET` 只可在短期回滚兼容期继续留在香港文件，
新代码不会读取它；Sites 不应继续保存该旧 Secret。真实值绝不能进入 Git、命令历史、
聊天、日志或发布包。先安全建立目录并用编辑器写入，不要把真实值放在 shell 命令行：

```bash
sudo install -d -m 700 -o root -g root /etc/fusiondigital
sudoedit /etc/fusiondigital/analytics.env
```

香港文件至少包含以下两行；处于旧 release 回滚兼容期时可额外保留一行旧 `INGEST` 值：

```text
FUSIONDIGITAL_ANALYTICS_PSEUDONYM_SECRET=<hk-only-base64url-secret>
FUSIONDIGITAL_ANALYTICS_REPORT_SECRET=<shared-report-base64url-secret>
```

正式应用安装器会自动调用统计安装器。首次发布前先完成文件权限；下列显式调用只用于
单独修复或幂等复核：

```bash
sudo chown root:root /etc/fusiondigital/analytics.env
sudo chmod 600 /etc/fusiondigital/analytics.env
sudo /srv/fusiondigital/current/deploy/aliyun-hk/install-analytics-forwarder.sh
sudo systemctl status fusiondigital-analytics-collector.service --no-pager
sudo systemctl is-enabled fusiondigital-analytics-forwarder.timer && exit 1 || true
```

安装器文件名为兼容旧 runbook 而保留；当前安装器不会安装 forwarder 或 timer。它校验
环境文件、日志、数据库和轮转权限，生成与当前 release 绑定的内容标签映射，把 collector
runtime 安装到独立于应用 `current` 回滚链接的不可变版本目录，备份并检查现有 SQLite，
再启动 loopback collector 并执行签名报表探针。旧 forwarder/timer 会被停用并删除。
unit、runtime 链接、logrotate、数据库快照与原有启用/运行状态在同一失败回滚事务中恢复。

本机 SQLite 会保存匿名化密钥指纹；直接更改该密钥会 fail closed，避免同一浏览器被
静默重新编号。匿名化密钥更换必须先制定经批准的数据迁移或明确的统计历史重置方案，
不得直接编辑后重启，也不得删除数据库来绕过门禁。报表桥密钥与持久标识解耦，可以在
先更新香港、再更新 Sites 并完成短维护窗口验证后轮换，不会重编号历史访客。

香港 release、collector 与本机 Secret 校验属于同一回滚事务；Sites Secret 和 Sites
deployment 仍是独立平台操作。两端切换窗口内报表可能暂时得到 502，collector 尚未健康
时统计 POST 也可能得到 502/503；浏览器会静默忽略且公开页面不受影响。但在本节安装
探针与下节验收通过前，不得宣布访问统计已经发布完成。

## 6. 发布验收

正式发布仍须遵守 [`RELEASE.md`](RELEASE.md) 的完整 SHA、香港、Sites、DNS 和配对
证据门禁，并额外确认：

1. `fusiondigital.club/admin/analytics` 与 `/api/analytics/report` 对公网为 404；
2. 页面访问产生的 `/api/analytics/events` 为 204，不向应用 Node 转发，collector 仅监听 `127.0.0.1:3101`；
3. collector 正常，旧 forwarder/timer 不存在且未启用，日志中没有密钥、原始 event/visitor/session ID 或身份字段；
4. 本机签名报表探针通过，SQLite `quick_check` 为 `ok`，文件和 WAL/SHM 均不向组/其他用户开放；
5. Sites 普通成员无法读取报表，`admin` 可以读取且空库显示“暂无记录”；
6. 报表的 `club` 来源总数与脱敏事件抽样一致，响应不含完整 visitor/session ID；
7. 暂停 collector 或使 Sites 无法读取报表时，公开页面仍正常加载且无跨域请求失败。

任何一步失败都只能说明统计功能未启用或未完成，不能据此改动生产 DNS、信任身份头
或把香港运行模式切出 `public-anonymous`。
