# FUSE / TORAX → CHERAB 最小物理—诊断闭环

日期：2026-09-07。入口：`/simulations?engine=diagnostics`。

本页记录 9 月 7 日功能开发阶段的计算与验收，末尾的检查失败和未发布说明仅对应当时快照。9 月 8 日起将本功能与 FUSE/TORAX 合并进行整体发布；实际部署与同提交验证状态以独立发布记录为准。

这次实现实际运行 CHERAB 1.5.0 / Raysect 0.8.1.post1，从现有物理结果计算诊断信号，再用含噪声的合成观测完成单参数反演与重投影。它是软件闭环，不包含装置观测、实验标定或对输运/平衡求解器的反馈；也不是完整层析或唯一剖面恢复。

## 输入与身份

| 算例 | 固定源运行 | 时间截面 | 几何 |
| --- | --- | ---: | --- |
| FUSE / DIII-D | `fuse-diiid-20260906174722551-3ffd17fc` | 1，1 s | 同次模型求解的原生二维平衡，COCOS 11 |
| FUSE → TORAX / DIII-D-derived | `torax-fuse-profile-handoff-1788759506301-ded889d5` | 39，0–0.2 s | TORAX 接收场景的参数化重建；不是源 FUSE 平衡 |
| TORAX / ITER hybrid | `torax-iter-hybrid-1788759225911-2b7ab30b` | 32，0–5 s | TORAX 参数化磁面重建；不是新的二维平衡求解 |

`prepare-inputs.mts` 校验现有 public 结果的 gzip/raw 字节数和 SHA-256，使用现有物理与几何解析器核对合同，再绑定 runId、原生结果哈希、几何/坐标投影哈希。这里实际重新校验的是公开投影；本次没有重新读取或验证原生 HDF5/NetCDF 字节，原生哈希作为已有血缘保留。

FUSE 使用同一次平衡中的 `psi_norm → rho_tor_norm` 映射；不能用 `sqrt(psi_norm)` 替代。TORAX 由现有重建磁面线性插值得到 rho(R,Z)，不生成伪 psi、不赋予 COCOS。两个 DIII-D 场景的磁面不同，不能用诊断信号差异证明跨引擎物理精度。

## 前向算子

1. 提取 Te（eV）与 ne（m⁻³），显式转换 float64；单位不再归一到 Greenwald。
2. 采用非相对论、完全离化氢同位素自由—自由辐射近似：

   `epsilon_ff = 1.426e-40 × gB × Zeff × ne² × sqrt(Te[eV] × 11604.51812155)` W/m³。

   系数来自 Rybicki & Lightman, *Radiative Processes in Astrophysics*, eq. 5.15b 的 cgs→SI 转换。`gB=1.2`、`Zeff=1` 是共同的显式假设，不是从 DIII-D / ITER 的原生组分推得。这也不替代 FUSE 原生 brem/line/synch 源项。
3. 129×161 的 R–Z 计算网格；LCFS 外发射设为零，是无 SOL 发射的边界条件。LCFS 内缺失数据直接失败，不作补零。发射率在网格上作双线性插值，边界有网格尺度的平滑误差。
4. 每个装置按自己的边界布置 12 条水平极向视线，位于正 R 半平面。几何是假设的诊断阵列，不是实装通道。CHERAB `RadiationFunction` 接收 W/m³，Raysect 以 2.5 mm 步长追踪，输出 `∫epsilon dl/(4π)`，单位 W/m²/sr。
5. `RadiationFunction` 把总辐射功率分配到虚拟积分波段；代码中的 400–401 nm 只是该 API 的积分区间，不表示可见光谱预测。页面只标注灰体/全频积分轫致辐射近似。

无 OpenADAS 下载、谱线、同步辐射、吸收、有限孔径/étendue、CAD 遮挡、真实镜面/探测器响应或标定。这是理想视线辐亮度，不是实际 bolometer 接收功率，也不是全部辐射损失。

## 反演与重投影

独立梯形积分对同一双线性发射场求视线积分；已知密度倍率 `s_true=1.12` 对应发射/信号倍率 `s_true²`。叠加逐通道 2% 高斯噪声，随机种子为 20260907 加算例序号。

奇数通道训练，偶数通道留出。Te、Zeff、Gaunt、几何固定，求加权最小二乘幅度 `a=Σ(P_i y_i/σ_i²)/Σ(P_i²/σ_i²)`，恢复 `s=sqrt(a)`，重投影 `aP_i`。独立观测不足以区分密度、Zeff、标定增益等共同幅度，页面不宣称一般密度剖面的可辨识性。

浏览器实现同样的解析拟合，可调整 s、拟合并重投影、查看归一残差和留出 RMS；全部 72 帧与 Python 拟合结果交叉核对。合成观测和反演共享模型与几何，留出通道检验只属于软件自洽，不是独立实验 V&V。FUSE 与 TORAX 的原始结果不变。

