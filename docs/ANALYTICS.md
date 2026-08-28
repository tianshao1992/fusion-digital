# FusionDigital 匿名访问统计与管理员报表

本功能统计 `fusiondigital.club` 与 `www.fusiondigital.club` 的公开访问，同时保持香港
生产的 `public-anonymous` 信任边界。Sites 协作地址只承载签名入库与管理员报表，不开放
公共统计写接口。统计只描述匿名浏览器和会话行为，
不能也不得被解释为真实自然人身份、机构身份或实验装置用户身份。

## 1. 能看到什么

管理员报表位于 Sites 平台地址的 `/admin/analytics`，从 `/account` 的管理员入口进入。
页面与读取 API 都在服务端强制要求有效、未停用且具有 `admin` 角色的账户；隐藏导航
入口不是授权机制。香港公网对 `/admin/analytics`、统计查询 API、SIWC 登录和身份头
继续返回 404。

报表提供：

- 今日活跃浏览器（DAU）、近七日活跃浏览器（WAU）、本月活跃浏览器（MAU）、选定窗口 UV、PV 与会话数；
- 7 / 30 / 90 天 PV、UV、会话趋势；
- 平均参与时长、单页会话比例、星期和小时热力图；
- 热门页面、首页区段、数字样机、EFIT 炮号、知识节点与检索结果分桶；
- 采集来源、桌面 / 平板 / 手机粗粒度分布；
- 最近匿名会话的入口、退出和访问序列。

“访客”是浏览器本地产生的随机标识，不是人数。该标识留在同一浏览器本地，以避免
跨月 WAU、MAU 和 30/90 天 UV 重复计数；香港 loopback collector 在任何落盘前即使用
root-only 密钥按 `event`、`visitor`、`session` 三个独立 scope 做 HMAC。会话在 30 分钟
无活动后轮换，D1 脱敏事件受 120 天清理边界约束。因此这些
指标仍是隐私优先、客户端报告并经滥用过滤的近似运营指标：跨浏览器、清理存储、隐私
模式与多设备会被分别计数，自动化客户端也可能伪造事件。不得用于审计、计费、安全
判断或识别自然人。

## 2. 明确不采集什么

客户端、Nginx 与 collector 落盘记录均不保存：

- IP 地址、完整 User-Agent、Cookie、邮箱、SIWC subject 或账户 ID；
- URL 查询串、搜索词、智能体问题、自由文本、模型提示词或回答；
- 完整 referrer URL 或主机名；只保留 `search:google`、`ai:chatgpt`、`code:github`、
  `social:wechat`、`other` 等固定来源分类；IP、内网主机和未知深层域名统一为 `other`；
- EFIT 每帧拖动、鼠标轨迹、按键内容或表单输入。

路径只能来自代码中的公开路由白名单；内容键还必须匹配对应页面和事件类型的语义
白名单。知识图谱节点上传的是公开节点 ID 的固定短摘要（不发送原始 ID），报表端只用
版本内的公开目录映射展示标签。统计 POST 明确使用 `credentials: omit` 与
`Referrer-Policy: no-referrer`，
不会携带账户 Cookie 或页面 URL。浏览器设置 `Do Not Track: 1` 或 Global Privacy
Control 时不会创建标识或发送事件。D1 原始脱敏事件目标保留 120 天，写入及管理员读取
时都会执行惰性清理；完全停流期间旧行会在下一次触发时删除。报表只开放最长 90 天
窗口；没有浏览器本地统计数据库或模拟回退。

## 3. 两个部署平面如何协作

```text
fusiondigital.club browser
  -> same-origin POST /api/analytics/events
  -> Nginx rate/body limit + no access log or x-fd header forwarding
  -> 127.0.0.1 collector: strict JSON/Origin/semantic validation
  -> in-memory event/visitor/session scoped HMAC
  -> dedicated 0640 JSONL + five-minute signed forwarder
  -> Sites /api/analytics/ingest
  -> D1 analytics_events
  -> Sites /api/analytics/report (server-side admin role required)
  -> /admin/analytics ECharts dashboard
```

香港浏览器不请求 Sites、D1 或其他跨域上游；转发失败也不会阻塞公开页面。Nginx 只把
4 KiB 内的 JSON body、Origin 与 Content-Type 代理给 `127.0.0.1:3101`，不传 Cookie、
User-Agent、referrer、IP、`X-Forwarded-*` 或旧 `x-fd-*` 头，并关闭该 location 的 access
log。collector 只接受两个正式 Origin 和精确字段/语义白名单；未知字段、自由文本、非法
UTF-8 与错误值只在内存中拒绝，既不进入日志也不写入错误消息。只有三类标识完成 scope
HMAC 后才追加 JSONL 并返回 204。

