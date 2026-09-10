# DINA / FGE 专用计算节点

本目录是可审核的运行部署合同，不是已完成云端部署的证明。
2026-09-10：网页、执行网关和独立 exporter 已实现；没有取得可信计算主机访问，
因此尚未在云端运行本轮算例，也没有发布新的仿真结果。

## 边界与版本

- 网站生产仍在香港 `47.75.119.239`，只提供公开只读制品；不在该小规格主机安装 HFM。
- 计算节点运行 Linux、Node >=22.13、Python 3.10+、本机 Docker；GPU 不是此基线的必要条件。
- FusionControl 固定提交 `b267fcca0512640f9d96ca9d0cf10bef8b3de4dc`，
  来源基线为 `85870b08bcbdab99056a94c0db775515edb3c9ed`。
  独立分支 `codex/dina-fge-control-export`，没有合并/覆盖用户主工作区。
- exporter：`scripts/digital_twin/export_control_run.py`；SHA-256
  `c9426ca64805d64ca9e98cc3081dcf6f1619e648a186e95e2cbc8bb64d0051ec`。
- FGE Image **configuration ID**：`sha256:c96eb08308a2236a438f2c36e77939afc2d9cdee5d9f355529cc2de78006b961`。
- DINA Image **configuration ID**：`sha256:e78579340491f4bca5c41084c5b8ffa57bd766965c94ad20f972656e8f4c7acc`。
  以上不是已核验的 OCI registry manifest digest，不得据此拼接 registry@digest 拉取。
- 镜像取得、求解器授权与公开结果权限由运维/模型所有者确认；不要将私有镜像上传到公开仓库。

FGE 算例为固定 20175@400 ms 的线性 HFM；DINA 为固定 14795@800 ms warm start。
二者不是 EFIT 炮号复现，也不必强行与 EFIT 炮号绑定。
第一版只允许 1–500 个 1 ms STEP、recordEvery=1、零电压程序、内部 VS、PSM 关闭，
不训练、不加载策略，不宣称外部闭环控制算法已完成。

## 节点准备与运行

1. 从云控制台核验 SSH 主机公钥指纹，使用 `StrictHostKeyChecking=yes`；不能用
   `ssh-keyscan` 自身建立信任。核对 CPU、内存、磁盘、Docker、本地 context 与镜像授权。
2. 使用独立不可变 checkout 安装上述 FusionControl 提交。其 `git status --porcelain`
   不得有 tracked dirty；exporter 会核验 HEAD 与实际脚本摘要。
3. 运维预先创建/预热两个独占容器。FGE 仅绑定 `127.0.0.1:2223:5558`；DINA 仅绑定
   `127.0.0.1:5560:5558`。不得使用 host network、`0.0.0.0` 或公开 Docker socket。
   启动参数应从同一版本 FusionControl 的 `plant_environments.py` 核验；不要把 configuration
   ID 当作可拉取的 registry digest。用 `docker inspect` 核对 `.Image` 和 loopback 端口。
4. 在计算主机独立安装与本网站提交一致的 FusionDigital checkout，执行 `npm ci`。
   这里只运行 `scripts/simulations/gateway.mts`，不启动网站、不接入公开写 API。
5. 按 `gateway.env.example` 在 `/etc/fusiondigital-control/gateway.env` 安装运维配置，
   使用安全通道提供独立随机 token，不写入 Git、命令行或报告。
   `fusioncompute` 必须有本机 Docker 只读 inspect 所需访问；Docker group 实际具备主机级权限，
   因此节点必须隔离并只运行可信固定 runner，不能接收用户任意脚本。
6. 创建专用 jobs 目录并限制为该服务用户可读写。审查 systemd 中路径与 Node 安装位置，
   再安装 `control-gateway.service`。保留默认 loopback 监听。
7. 浏览器经受控 SSH 隧道访问 `http://127.0.0.1:8793`，或由另行审核的 HTTPS 反代访问；
   反代需要精确 `GATEWAY_ALLOWED_HOST`、TLS 与访问控制。不要开放 plant 端口。
8. 页面选择 DINA/FGE，连接、验证配置、提交、轮询、取消、读取结果。
   令牌只在内存；网络故障重试使用原幂等键，不自动再提交。

`GET /v1/catalog` 仅声明运维配置过的 executionEngineIds，不证明数值模型已验收。
持久 SQLite 在一次事务中记录幂等键和单节点独占租约；重启不自动重跑，未结束任务转为
`reconciliation-required`。日志限额 64 KiB/stream，留在私有运行目录；HTTP 不暴露路径/日志。