## 已运行数值结果

| 算例 | CHERAB 对独立积分最大相对差 | 末帧步长减半差 | 末帧空间网格加密差 |
| --- | ---: | ---: | ---: |
| FUSE DIII-D | 0.0018633% | 0.0020118% | 0.299291% |
| TORAX DIII-D-derived | 0.0011251% | 0.0010618% | 0.0737108% |
| TORAX ITER | 0.0001250% | 0.0000781% | 0.0858476% |

解析基准：1 W/m³ 均匀发射体、1 m 光程，应为 1/(4π) W/m²/sr，实测相对差约 1e-9。空间加密是 129×161→257×321、仅各算例末帧；不能等同完整网格收敛研究或源物理模拟收敛。显示网格为每隔一个计算节点取样的 65×81；信号和拟合保留完整浮点值。

拟合密度倍率范围：FUSE 1.114266；TORAX DIII-D 1.111571–1.131107；ITER 1.109699–1.128196。差异来自固定噪声实现与积分差。没有将拟合成功当成真实密度估计资格。

## 复现

当前计算环境：Python 3.12.14，WSL Ubuntu。解释器与依赖版本需由下述隔离环境验证，不修改已有 TORAX venv。

```powershell
# 本机现有 Python 3.12 可用于创建独立环境；若路径不同，使用已有受支持解释器。
wsl -d Ubuntu -- /mnt/d/Code/Torax/.venv-wsl/bin/python -m venv /mnt/d/Code/FusionDigital/work/diagnostics/.venv-wsl
wsl -d Ubuntu -- /mnt/d/Code/FusionDigital/work/diagnostics/.venv-wsl/bin/python -m pip install --index-url https://pypi.org/simple --only-binary=:all: -r /mnt/d/Code/FusionDigital/scripts/diagnostics/requirements-lock.txt
npm run diagnostic:demo
npm run test:synthetic-diagnostics
wsl -d Ubuntu -- /mnt/d/Code/FusionDigital/work/diagnostics/.venv-wsl/bin/python /mnt/d/Code/FusionDigital/tests/synthetic-diagnostics-math.test.py
npm run dev -- --host 127.0.0.1 --port 3023
```

沿用仓库 Node >=22.13 要求，命令显式启用原生 TypeScript 类型剥离；本次使用 Node 24.18.0。环境内 `pip check` 已通过。环境锁来自本次实际安装；重新安装仍需信任/校验官方发行包。

计算环境、输入、完整中间结果保存在 Git 忽略的 `work/diagnostics/`。执行器生成内容寻址 gzip 及 `app/simulations/data/synthetic-diagnostics.json`。完整归档记录输入、预处理器、Python worker 的哈希与软件版本。运行耗时是归档元数据，因此不同运行的完整文件哈希可以不同；科学结果在相同环境与种子下应复现。

前端沿用现有受限大小、SHA-256 校验的科学 JSON loader，进一步校验模型、单位、维度、来源身份和证据边界。源文件不会由浏览器提交执行；本次未添加匿名计算 API。

## 展示与发布边界

入口位于“仿真引擎”中的“CHERAB–Raysect”。可切换三算例、回放时序、高亮通道、调密度倍率、拟合重投影、读通道数表、导出 CSV/JSON 与完整归档。R–Z 图保持等比例坐标；每个算例的色标在时序和密度扫描中固定，不支持跨装置精度排序。

本轮功能实现不包含 Git 提交、推送、香港/Sites 发布或 DNS 修改。生产发布仍按 AGENTS.md 的同 SHA 双端发布门禁执行。

许可与引用见 `THIRD_PARTY_NOTICES.md`。未把 CHERAB/Raysect 安装环境放入前端或发布包。

## 本轮代码与交付检查

- CHERAB 实际运行、4 项 Python 物理不变量测试、4 项 TypeScript 数据/血缘/反演测试通过。
- 真实本地 HTTP 经过前端使用的 loader 完成下载、解压、哈希与合同验证，三案例均通过。
- 新模块 lint、TypeScript noEmit、项目构建通过；`npm test`、`npm run test:simulations`、`npm run test:visualization` 成功。部分原有测试按其既有条件跳过，不代表全环境资格验证。
- 新增中英文诊断路由的构建后 HTML 检查通过：`node --test tests/synthetic-diagnostics-rendered.test.mjs`。
- `npm run check` 在诊断模块之外的 `app/simulations/platform/RunConfiguration.tsx:29` 发生 `react-hooks/set-state-in-effect` 错误。本轮未修改该文件，因此不宣称完整 check 通过；其余阶段已分别执行。
- 未执行浏览器点击、截图或真实装置验收；已提供本地预览供审阅。无生产发布。