项目自有 logrotate 合同以 `0640 fusionanalytics:fusionanalytics` 创建文件，保留 8 个
不压缩日轮转；collector 每次追加重新打开文件，转发器可按 inode 顺序恢复。专用非 root
用户没有 `adm` 等补充组。转发器每次先执行无污染 HMAC 探针，再拆分多个 250 条批次追赶
积压；仅在全部批次收到 HTTP 202 后原子推进游标，重复批次由事件主键幂等去重。

## 4. 数据库与本地验证

数据库变化必须保留生成的 Drizzle migration：

```powershell
npm run db:generate
npm run db:local:migrate
npm run db:local:verify
npm run check
```

本地或 Sites 中的账户首次登录后只自动获得 `member`。仓库当前没有开放公网角色授予
页面；站点所有者必须在受控的 Sites / D1 管理面以准确 `user_id` 完成带审计的带外
`admin` 授权。不得根据邮箱、请求头、URL 参数或“第一个注册用户”自动授予。所有统计
读取接口仍会再次执行 `requireRole(["admin"])`，账户被停用或角色撤销后立即拒绝。

## 5. 正式启用香港转发

启用前必须先完成同一完整 SHA 的香港 + Sites 正式配对发布，并确认 D1 migration 已
生效。生成一个至少 32 字节的随机 base64url 密钥；同一值分别保存为：

- Sites 加密 Secret：`FUSIONDIGITAL_ANALYTICS_INGEST_SECRET`；
- 香港 root-only 文件 `/etc/fusiondigital/analytics.env`。

真实值绝不能进入 Git、命令历史、聊天、日志或发布包。先安全建立目录并用编辑器写入，
不要把真实值放在 shell 命令行：

```bash
sudo install -d -m 700 -o root -g root /etc/fusiondigital
sudoedit /etc/fusiondigital/analytics.env
```

香港文件格式只有一行：

```text
FUSIONDIGITAL_ANALYTICS_INGEST_SECRET=<base64url-secret>
```

然后在服务器执行：

```bash
sudo chown root:root /etc/fusiondigital/analytics.env
sudo chmod 600 /etc/fusiondigital/analytics.env
sudo /srv/fusiondigital/current/deploy/aliyun-hk/install-analytics-forwarder.sh
sudo systemctl status fusiondigital-analytics-collector.service --no-pager
sudo systemctl status fusiondigital-analytics-forwarder.timer --no-pager
```

安装器只读取固定 Sites ingest URL，不接受运行时自定义目的地；它校验环境文件、日志
及轮转权限，把 collector/forwarder 安装到独立于应用 `current` 回滚链接的版本目录，
先启动并探测 loopback collector，再完成真实 TLS + HMAC 探针，最后才启用 timer。单位
文件、runtime 链接、logrotate 与原有启用/运行状态在同一失败回滚事务中恢复。撤销时先
停用 timer 和 collector，再从 Sites 删除 Secret；不要删除日志来代替正常保留策略。
主 release 切换与此可选 Secret 安装不能组成同一个跨平台事务，因此二者之间统计 POST
可能暂时得到 502；浏览器会静默忽略且公开页面不受影响，但在 collector probe 与本节
公网 204 smoke test 通过前，不得宣布访问统计已经发布完成。

## 6. 发布验收

正式发布仍须遵守 [`RELEASE.md`](RELEASE.md) 的完整 SHA、香港、Sites、DNS 和配对
证据门禁，并额外确认：

1. `fusiondigital.club/admin/analytics` 与 `/api/analytics/report` 对公网为 404；
2. 页面访问产生的 `/api/analytics/events` 为 204，不向应用 Node 转发，collector 仅监听 `127.0.0.1:3101`；
3. collector 与 forwarder timer 正常，日志中没有密钥、原始 event/visitor/session ID 或身份字段；
4. Sites 普通成员无法读取报表，`admin` 可以读取且空库显示“暂无记录”；
5. 报表的 `club` 来源总数与脱敏事件抽样一致，响应不含完整 visitor/session ID；
6. 关闭转发器或暂时断开 Sites 时，公开页面仍正常加载且无跨域请求失败。

任何一步失败都只能说明统计功能未启用或未完成，不能据此改动生产 DNS、信任身份头
或把香港运行模式切出 `public-anonymous`。
