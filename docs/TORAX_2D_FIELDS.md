# TORAX 二维云图：结果、输入与映射

2026-09-07，本地 `/simulations?engine=torax` 已接入二维云图。该功能扩展了此前的时序工作台，没有重新计算或修改 8 个原生输运结果，也没有改变 FUSE 的二维/三维平衡展示。

## 哪些是原生二维数据

TORAX 是一维径向、随时间演化的输运求解器，常称为 1.5D 模型。不能将它描述为独立求解二维 Grad–Shafranov 平衡或二维热输运的求解器。

| 显示模式 | 本轮数据 | 身份 |
| --- | --- | --- |
| 时间—半径云图 | 8 个运行的温度、密度、电流密度、压强和输运系数矩阵 | **原生输运离散结果**，横轴时间、纵轴 ρtor,norm |
| STEP 输入磁通 ψ/ψN | OpenSTEP SPP-001 ECHD 文件的 151×151 R–Z 网格 | **输入磁平衡**，始终固定，不是 TORAX 本次求出的二维平衡 |
| STEP 温度/密度等截面 | 本次 TORAX 径向结果 + 上述输入磁平衡的坐标映射 | **派生场显示**，假设输入磁面上物理量为常数 |
| ITER/basic/FUSE 联动截面 | 归档 R_in、R_out、elongation、delta_upper/lower 参数 | **参数化几何重建**；没有补造原生 ψ(R,Z) |

用户可在“二维云图”中选择 R–Z 或时间—半径模式。选 STEP 时，物理量列表额外提供“输入磁通 ψN”和“输入磁通 ψ”。其他算例不提供这两个输入磁通选项。所有模式保留对应来源标签，不把 reconstructed/mapped 字段冒充 native 解。

## 映射方法与边界

### 时间—半径

直接使用 `transport-timeseries.v1` 的时间、径向轴和二维样本数组。绘图单元边界取相邻样本中点并裁到实际时间范围和 ρ∈[0,1]，保留自适应/非均匀时间步。没有重新插值计算场值，也没有把时间轴当成第二个空间维度。点击云图可将现有回放定位到该原生时间步。

### STEP 输入磁平衡

从 `torax/data/third_party/imas/STEP_SPP_001_ECHD_ftop.nc` 的 `/equilibrium/0/time_slice.*` 读取：

- `profiles_2d.grid.dim1/dim2`、`profiles_2d.psi`；源矩阵顺序为 time, profile, R, Z，展示投影明确转置为 Z,R。
- `boundary.outline.r/z`、`global_quantities.magnetic_axis.r/z` 和 `psi_axis/psi_boundary`。
- `profiles_1d.psi` 与 `profiles_1d.rho_tor_norm`，用于实际 ψ→ρtor 映射，**没有用 sqrt(ψN) 代替 ρtor**。

按输入 LCFS 对网格点作掩膜。原生 ψ 作为输入数据保留，显示 ψN 时使用其来源的轴/边界磁通归一化；ψN 等值线以格点间线性插值绘制。对温度等通道，先由来源文件确定 ρtor，再在线性径向剖面上取值。

该输入网格在磁轴附近的最近格点存在约 `−3.22×10⁻⁵` 的 ψN 轻微越界，与 source psi_axis 并非完全一致。原始 ψ 仍显示；超出源映射范围的 ρ 保留 null，对应温度等映射留空。没有把该值钳制到零、外推或掩盖成有效物理样本。

