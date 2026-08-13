# EXL-50U 公开简化派生网格：威胁模型与发布门禁

## 1. 决策与不可承诺的边界

项目所有者已明确授权：将 **EXL-50U 的简化、脱敏、非工程权威派生网格**作为浏览器 GLB 公开发送，以支持逐部件选择、显隐、隔离、透明度和剖切。授权不包含原始 CAD、STEP/STP、PPT/PPTX、压缩包、工程权威网格、私有文件路径或其他源数据。

公开 GLB 一旦发送到浏览器，就可以从缓存、开发者工具、网络请求或图形调试工具中保存。隐藏下载按钮、禁用右键、混淆 URL、`no-store`、短期签名 URL、CORS 或水印都不能使已发送的网格“不可下载”。本项目对“禁止下载”的可验证解释是：

- 不提供模型下载按钮或下载型链接；
- 不发布原始工程文件，只发布经授权的简化派生物；
- 清晰声明派生物可被技术性保存、不得作为工程权威依据；
- 用清单、哈希、体积预算和 CI 白名单确保部署物没有越界。

如果未来的要求变成“几何不能到达用户设备”，则必须停止公开 GLB，改用服务端远程渲染；这与逐部件浏览器实时几何是互斥的安全边界。

## 2. 三种交付方案

| 方案 | 可实现的交互 | 几何保密边界 | 仍无法阻止 | 适用结论 |
| --- | --- | --- | --- | --- |
| 公开 GLB / 客户端渲染 | 最完整；部件选择、显隐、透明、剖切、拾取 | 浏览器获得简化网格；源 CAD 留在私有域 | 保存公开 GLB、截图、从公开网格估算外形 | 当前已获授权方案 |
| 预渲染组合 | 固定角度、固定透明/剖切/细节预设 | 不发送可编辑网格 | 保存图片、截图、多视图近似重建 | 未授权公开网格时的降级方案 |
| 服务端远程渲染 | 可做交互流或按请求渲染，但延迟和成本较高 | 几何保留在受控服务端 | 截图、录屏、通过大量视图推断形状 | 对真正受限网格的推荐方案 |

## 3. 公开 GLB 的强制发布合同

EXL 条目必须由 `device-catalog.json` 显式选择 `real-3d` 和 `public-static`，且只能指向一个同源、规范化的 `/models/.../model-manifest.json`。DeviceManifest 1.1 必须满足：

- `devicePackage.kind = public-simplified-derivative`；
- `devicePackage.authority = illustrative`；
- `access.classification = PUBLIC`；
- `access.redistributionAllowed = true`；
- `access.engineeringUseAllowed = false`；
- `access.statement` 明确包含用户授权、公开、简化派生物的含义；
- `assets.webModel` 具有同源 `.glb` 路径、实际字节数和 SHA-256；
- 不存在 `assets.sourceCad`；
- `disclaimer` 明确其不是工程权威模型，不可用于制造、尺寸校核、CAE 或安全决策；
- 部件 ID 与 GLB 节点映射唯一，数量与文件体积受预算限制；
- EXL 不参与几何叠加比较，页面始终传入 `showDownloadActions=false`。

ITER 继续保持 `metadata-only` 与 `local-only`，其任何 CAD、网格或派生几何都不得进入仓库、`public/` 或构建产物。

## 4. 存储、身份、授权和审计

公开站点不需要通过登录来“保护”已经决定公开的 GLB；给公开对象套登录或短期 URL 只会增加复杂度，不能撤回已经交付的数据。认证和授权应放在发布链路：

- 原始 EXL 数据进入独立的私有对象存储或 PLM/PDM，默认拒绝公网，和网站部署凭据分离；
- 派生作业使用最小权限服务身份，只能读经批准的源版本、写隔离的候选区；
- 发布批准使用组织身份登录、MFA 和角色分离；建议至少由资产所有者和发布者两人复核；
- 审计记录源版本/哈希、派生脚本及版本、派生 GLB 哈希、批准人、批准时间、适用授权、上线版本和撤回记录；
- 只有通过 CI 白名单的派生 GLB 与 DeviceManifest 可以复制到公开静态存储；源桶不得与公开桶共享前缀或同步规则。