## 租约恢复

本版宁可阻止重用，也不把 Python 退出当作 plant 已就绪。每次运行完成、取消或超时后，
租约都保留。运维需停止网关、确认 worker 已退出、按同一 pinned Image ID **新建**该算例容器，
再在 Linux 计算主机执行：

```bash
npm run simulation:control-rearm -- \
  --root /srv/fusiondigital-control/jobs \
  --job <完整任务编号> \
  --fresh-container <已核验的新容器名称>
```

该命令核验旧 worker PID 不存在、容器创建时间晚于任务、实际 Image ID、同一 loopback
端口和不同容器 ID，记录审计后才释放租约。不会删除任务、启动/删除 Docker 或修改网站。
若 container 名称改变，运维同时更新环境配置；重新启动网关后下一次 RESET 仍必须通过。
异常 PID 不明确时保持阻塞，不能手工删 SQLite 来绕过未确认 STEP。

## 结果上传和网站发布

```text
浏览器 → 认证计算网关 → 独占 Docker → 私有原生包
                                      ↓ 运维审查 / SCP
本地隔离发布工作区 ← 严格投影器 ← result/spec/manifest + 双摘要
        ↓ 校验 / Git / 香港和 Sites 同 SHA
公开只读、内容寻址的 JSON.gz → 引擎页面
```

不得把原始结果直接写进生产网站目录，也不得上传模型、容器、训练数据、日志、凭据或受限历史。
在计算主机拿到 `native/result.json`、`spec.json`、`manifest.json` 后，通过严格 SSH/SCP
下载到仓库外受控目录，检查授权、数值范围和数据质量；在本地隔离工作区执行：

```bash
npm run simulation:publish-control -- \
  --input <仓库外的native绝对目录> \
  --id <dina-或fge-开头的唯一任务编号> \
  --reviewed-for-publication
```

投影器校验固定代码、runner 字节、实际镜像身份、manifest 内文件摘要、步数、时刻、单位、
动作与缺失数据。原生文件可到 200 MB，公开投影仍限 raw 20 MB / gzip 6 MB。
只将通过检查的成功运行加入 `app/simulations/data/control-runs.json`，保留全部历史版本；
对应小型 `public/data/simulations/<sha256>.json.gz` 随两端构建分发，不修改现有 Sites offload lock。
失败/取消/未确认动作可以在认证连接中诊断，但不能进入成功公开算例库。

每个新公开制品还须加入 `deploy/formal-release-contract.json`、
`scripts/deployment/verify-formal-release.mjs` 与 `tests/formal-release-contract.test.mjs`
三处固定共享路径，并更新 runtime-assets lock。随后严格遵守 `docs/RELEASE.md` 成对发布；
没有新仿真制品时不要添加伪造路径或复制旧记录冒充验证。

## TORAX 后续接口

当前 `input:null`，任何跨引擎输入会被拒绝。页面能导出 `control-equilibrium-snapshot.v1`
接口证据及 `control-coupling-assessment.v1` 缺项清单，execution 始终 not-implemented。

| 方向 | 下一阶段需落实 |
|---|---|
| TORAX → DINA/FGE | 同一装置版本/初态、Te/Ti/ne、组分、总压力/电流闭合、rho 坐标转换、plant 参数绑定 |
| DINA/FGE → TORAX | R/Z/ψ 形状与排列、COCOS、2π/单位、轴/边界磁通、符号、径向映射、接收端所需剖面 |
| 双向时间推进 | macro/micro 步长、稳定性/守恒、失败回退、restart、控制器/plant 的时序所有权 |

FGE Fx 原样保留在私有原生包，未知单位/排列不能转成伪物理几何。仅回放原生 LCFS；
DINA socket 无二维场时保持 unavailable。现有 FUSE → TORAX 剖面路径不改为通用平衡输入。

## 验收范围

`npm run test:control-engines`：合同、原生包投影、幂等/重启/租约、鉴权与中英文渲染。
FusionControl 自带 66 项纯协议测试。这些测试使用明确合成的测试替身，**不能替代**云端实跑。
云端验收必须补：每个引擎 16 ms 成功运行、固定输入重复性、500 ms 场景稳定性评估、取消、
超时、网关重启后不重复执行、fresh-container rearm、结果下载/公开投影/两端哈希验证。
500 ms 物理失败应保留 failed 和有效数据，不得为“验收成功”隐藏失败。
