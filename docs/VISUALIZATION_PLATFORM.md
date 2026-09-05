# FusionDigital 开放可视化平台

## 1. 结论

FusionDigital 在未来 1-2 年采用“开源核心、多运行时适配”的路线，不把产品绑定到单一商业引擎：

- Three.js + glTF/meshopt 负责浏览器内 CAD、设备结构和受控工作集。
- vtk.js 负责可下载的小中型科学数据本地交互。
- ParaView + trame 负责超大 CAE、时序场和受限数据的服务端计算与图像流。
- Blender 作为离线、无界面的资产制备工具，不嵌入 Web 请求进程。
- OpenUSD 作为装置场景、版本和引用的组合层，不替代 HDF5、XDMF、VTK 或 IMAS 等科学数据事实源。
- Omniverse 只作为可关闭的沉浸式/协同适配器；核心合同、数据和发布流水线不依赖它。

当前提交交付的是可执行 V1 基础，不声称已经部署 ParaView GPU 集群、Omniverse Nucleus 或实时 CAE 会话代理。

## 2. 体系结构

```text
authoritative source
  CAD / CAE / facility record / simulation run
                 |
                 v
offline publication plane
  Blender headless ---- scientific converters
       |                         |
       +------ glTF / OpenUSD ---+--- VTK / XDMF / HDF5
                 |
                 v
visualization-artifact.v2
  identity + provenance + coordinates + complexity + access + deliveries
                 |
                 v
deterministic policy router
  access policy + client budget + working set + user intent + runtime health
       |              |                |                  |
       v              v                v                  v
   Three.js         vtk.js       ParaView/trame      optional Omniverse
```

原则是“移动上下文和像素，不移动未经授权的原始数据”。`facility-record`、`simulation-run`、`comparison-record` 和 `design-asset` 继续保持独立身份。

## 3. V1 代码边界

| 层 | 当前实现 | 后续运行时工作 |
| --- | --- | --- |
| 制品合同 | `public/schemas/visualization-artifact.v2.schema.json` 和 TypeScript 运行时解析 | 签名清单、对象存储租约、版本保留策略 |
| 上下文合同 | `fusiondigital:set-context` v2 | 与 CAD、时间轴、IMAS/MDSplus 查询联动 |
| 策略路由 | 浏览器预算、工作集、权限、意图和运行时可用性 | 实测遥测、租户配额、GPU 会话排队 |
| Blender | job 校验、hash 门禁、GLB/USD 输出、稳定 ID、制品清单 | 容器镜像、CAD 专用转换器、质量报告 |
| OpenUSD | job 校验和引用式 stage 组合 | 变体集、材质策略、多人评审工作流 |
| ParaView/trame | 路由目标与合同已定义 | 会话 broker、资源限制、健康检查、WebRTC/WebSocket 网关 |
| Omniverse | 显式可选路由目标 | 独立部署和许可评估，不进入开源核心依赖 |

## 4. 合同校验

普通 CI 不需要安装 Blender 或 OpenUSD Python 绑定：

```powershell
npm run visualization:validate
npm run test:visualization
```

执行实际 Blender 发布时：

```powershell
blender --background --python scripts/visualization/blender_publish.py -- --job path/to/job.json
```

发布脚本只解析 `--` 后的工具参数，因此不会把 Blender 自身启动参数误判为 job 参数。生产容器仍应固定 Blender 版本并记录镜像 digest。

执行 OpenUSD stage 组合时：

```powershell
python scripts/visualization/compose_openusd.py --job path/to/compose-job.json
```

## 5. 科学数据与真实性边界

- 平台页的路由负载全部标记为 `SYNTHETIC`，只用于解释容量决策，不是设施结果或性能基准。
- `/fusion-data` 的公开 EXL-50U 快照仍由现有 hash 校验和数据身份规则控制，本 V1 不向该页面注入 mock CAE。
- OpenUSD prim 引用可以关联科学制品 ID，但标量场、网格拓扑、单位、坐标系和时间轴仍以科学格式及其清单为准。
- Blender 输出的几何统计是发布时派生值；它不能替代源 CAD/CAE 的权威记录。

## 6. 许可与部署

- Blender 是 GPL 工具。FusionDigital 通过命令行 JSON job 与它进行进程级隔离，发布产物按各自来源许可管理。
- OpenUSD、Three.js、vtk.js、ParaView 和 trame构成开源主路径，但每个依赖仍需在发布清单中记录版本与许可证。
- Omniverse 免费使用或可获取不等于开源。适配器必须位于独立服务边界，关闭后不得影响核心查看、科学分析和数据导出。
- 远程 ParaView 会话必须默认拒绝任意脚本、限制 CPU/GPU/内存/时长，并在反向代理处实施身份、来源和 WebSocket 策略。

## 7. 下一阶段验收门

1. 用真实但可公开的 CAD 资产跑通 Blender GLB/OpenUSD 发布，核对稳定部件 ID、单位、坐标系、hash 和几何统计。
2. 部署最小 ParaView/trame broker，只接 `simulation-run` 测试数据，完成会话超时、资源限额和断线恢复测试。
3. 建立浏览器长任务遥测，以真实设备数据调整路由预算，而不是依赖 V1 参考阈值。
4. 用同一 OpenUSD stage 对比开源查看器与 Omniverse 适配器；只有业务收益明确时才进入后者的生产评估。