公开对象应返回 `Cache-Control: no-store`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`、`Cross-Origin-Resource-Policy: same-origin` 和 `Content-Disposition: inline`。这些响应头是降低缓存、热链和误下载的纵深措施，不是访问控制。

## 5. 防滥用与运营

CDN/WAF 可以对异常高频请求、枚举和热链设置速率限制并记录事件，但不得把速率限制描述为防下载。对公开 GLB 使用可观测性告警：请求量突增、非本站来源、连续 Range 抓取、异常 User-Agent、哈希不一致或未登记版本访问。撤回流程应同时删除公开对象、清理 CDN、回退 catalog，并保留审计证据；已经被第三方保存的副本无法远程销毁。

若采用服务端远程渲染，则必须额外具备 OIDC/MFA、装置级 RBAC、短时会话、每用户并发与渲染预算、GPU 作业隔离、输入参数白名单、完整审计、私有存储、输出水印及反自动化策略。即便如此，像素和录屏仍可被保存。

## 6. CI / 发布回归

发布门禁必须自动验证：

1. EXL 只允许 catalog 所声明清单中的单一简化 `.glb`；其他 EXL 几何、STEP/STP、PPT/PPTX、压缩包和私有路径全部失败。
2. ITER 的任何几何或源文件全部失败。
3. EXL 清单的授权、派生类型、非工程用途和免责声明字段完整；不得包含 `sourceCad`。
4. GLB 路径同源且规范化，真实文件字节数和 SHA-256 与清单一致，并低于公开交付预算。
5. catalog 保持 `showDownloadActions=false`、EXL `overlayEligible=false`；服务端 HTML 不出现 GLB/STEP 下载链接或本地路径。
6. EXL 清单与 GLB 的防御性响应头存在；未知 viewer mode、未知 EXL 网格或缺字段条目必须 fail closed。
7. 构建后的 `dist/` 再执行同一白名单检查，防止构建或复制步骤引入越界文件。

## 7. Preview / High 双 LOD 发布合同

EXL 浏览器派生包可以提供 preview 与 high 两档，但两档属于同一份公开授权和同一 DeviceManifest 的原子交付，不得通过第二份清单、隐藏 URL 或目录枚举绕过发布门禁：

- preview 与 high 必须位于同一受控包，分别声明稳定角色、规范化同源路径、实际字节数、SHA-256 和三角形数；不得存在第三个未声明 GLB；
- preview 不超过 20 MiB 和 750,000 个三角形；high 不超过 30 MiB 和 2,000,000 个三角形；
- 两档都必须只包含同一组 12 个系统网格，mesh 数、可选 node 名称与 manifest 部件映射完全一致，不得以 high 档夹带额外装配树、工程属性或隐藏节点；
- high 必须使用 `EXT_meshopt_compression`，并声明绝对挠度 0.35 mm、角挠度 0.25 rad、锐边法线保留策略；这些参数描述派生过程，不构成尺寸精度、CAD 对比或工程权威声明；
- manifest 和界面必须继续说明两档均为非工程可视化派生物，不可用于制造、尺寸校核、CAE、安全决策或配置控制；
- manifest 只能声明一个默认档且桌面默认 high；当视口不超过 650 px、`saveData=true` 或 `deviceMemory<4` 时，运行时必须在首次请求几何前降级 preview。切换不得同时长期驻留两档的几何、材质和 GPU buffer；
- 估算 GPU 解析占用必须进入清单或构建时 QA：至少统计解压后的 position、normal、index 及其他 attribute/accessor buffer，再加纹理和合理的运行时余量。移动端单装置增量建议不超过 160 MiB，桌面端不超过 300 MiB；无法证明预算时 high 必须 fail closed；
- `/device-assets/exl50u-interactive/` 只允许 manifest、poster 和两项 GLB 的精确白名单。GET、HEAD 与 Range/206 必须经过 Worker 并带相同安全响应头；旧 `/models/exl50u-interactive/*` 及任何未知、编码或遍历路径必须返回 404；
- SSR HTML 不得直出任一 GLB URL、下载属性或模型下载链接。浏览器运行时从 manifest 选择资产不改变“已发送数据可被技术性保存”的既有边界。

双 LOD 自动回归至少验证：同一 manifest 原子声明、固定路径和唯一角色、两档 bytes/hash/GLB header、各自三角形预算、12 mesh/node 映射等价、high 的 meshopt required extension 与派生参数、GPU 解析估计门禁、Worker GET/HEAD/Range 安全头、旧路径和恶意路径 404、SSR 无直链/下载，以及构建产物中不存在未声明 EXL 几何。
