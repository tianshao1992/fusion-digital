# TORAX 远程计算与本机计算节点

网页提交参数和结构化输入，指定计算节点执行固定版本 TORAX，成功后返回时序和二维显示投影。计算代码、Python/JAX 环境、原生 NetCDF 和日志保留在计算节点。公开网站保持 `public-anonymous`，仅客户端连接独立鉴权网关，不增加匿名计算写 API。

## 已实现的用户流程

1. 在 `/simulations?engine=torax` 选择算例，进入“配置与运行”。
2. 设置模拟时长、径向网格、加热倍率、CPU 核数和墙钟超时。
3. 可导入 `torax-run-upload.v1` 运行包；FUSE 剖面传递案例另支持导入该节点发布的 `core-profile-snapshot.v1` JSON，或直接读取节点已有 FUSE 剖面。节点不接受自行修改或仅自报来源的剖面。
4. 填写计算节点地址与令牌，连接后点击“上传并启动计算”。
5. 查看真实状态、刷新或取消。成功后“查看新计算结果”显示该次计算的剖面、时序与 R–Z 映射，可下载结果和任务回执。
6. 刷新页面后输入令牌，连接并恢复已保存的任务编号；也可手动输入任务编号。切换结果/参数标签不会卸载正在跟踪的任务。

访问令牌只存在于页面内存。浏览器 sessionStorage 只记录任务编号、节点地址和运行规格，不记录令牌或上传剖面。断线不等于计算取消。提交响应不确定时保留原请求和幂等键，重试确认同一任务。幂等映射目前仅在网关进程中保留；重启后按已知任务编号恢复，不能在未知受理结果时盲目重新提交。本轮没有引入持久化队列或多租户调度。

## 当前 Windows 计算节点

默认独立端口为 **8792**，保留已有 8791 服务。启动：

```powershell
pwsh -File D:\Code\FusionDigital\scripts\simulations\start-compute-node.ps1
```

启动器后台运行网关，检测精确端口、验证鉴权目录，并把随机令牌用当前 Windows 用户的 DPAPI 加密保存到 Git 忽略的 `work/compute-node-8792`。不会输出明文令牌。需要在前端粘贴时执行：

```powershell
pwsh -File D:\Code\FusionDigital\scripts\simulations\start-compute-node.ps1 -CopyToken
```

在前端填写 `http://127.0.0.1:8792`，粘贴令牌。节点持续运行到进程退出或电脑关机；重启电脑后再次运行启动器。当前实现没有安装开机服务。保留同一个受保护令牌时，启动器可重复执行并检查已有服务。

允许来源默认包括本地 3012/5177、两个正式香港域名和已核对的 Sites 平台 origin。可用 `-Origins` 显式指定精确列表。公开 HTTPS 页面访问本机受浏览器 Local Network Access/PNA 策略控制，用户可能需要授权本地网络访问；无需关闭浏览器安全设置。

## 其他服务器与 HTTPS

在目标 Linux 节点部署同一提交的网关代码及固定 TORAX 环境，配置 `TORAX_WORKSPACE`、`GATEWAY_TOKEN`、`GATEWAY_ORIGINS`、`GATEWAY_PORT`，运行 `npm run simulation:gateway`。默认 Python 路径为节点工作区 `.venv-wsl/bin/python`；Windows 使用 WSL Ubuntu，Linux 直接启动 Python。节点环境、配方和运行输出不来自 HTTP 路径参数。

远端入口必须使用有效 HTTPS 反向代理或已鉴权的私有隧道，代理到计算节点回环端口。网关始终监听 127.0.0.1；前端只接受 HTTPS origin 或本机 HTTP。保留 Authorization/Origin/Idempotency-Key；不记录 Authorization，不缓存 `/v1/*`。配置 `GATEWAY_ALLOWED_HOST` 可允许一个精确代理 Host。TLS、企业身份及节点网络入口由部署环境提供，本次没有创建新的公网计算域名。

与 FUSE 共用网关、Origin/Host/令牌校验及每个网关进程内的单任务并发限制。两个适配器各自保留工作区磁盘 lease；网关重启不能作为删除 lease 或终止计算进程的依据。

## 上传和结果合同

- 运行包：`{schema: "torax-run-upload.v1", spec, snapshot}`。普通配方的 snapshot 必须为 null。
- 剖面：Te/Ti 使用 eV，ne 使用 m⁻³；严格递增的 ρtor,norm 覆盖 0–1，最多 1024 点，所有剖面为有限正值。
- FUSE 联动只接收与节点当前已验证发布投影完全一致的 `simulated` 快照。节点先核验 FUSE 压缩/原始制品哈希和 run ID，再逐字段比对 Te/Ti/ne、坐标、时间与来源身份；修改数值后重算自摘要或改成未知引擎仍会拒绝。接收几何固定为明确标注的 DIII-D-like 圆截面；不接收磁平衡、装置文件或任意代码。
- 前端文件上限 120,000 字节，网关 JSON 上限 128,000 字节。服务端重新校验规格、单位、轴、快照 SHA-256 和节点发布来源；`/v1/validate` 与 `/v1/jobs` 执行同一验证。
- CPU 1–8，超时 30–3600 s，模拟时长 0.01–400 s，径向单元 10–100，加热倍率 0.5–1.5；STEP 只允许倍率 1。这些是执行边界，不是物理适用域声明。
- `/v1/jobs/:id/result` 返回通过 manifest/原生结果/配置/环境哈希核验的 `transport-timeseries.v1`。
- `/v1/jobs/:id/geometry` 返回 `transport-geometry-result.v1` 验证包，包含同次运行的 `transport-geometry.v1` 以及计算节点已核验的 `geometry.json` SHA-256。STEP 显示原始输入平衡；其他配方显示参数化磁面重建，剖面沿磁面映射；新会话导出的派生场保留该几何身份。
- 旧运行可能没有 geometry sidecar，此时只显示可用时序和径向场，不用其他运行的几何补齐。

结果返回不自动提交 Git 或加入公共算例目录，也不授予数值收敛或装置精度资格。当前演示保留各配方电阻率倍率，不能直接当作物理控制时标验证。

## 验证

`tests/torax-remote.test.mts` 覆盖 HTTPS 地址、上传绑定、数值篡改后重算摘要、未知来源引擎、非法代码字段、坐标错误、结果身份及运行参数匹配。已有网关测试覆盖鉴权、来源、代理 Host、请求限额、幂等和 FUSE 全局租约。

`scripts/simulations/verify-torax-integration.mts` 实际执行基础算例，验证取消和篡改拒绝。

`scripts/simulations/verify-torax-remote.mts` 使用前端网络客户端，通过 HTTP 上传 FUSE 剖面、运行 TORAX、收集结果/二维投影，并重建 HTTP 网关后按同一任务编号恢复。报告在 `output/simulations/torax-remote-verification.json`，不是浏览器点击验收。公开部署验证另按项目发布合同执行。
