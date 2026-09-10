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
  每帧 LCFS 与其 rB/zB 逐点相等，直接保留；不伪造目标 LCFS，不投影未知磁通 Fx。
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
