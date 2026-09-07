# IMAS 与传统聚变技术栈兼容设计

状态：拟实施的兼容合同补充；核对日期2026-09-06。补充[数据与版本](03-data-and-versioning.md)、[引擎协议](04-engines-and-api.md)，不代表已完成库安装、互读或EXL-50U验证。容器运行规范见[07-container-and-runtime.md](07-container-and-runtime.md)。

## 1. 决策：聚变语义优先复用 IMAS，运行环境保留原生实现

维持现有前端技术栈和拟议Python Gateway。物理数据优先引用精确IMAS DD定义；业务对象、权限、执行状态仍使用中性平台合同。Fortran/C++/Julia/MATLAB程序及MDSplus、EFIT、CAE资产通过适配器接入，不以改写语言作为前置条件。

“兼容IMAS”拆成可分别验证的五件事，禁止只登记一个布尔值：

| 层 | 要统一或核验的内容 | 不能由这一层推导出的结论 |
| --- | --- | --- |
| DD/IDS科学语义 | 字段定义、单位、坐标、时间模式、occurrence、精确DD版本 | 名字相同不等于数据含义相同 |
| 读写库与API | IMAS-Python/Core、IMASdd.jl、OMAS的具体实现和版本 | 支持某字典不等于调用同一Access Layer |
| 序列化与backend | layout、writer/reader、HDF5/JSON/netCDF具体约定 | 同为HDF5不保证可以互读 |
| 执行接口 | 文件包、ABI、任务、分布式启动和状态 | 文件读通不意味着旧程序能在当前机器运行 |
| 科学资格 | 数值基准、装置、参数域、用途和误差 | 容器运行成功或schema合法不意味着实验验证通过 |