来源署名：T. A. Brown, F. J. Casson et al. / UKAEA，*OpenSTEP: public data release of the STEP Prototype Powerplant scenario SPP-001* (2025)，[DOI 10.14468/07jt-s540](https://doi.org/10.14468/07jt-s540)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本投影做了转置、LCFS 掩膜和剖面映射；页面及导出场数据均附署名/修改说明。许可证原文在 TORAX 的 `data/licenses/LICENSE_OpenSTEP`。

### 参数化截面

每个径向面采用归档几何剖面的 R_in/R_out 得到中心和小半径，结合伸长比 κ、上下三角形变 δ 生成：

`R(θ)=Rcenter+a·cos(θ+asin(δ)·sinθ)`，`Z(θ)=κa·sinθ`。

上/下半面分别取 delta_upper/delta_lower；轴高假设 Z=0；各面的四边形色块使用两面中间 ρ 上的径向结果。几何导出前确认所取几何参数在该原生运行中固定；若后续运行几何随时间变化，当前投影器会拒绝将其静默冻结。

basic 和 FUSE 联动的 circular 模型在 TORAX 中含伸长修正；这里以椭圆方式示意该修正，不能理解为完整原生二维几何。三角形变参数化也不能还原所有 X 点、分离器或真实磁面细节。没有生成伪 ψ(R,Z)，没有继承 FUSE 的 COCOS 11；展示合同的 cocos 保持 null。

## 界面与工程实现

- 使用与 FUSE 相同的 ECharts Canvas 渲染组件和主题色，R/Z 保持等物理比例；支持缩放、重置、边界/轴/等值线切换。
- 使用工作台现有时间滑块与播放；固定输入磁通在回放中不变化，温度等映射随原生时序变化。
- 默认使用全时段统一色标，避免逐帧自动缩放造成错误的演化观感；可切换局部色标。
- 支持悬停/点击读数、键盘采样滑块和当前二维场 JSON 导出。导出保留原合同单位、源运行/native SHA、几何 SHA 与来源身份。
- 新运行尚未导入几何时，R–Z 视图明确显示未导入，原生时间—半径仍可使用。

文件：

| 文件 | 用途 |
| --- | --- |
| `app/simulations/platform/TransportFields.tsx` | 二维视图、交互和导出 |
| `app/simulations/platform/geometry.ts` | 严格几何合同、网格/截面投影、等值线；可复用于其他引擎的标准结果 |
| `app/simulations/data/transport-geometries.json` | 与 8 个原生运行逐个绑定的独立几何目录 |
| `scripts/simulations/torax/export_geometry.py` | 从归档原生结果和输入文件产生内容寻址的几何 sidecar |
| `scripts/simulations/torax/hdf_reader.py` | 只读 HDF 接口；Linux 用现有 h5py，Windows 可复用本机 FUSE 的 HDF5 库 |
| `tests/simulation-transport-fields.test.mts` | 哈希、身份、坐标、网格、缺失值、源磁通静态性和映射验证 |

独立 `transport-geometry.v1` 合同没有改变 `transport-timeseries.v1` 或 FUSE 的 physics 合同。几何加载使用现有压缩/原始双哈希校验，额外验证 runId/native SHA。后续求解器可以提供自己的输入网格或明确的派生几何，不需要伪造 FUSE 的内部数据结构。

新增运行导入后，可重新生成几何目录（不会重新运行模拟）：

```powershell
# 使用已配置的 TORAX Linux 环境
wsl -d Ubuntu -- /mnt/d/Code/Torax/.venv-wsl/bin/python /mnt/d/Code/FusionDigital/scripts/simulations/torax/export_geometry.py --root /mnt/d/Code/Torax --project /mnt/d/Code/FusionDigital
```

本次 WSL 只读检查的自动审批超时，最终通过已有 FUSE HDF5 库在 Windows 只读完成了全部数据提取，没有安装新依赖或修改 TORAX 环境。

## 验证范围

8 个几何 sidecar 均通过压缩/原始哈希、大小、runId/native SHA 绑定、严格合同校验。STEP 的 R/Z 顺序使用磁轴邻近磁通值以及源坐标网格验证；原生时空样本逐项与现有结果矩阵核对；映射用例验证未伪造轴心值、未将参数化截面称为 ψ(R,Z) 解。

18 项相关测试（含 FUSE 三维几何与原始 TORAX 平台/网关）及 4 项中英文页面渲染测试通过；TypeScript、目标文件 ESLint、生产构建通过，当前本地页面 HTTP 200。未进行浏览器截图/点击验收、实验精度或二维求解器资格认证。本次没有部署生产。
