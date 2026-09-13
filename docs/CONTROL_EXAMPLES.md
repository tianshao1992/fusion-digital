# DINA / FGE 历史示例回放

引擎页默认打开“示例与响应”，不需要连接计算节点。可逐点播放、切换响应量、查看归档目标、
R–Z 轨迹及已有 LCFS，并下载原单位 CSV / JSON。原有认证云端配置仍在独立页签中。

| 示例 | 源记录 | 展示范围 |
|---|---|---|
| DINA | 2026-08-22 扰动验收，`dina-75a3d135a6a64e228ad2db8d9b7024ae` | 16 个 STEP 后样本，1–16 ms；Ip/R/Z 及目标，无 LCFS |
| FGE/HFM | 2026-08-16 独立 PPO 测试 `trained_episode_01.json.gz` | 101 个状态，0–100 ms；Ip/R/Z/Rmin/Rmax/kappa、已有目标及 101×32 点 LCFS |

FGE 到达 100 步预设窗口：`max_steps_truncated`，`failure=false`，不代表无限时稳定。
它是完整独立回合，不是将另一次 499 ms 失败运行裁剪为成功记录。DINA 包含动作/观测延迟和噪声，
选用归档的 clean 适配器输出；clean 不代表无扰动或原始协议报文。

## 身份和单位

- 独立 `control-example.v1` / `historical-replay` 合同及 `control-examples.json` 索引，
  不混入 `control-result.v1` / `control-runs.json`，不放宽实时运行与公开发布的严格校验。
- 统一标为 `SIMULATED · HISTORICAL REPLAY`，不是实验观测或本轮云端运行。
- 两份归档均未绑定可核验的运行 Git SHA、炮号或物理初始化时刻，因此保持 null。
  不能把当前固定云端 recipe、导出器 SHA 或训练前 checkout 当作历史执行身份。
- DINA 的 A/m/m 沿用核对过的适配器端口约定，源验收自身未记录单位；页面来源中明确这一局限。
- FGE 原文明确 Ip 单位未核实，保留 code-unit，不换算为 A/kA。R/Z 和边界的 m 沿用归档绘图约定。
  每帧 LCFS 与其 rB/zB 逐点相等，直接保留；不伪造目标 LCFS。原生磁通 Fx 使用下述独立场工件，
  不以未知约定的 Fx 冒充 ψN、Wb 或合格的 TORAX 平衡。
- 旧适配器解码后的数值不能独立排除历史补值/类型转换问题；来源与适用边界完整保留该限制。
- 不展示未留存的最终电压/执行器回读，不造 RESET 点、缺失边界或磁面。
- 示例不具备 TORAX 初始化资格；接口页保持缺项阻塞。后续需新原生数据和单位/坐标/装置版本验证。

## 发布和复核

两个内容寻址 `.json.gz` 共 69,382 字节，公开投影只含展示必需的时间序列、边界与脱敏来源摘要，
不包含原始模型、训练权重、日志、私人路径、网络地址或容器配置。

严格离线发布入口：

```text
npm run simulation:publish-control-examples -- --reviewed-for-publication <脱敏投影绝对路径> ...
```

先人工对照原始归档与单位来源，再调用此入口。它验证历史合同、生成压缩/原文双摘要，保留既有
索引，拒绝同 ID 不同内容；它不会将历史样例升级为云端运行或触发任何求解器。
小文件随香港与 Sites 归档自包含分发；路径列入 formal release 三处固定清单及 runtime asset lock。

源文件摘要列于每个示例的 `source.files`，历史运行代码 SHA 仍为空。此次一次性原始归档投影脚本
及私有输入路径清单保留在仓库外审计目录，不进入网站发布包。

测试覆盖压缩/原文摘要、索引绑定、原生时间范围、缺 RESET/未知单位、LCFS 维度、敏感字段排除、
历史记录不能通过实时结果合同、下载读取器和不可覆盖发布行为；这些不是云端数值验收。

## 位形与原生磁通场

`control-equilibrium.v1` 与 `control-equilibria.json` 独立保存完整的场网格，不扩充或降低
严格 `control-result.v1` 的资格要求。当前已发布 FGE 同一历史回合的 101×65×66 个 Fx
数值与同帧 LCFS；仅把源 Fortran `[65,66]` 次序重排为逐 Z 行、R 最快变化。全部数值保留，
未抽帧、降精度、生成替代磁通或插补数据。该工件约 3.96 MB gzip / 9.08 MB JSON，沿用
现有科学数据读取器的 6 MB 压缩 / 20 MB 解压上限，不放宽全站载荷门禁。

场与时序示例必须同时匹配 engine、example ID、run ID、源原始文件 SHA、完整时间数组和
逐点 LCFS；不接受跨运行或 nearest-frame 静默绑定。没有关联示例的独立场必须使用自己的
时间控件，显式声明不与旧曲线同步。只有当前激活的引擎页加载较大的场工件。

绘图复用 TORAX/FUSE 的 `PSI_N_COLORS`、Canvas 与等比例 R/Z；原生值域色标明确为
`code-unit`，不是归一化磁通。网格以原生离散样本着色，等值线只在相邻网格边上插值用于
显示，段与段不连接，不自动闭合成磁面。LCFS 仅使用同帧归档点；未知磁轴不生成。
缺少 FA/FB 和已验证单位/COCOS，因此不作 2π 换算、不生成 ψN，也不提供 TORAX 输入。

离线发布入口（先复核公开字段、源数据和关联身份）：

```text
npm run simulation:publish-control-equilibrium -- --reviewed-for-publication <投影绝对路径> <中文标题> <英文标题>
```

### DINA 缺项

当前 DINA 16-step 归档只有标量响应，无二维 ψ 或 LCFS；界面明确显示场数据待补齐。
不使用 EFIT、其他炮号模板、椭圆或缩放边界填充该历史运行。
后续需要在已确认的云端 DINA 实例中，先检查真实 socket/server 导出协议，再采集独立
运行身份、同帧时间、R/Z 米制坐标、二维 ψ 与布局、单位或归一化依据、LCFS/有效性标记
以及原始哈希。现有 FusionControl DINA 标量适配器会丢弃未知场字段，必须在字段真实存在
且约定明确后扩展；不能仅靠前端声明实现数据采集。