IMAS DD描述IDS及字段语义，Access Layer提供读写基础设施；语言和存储实现是另一层。[官方DD说明](https://imas-data-dictionary.readthedocs.io/en/latest/intro.html)、[IMAS-Core](https://imas-core.readthedocs.io/en/latest/)。本方案不要求所有工程网格、业务状态或审计记录都转为IDS。

## 2. FUSE 当前实现边界

以下是本地源码/锁文件核验，不是运行时互操作测试：

| 项目 | 核验值或事实 | 对接要求 |
| --- | --- | --- |
| FUSE.jl | 1.2.0；`9ef2f99af73497706a097d99a2aaac2f08405370` | 固定源码与依赖，不以浮动分支注册 |
| Julia包锁 | `IMAS 7.3.0`、`IMASdd 8.6.2` | 这些是包版本，不是ITER DD版本 |
| 精确基础DD | 本次未从Manifest确认 | P0查明实际schema bundle并算digest，不宣称已经锁到某个DD4.x |
| Julia IO | 原生实现，非native IMAS API binding | 按实际writer/reader组合测试 |
| 扩展 | 既有额外IDS，也有标准IDS内部的额外字段 | 按目标DD的字段结构核对，不能仅按IDS名称过滤 |
| `.nc` | 本地8.6.2 `file2imas`明确拒绝 | 不把netCDF列为当前Julia公共交换通路 |

证据路径：`D:\Code\Fuse\FUSE.jl\Project.toml`、`D:\Code\Fuse\environment\Manifest.toml`、`D:\Code\Fuse\FUSE.jl\docs\src\dd_docs.jl`、`D:\Code\Fuse\.julia-depot\packages\IMASdd\mEHbh\src\io.jl`及其schema扩展目录。

[IMASdd官方概览](https://projecttorreypines.github.io/IMASdd.jl/dev/)说明其Julia原生实现及tensorized IMAS HDF5、OMAS hierarchical HDF5/JSON支持；这不构成任意版本的互读保证。[OMAS](https://gafusion.github.io/omas/)与[IMAS-Python](https://imas-python.readthedocs.io/en/stable/)也是不同Python实现，按用途选用，不要求所有库装进每个worker。

FUSE文档举例的`build/solid_mechanics/balance_of_plant/costing`不能直接当成一份永远适用的“非标准IDS名单”。新DD可能已有同名IDS，标准IDS内部也可能有FUSE扩展；需要比较实际字段、类型、单位和坐标。

本地`strict=true`会跳过标为extra的字段；`freeze=true`会求值物化动态表达式。导出先固定字段白名单与物化策略，记录派生公式/版本及失败字段，再生成目标交换包。`strict`不等于目标DD迁移或科学验证；必须保留完整原生输出、扩展sidecar和字段覆盖/损失清单。不要把库内部不确定度后缀变成平台字段标准。

## 3. IMAS Bridge 的落点

IMAS Bridge是DataAdapter/EngineAdapter内部的模块和测试包，首期不增加必经独立微服务。

```text
IMAS库/文件、MDSplus、G-EQDSK、原生CAE
  → 授权读取 + 不可变原生快照
  → 版本化字段映射/校验（必要时显式DD迁移）
  → 带IMAS或Engineering profile的DataProduct
  → EngineAdapter生成原生输入 → 求解器
  → 原生输出 + 规范数据产品 + 诊断/损失报告
  → ResultManifest → 独立可视化投影
```

PostgreSQL管理Study、ModelRevision、Run、权限和血缘；对象存储保存原生与派生数组。IMAS负责已有聚变量的科学定义：QuantityDescriptor引用`DD版本 + IDS path + schema digest`并补充数据定位，不复制维护另一套含义相同、可能漂移的物理字典。

工程网格/材料/边界、CAD部件身份继续使用EngineeringProfile；已有IDS或GGD确实适合时建立明确映射。不为通过schema而制造虚假实验炮号、时间或缺失值。公开站只读审核投影，不能直连IMAS写backend或装置数据库。

每份InteroperabilityRecord至少冻结以下信息：

- producer/consumer库及版本、schema bundle digest、源/目标DD、扩展bundle。
- format、layout、backend版本；IDS/field覆盖、occurrence、时间模式、坐标与误差表达。
- mapping/物化/迁移recipe及输入输出hash、字段丢失/插值/精度变化报告。
- 测试方向、套件与结果digest、已知限制、用途资格引用；未测试方向不能默认通过。

这是兼容关系记录，不替代EngineBinding；绑定引用它，并与运行环境及模型资格共同决定能否执行。

## 4. DD版本、数据变换与无损边界

源数据保留源DD，平台选定目标DD/profile，二者独立；不跟随环境默认DD或在线`latest`。P0用现有装置数据、FUSE实际schema和合作方reader联合选择目标版本，而不是在文档中任意指定一个版本号。

受控读取优先保留源版本，禁用未经登记的自动迁移；使用IMAS-Python时按实测API采用`autoconvert=False`，再执行显式转换活动。目标写入也预先完成迁移并核对DD，不能将writer的隐式转换当黑箱。

[IMAS-Python跨DD文档](https://imas-python.readthedocs.io/en/stable/multi-dd.html)明确部分自动转换不报告不兼容数据，跨major需显式处理；坐标约定、连接关系、轮廓和时间基变化可能涉及数值变换。平台策略因此比“读得开就接受”更严格：required字段丢失拒绝，optional丢失有报告；不可逆迁移不得标无损。

同DD同profile的roundtrip比较已声明字段的语义等价；跨DD迁移比较目标定义和不变量，不要求所有路径逐字节可逆。所有插值保留原始采样、算法和有效范围；未计算表达式不能以默认值替代。

## 5. 首批按能力选择IDS子集

这是候选范围，不表示当前FUSE或EXL-50U数据已覆盖；每项在P0进一步冻结field-level required/optional。

| 场景 | 候选IDS/原生数据 | 关键区别 |
| --- | --- | --- |
| 前向平衡 | `wall/pf_active/tf`机器描述，`equilibrium/core_profiles/pulse_schedule/summary`按需；导体模型需要时加入`pf_passive` | 前向输入与结果分开，不虚构诊断观测 |
| 平衡重构 | 上述机器描述、`magnetics`及实际使用的诊断、误差/先验；输出`equilibrium` | 重构有逆问题证据；存量平衡回放不授予重构能力 |
| 输运 | `core_profiles/core_sources/core_transport/transport_solver_numerics`按所选模型需要 | 物种、径向坐标、源项、时间网格与数值收敛分别描述 |
| 工程设计 | 合适的机器IDS + EngineeringProfile；FUSE扩展独立保留 | 材料、网格、载荷、部件映射不因同名IDS而直接等价 |

首批互读套件使用小型、明确标为测试数据的fixture，不等候完整EXL放电。真实装置验证是后续独立轨道，不把测试fixture冒充观测。

## 6. 传统技术栈接入方式

| 技术/资产 | 默认接入 | 必需证据与限制 |
| --- | --- | --- |
| Fortran/C++/旧Python | 受控批处理入口 + namelist/原生输入包 + collector | 程序/编译器/依赖hash、退出与partial语义；原语言保留 |
| 库调用 | worker内部可选C ABI/ISO_C_BINDING/F2PY | 内存所有权、数组顺序、精度、可重入性、线程安全；不进Web进程 |
| MATLAB | 独立受控MATLAB worker；已编译包另注册Runtime资格 | Engine需要匹配MATLAB；Runtime不能自动替代，资源/授权单独核对 |
| MDSplus | 只读站点DataAdapter，冻结tree/shot/node/查询/窗口快照 | 保留信号值、raw、dimensions、单位及标定来源；无任意客户端TDI入口 |
| EFIT/G-EQDSK | 原文件 + 专门equilibrium mapping | COCOS、ψ的2π约定、Ip/Bt/q符号、R/Z顺序、边界及shot/time来源 |
| HDF5/NetCDF | 格式专用reader + semantic profile | dimensions、dtype、scale/offset、fill value不能在转换中静默改变 |
| Slurm/MPI/OpenMP | ExecutionBackend + stage-in/out；原生modules或Apptainer | job回执不等于完成；站点MPI/线程/网络/硬件逐项验证 |
| 动态联合仿真 | 单独有状态协议/受控coupler，按需FMI | initialize/step、事件、checkpoint/rollback和收敛经验证才开放 |

批处理包装符合已有[EFIT输入输出](https://efit-ai.gitlab.io/efit/namelist.html)。ABI路径参考[GNU Fortran C互操作](https://gcc.gnu.org/onlinedocs/gfortran/Interoperability-with-C.html)；MATLAB两条路径分别核对[Engine要求](https://www.mathworks.com/help/matlab/matlab-engine-for-python.html)与[已编译包/Runtime](https://www.mathworks.com/help/compiler_sdk/gs/create-a-python-application-with-matlab-code.html)。

G-EQDSK是格式，不决定数据属于reconstructed还是simulated。尤其[FreeQDSK](https://freeqdsk.readthedocs.io/en/stable/geqdsk.html)对其`cocos`参数有不完整处理的说明；不能把调用参数当成完整COCOS转换验证。MDSplus保留装置权威源，参考[Signal定义](https://www.mdsplus.org/index.php/Documentation%3Adt_signal)与[官方thin client](https://github.com/MDSplus/mdsthin)。

## 7. 兼容验收与首期子任务

资格维度分别记录`native-preserved / schema-aligned / roundtrip-tested / migration-tested / workflow-qualified`及pending/passed/failed，不视为必须依次获得的单一等级。支持A→B不自动意味着B→A；支持某组字段不扩大到全部IDS。

最低测试覆盖：标量/数组/AoS、非规则时间、occurrence、缺失；单位/轴顺序/COCOS/物种；上下误差界和不对称误差；表达式物化、扩展字段损失；未知DD/不支持格式拒绝；迁移前后功率/电流/几何等适用不变量。库或backend升级重测对应矩阵。

| 子任务 | 映射既有票据 | 退出条件 |
| --- | --- | --- |
| INT-001 实际schema与目标DD清单 | SIM-003、005 | DD、扩展、字段子集及digest确定 |
| INT-002 语义fixture与负例 | SIM-003、011 | TS/Python/Julia相关消费者对字段/单位/缺失一致 |
| INT-003 Julia↔OMAS交换试验 | SIM-010、011 | 固定JSON或hierarchical HDF5之一，双方向字段测试；保留原生 |
| INT-004 Julia↔官方读写栈试验 | SIM-004、011、021 | 固定tensorized HDF5/Core/backend组合；能力实际支持才授予资格 |
| INT-005 显式DD迁移 | SIM-005、014 | 有版本化recipe、覆盖/损失报告；历史数据需要时实施 |
| INT-006 传统文件包参考程序 | SIM-004、011、018 | 原生执行与适配执行数值一致，错误/部分结果可解释 |
| INT-007 MDSplus/GEQDSK只读导入 | SIM-014、021、025 | 授权快照、原始文件、坐标映射和来源身份完整 |
| INT-008 兼容矩阵CI | SIM-027 | 升级触发对应测试，未验证组合拒绝运行 |

INT是既有SIM票据的细化，不是已额外完成的任务。P0完成001/002设计与样例；P1优先完成003和006的低成本合同试验。004及实际结构化FUSE输出资格在对应路径上线前通过，不能成为全部静态页面的前置条件。

首期不统一安装全IMAS生态、不导入整套装置数据库、不改写旧代码、不承诺全IDS互通。具体安装来源、版本与依赖以实施时实测为准；本轮只进行了源码/官方资料核验。
