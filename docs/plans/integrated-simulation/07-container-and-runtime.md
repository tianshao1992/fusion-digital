# 容器化引擎接入与多执行后端

状态：拟实施设计，2026-09-06。回答“不同计算引擎和模型能否统一放在Docker中接入”。本轮没有创建镜像、启动容器或修改运行环境。

## 1. 核心决策

采用 **Docker/OCI作为首期默认运行包装，EngineAdapter与数据/任务合同作为统一接入标准**。容器统一依赖和进程运行方式；IMAS/Engineering profile统一科学数据语义；Gateway统一研究、权限和生命周期。三层不能互相替代。

“挂载”如果指把程序装入容器运行，方向合理；如果指直接把主机源码目录mount进去，适合开发调试，但不能作为可复现发布方式。正式运行固定RuntimePackage身份：DockerBackend用镜像digest及平台架构，Apptainer用SIF digest，原生backend用executable digest及环境锁。输入/权重单独冻结，不直接运行用户正在编辑的checkout。[Docker镜像引用与digest](https://docs.docker.com/engine/containers/run/)。

```text
FusionDigital：01物理 / 02工程 / 仿真设计工作台
  → BFF → Simulation Gateway：授权、预检、RunSpec、运行事件
    → Runner / ExecutionBackend
      ├─ DockerBackend（首期）：FUSE / Python / Fortran-C++批处理镜像
      ├─ SlurmBackend（按需）：Apptainer或站点原生MPI环境
      └─ ManagedWorkerBackend（按需）：MATLAB/商业CAE/受控原生服务
    → DataAdapter / IMAS Bridge：原生输入输出与规范数据互转
    → Object Store + Data Catalog → ResultManifest → 通用结果界面
```

这是职责图，不要求每个框立即成为微服务。前端只提交能力、模型、工况和资源档位，不接收或发送Docker命令。

## 2. 引擎、模型、镜像与运行不能混为一个对象

| 对象 | 保存什么 | 何时产生新版本 |
| --- | --- | --- |
| ModelRevision | 方程/假设、有效域、参数定义、模型卡 | 科学模型或其含义改变 |
| EngineRelease | 求解实现与源码、支持能力 | 实现/依赖变更 |
| RuntimePackage | OCI镜像或其他可执行环境描述 | 构建/环境改变；固定digest |
| ModelArtifact | 权重、查表、材料/校准数据等不可变制品 | 数据内容改变，独立digest |
| AdapterRelease | 参数映射、原生文件、错误/结果解释 | 接口或解释规则改变 |
| RunSpec / Attempt | 这次计算选择的精确组合 / 一次执行 | 参数、输入、模型等变化新run；允许重试新attempt |

通常一个镜像承载一个稳定依赖环境及一组兼容能力，可服务多个ModelRevision；同一模型也可能有多个引擎实现。不要为每个扫描点、每次炮次或每份权重构建新镜像。权重/材料/输入从受控目录解析成只读固定制品；模型含可执行代码时按软件发布审核，不允许借“权重上传”执行pickle或远程代码。

FUSE首期保持一个集成计算包与原子运行节点，内部actors作可观测trace。不是一个actor一个容器，也不是整个FusionDigital与所有求解器装进同一镜像。只有边界数据稳定且测量表明有收益时才拆分。

## 3. 每个接入包必须交付什么

定义EnginePackage为逻辑发布清单，而非新的强制归档格式：

- `descriptor`：engine/model/capability绑定、adapter版本、参数schema、输入输出profile、运行模式。
- `runtimePackageRef`：精确镜像/可执行环境digest、OS/arch、加速器与外部依赖要求。
- `entrypoint contract`：固定入口、参数模板、目录约定、退出码/日志/进度和结果候选规范。
- `qualification refs`：兼容测试、原生对比、用途基准、已知限制。运行兼容性/数据合同/访问门禁未通过则拒绝提交；尚未取得科学用途资格的配置，可在明确授权的探索/验证模式下运行并标记`unvalidated`，不能作为已合格工程决策或结果发布。
- `provenance/build refs`：源码、依赖锁、编译器/构建参数、软件物料清单、许可与保留策略。

普通用户只选择已注册package和白名单参数。Gateway解析并冻结ModelRevision、EngineRelease、AdapterRelease、runtime、数据/映射/评估等引用；不同运行环境不能在失败重试时静默替换。

外部统一生命周期仍为[04引擎协议](04-engines-and-api.md)中的describe/validate/submit/status/cancel/collect/health。镜像内部首期只需支持受控CLI和文件协议，不要求每个求解器都提供FastAPI、暴露端口或理解PostgreSQL。

## 4. 首期默认：每个Attempt一个批处理容器

| 阶段 | 平台职责 | 容器内职责 |
| --- | --- | --- |
| 预检 | 检查授权、package、profile、资源、许可证依赖与输入hash | 可执行轻量环境/原生参数检查，不启动未授权大计算 |
| 准备 | 以attemptId隔离sandbox；stage-in并校验；固定容器身份 | 不任意下载新依赖或修改模型版本 |
| 执行 | 启动、inspect、事件/租约、资源观测、持久取消意图 | 读取输入、运行原程序、输出日志/进度和原生文件 |
| 收集 | 容器退出后读取输出；结构/安全/完整性检查；写对象存储 | 输出result candidate和诊断，允许partial |
| 封存 | 以fencing/CAS登记唯一ResultManifest；记录执行与科学状态 | 不自行宣布公开发布或直接写业务数据库 |

拟议容器内目录：`/job/spec`与`/job/input`只读，`/job/output`是本attempt可写持久暂存目录，`/job/scratch`为带配额临时空间。主机目录由Runner依据attemptId创建和校验，客户端不得指定任意路径；不要把整个`D:\Code`、用户目录或装置档案挂入容器。

首期求解器不持有对象存储长期凭据：Runner负责搬运与封存。必要的大规模直接IO另设最小范围短期凭据和记录，不把密钥写入镜像、RunSpec或日志。

容器结束不立即自动删除诊断证据；收集完成后才按保留政策清理运行资源。容器重启策略不代替平台retry，batch job不启用会隐藏重复执行的无限自动重启。Docker job用持久attempt标签/身份查重，回执丢失先inspect/reconcile，不盲目再启动。

## 5. 常驻服务与强耦合是两种后续模式

| 模式 | 适用 | 额外责任 |
| --- | --- | --- |
| `batch-job`，默认 | 平衡/输运/工程分析、参数扫描 | 每attempt隔离，原生进程和结果清楚 |
| `managed-service`，可选 | Julia预热成本显著、低延迟推理、昂贵模型加载 | 请求幂等、并发上限、会话隔离、状态重置、服务实例/模型加载身份 |
| `coupled-session`，专项 | 时域联合仿真或紧耦合计算 | step/time/event/rollback/收敛协议与时步级性能资格 |

是否采用常驻FUSE worker先测JIT/加载、计算和导出耗时；有可测收益再建warm pool。常驻不意味着共享可变`dd`或跨研究复用隐含状态；需要输入独立、请求间污染测试和失败后回收策略。

控制面可以HTTP/SSE；大数组走文件/对象存储/专用数据通道；MPI或耦合迭代在合适的进程/集群边界内完成。不让每一个网格交换、物理时间步或FUSE actor都穿过浏览器和REST。

## 6. Docker不是唯一执行后端

| 执行环境 | 选择 | 边界 |
| --- | --- | --- |
| 本地/单机Linux计算 | DockerBackend默认 | CPU/RAM/GPU配置与资源队列显式管理 |
| Windows开发机 | 有需要时使用WSL2/Linux容器开发profile，保留原生调试 | Linux镜像不能直接执行仅Windows可用的二进制；这不是本轮安装指令 |
| 超算/HPC | Slurm + Apptainer或原生Environment Modules | 按站点MPI、通信和安全策略验证，不强求Docker daemon |
| 商业软件/特定硬件环境 | 受控专用worker或受支持容器 | 操作系统、驱动、许可服务与授权方式先核对 |
| 大规模集群 | 需求明确后增加Kubernetes等后端 | 不作为首个FUSE闭环前提，不自动替代科学调度政策 |

[Slurm sbatch](https://slurm.schedmd.com/sbatch.html)提交成功只表示作业已接收，且不自动搬运脚本之外的用户文件；所以stage-in/out、排队、运行、收集必须分别管理。[Apptainer MPI](https://apptainer.org/docs/user/latest/mpi.html)仍有host/container MPI兼容约束；SIF或OCI包不能单独保证跨集群可运行。

RuntimePackage采用可区分形式：OCI镜像digest、SIF内容digest、原生executable+环境锁。若从OCI生成SIF，两种内容身份都登记转换关系，不复用一个hash；Slurm是调度后端，不是一种镜像格式。

环境锁补充编译器与flags、MPI/PMI/PMIx、BLAS/OpenMP、nodes/ranks/threads/affinity、GPU型号与驱动、OS/arch及站点module release。GPU驱动/内核等宿主条件不能靠镜像全部封装；复现等级仍按字节、容差或统计性质分别声明。

## 7. 隔离与资源治理

容器不是任意不可信科学代码的充分沙箱。首期仅运行维护者审核的镜像/adapter，独立计算主机或计算资源池；不把科学作业默认放到当前公开网站生产主机。公开匿名站继续禁止计算写API。

Docker daemon只由受限Runner控制，不暴露给浏览器、不把socket挂入求解器、不允许用户提交任意image/command/mount/device。输出包按路径、大小、类型与hash检查，拒绝路径穿越、越界链接和危险反序列化。Docker官方也特别警示Web调度容器时的参数检查和daemon权限风险。[安全说明](https://docs.docker.com/engine/security/)。

默认非root、尽可能只读根文件系统、最小capabilities、无privileged/host network、网络默认拒绝或目标白名单。需要GPU或许可证网络时单独审批资源profile并回归，不全局放开。多租户不可信代码如未来确需支持，应另立隔离架构，不直接沿用首期受信任worker。

资源必须同时有平台级准入和作业内限制：CPU/RAM/GPU/并发/队列、scratch与输出预算、执行deadline和停止宽限。Docker默认不会替每个容器设置资源上限；限制一个容器也不等于对全项目进行排队和配额管理。[Docker资源约束](https://docs.docker.com/engine/containers/resource_constraints/)。

## 8. 首期实施与验收

Compose用于开发环境的Gateway/PostgreSQL/对象存储等常驻依赖；通用Runner按任务创建计算容器。Compose本身是多容器应用配置/生命周期工具，平台仍需实现排队、重试、配额和科学结果管理。[Docker Compose](https://docs.docker.com/compose/)。不要为每个研究动态修改一份共享compose文件。

| 子任务 | 映射既有票据 | 完成证据 |
| --- | --- | --- |
| RUN-001 EnginePackage与runtime形式 | SIM-004、005、012 | 镜像/模型/参数分离，未来非OCI形式不改Web合同 |
| RUN-002 DockerBackend与sandbox | SIM-016、018 | 真实FUSE任务启动、stage-in/out、身份查重及封存闭环 |
| RUN-003 资源/权限/停止策略 | SIM-013、019、028 | OOM、队列、超时、取消、Runner重启、部分输出故障测试 |
| RUN-004 原生与容器基准 | SIM-011、018、027 | 相同固定输入下数值/单位/轴/异常一致；结果不只看exit=0 |
| RUN-005 模型独立升级与替换 | SIM-005、011、027 | 不重建引擎即可切换兼容数据/权重；新run固定新digest |
| RUN-006 后端可替换试验 | SIM-004、016、026 | 本地受控进程reference backend通过同合同；HPC上线前另做真实站点资格 |

RUN是既有SIM票据的细化。P0锁RUN-001和参考fixture；P2完成002–005及必要恢复测试；006先用低成本本地后端验证抽象，不把真实HPC接通写成已实现。

验收额外检查：同镜像两次运行工作目录互不污染；同模型不同参数不产生新镜像；镜像/依赖/权重变化生成新锁；移除容器后历史结果仍可读；IMAS跨库读写单独按[06兼容章](06-imas-and-legacy-interoperability.md)验收。能够启动容器，不等于完成引擎集成。
