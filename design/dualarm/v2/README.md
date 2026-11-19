# 双臂上位机 v2：实时 App 接入

独立 React/Vite 入口，复用单臂的位姿显示、单位和模型显示代码，不修改单臂控制 store、SDK 或路由。双臂协议使用本地 `rocos-mujoco/dualarm-openapi.yaml`（0.4.1-local）。

默认连接真实双臂 App。`?mode=demo` 才是原本的交互预案；演示模式的运动、状态和标定数据不代表机器人运行结果。

## 运行

在 rocos-viz 根目录执行：

```bash
npx vite build --config design/dualarm/v2/vite.config.mjs
npx vite preview --config design/dualarm/v2/vite.config.mjs --host 127.0.0.1 --port 5186
```

打开 http://127.0.0.1:5186 。开发时使用 `npx vite --config design/dualarm/v2/vite.config.mjs`。
预案复用现有依赖，模型构建资源来自同级 `rocos-mujoco/config/dualarm`，产物输出到本目录 `dist/`。

## 页面与协议对应

| 页面 | 设计内容 | 正式接入路径 |
| --- | --- | --- |
| 常驻双臂状态 | 主站 0/1、独立控制权、使能、软件停止 | `/api/arms`；按臂 `control/status/acquire/release/heartbeat`、`robot/state/enable/disable/stop` |
| 手动示教 | 共享模型、两臂反馈、明确操作臂、关节/笛卡尔/零空间/SVD 点动 | 按臂 `robot/jog/{joint,cartesian,nullspace,svd,stop}` |
| 精确运动 | MoveJ、MoveJ_IK、MoveL、MoveL_FK；暂停、继续、复位 | 按臂 `robot/{movej,movej_ik,movel,movel_fk,pause,resume,reset}` |
| 工具与标定 | 普通 TCP 与已配置工具包；六点采集、计算、保存、明确激活 | 按臂 `robot/tool_frames/tool_frame`、`calibration/{pose,run,result,save}`、`robot/active_tool_frame` |
| 坐标与负载 | 工具/工件坐标、激活、文件保存/加载；质量和法兰坐标系质心 | 按臂 `robot/{tool_frame,object_frame,active_tool_frame,active_object_frame,frames/load,frames/save,load_params,load_params/save}` |
| 模型资源 | 一份完整双臂 URDF、15 个网格下载 | `/api/workcell/{model,urdf,urdf/mesh}` |
| 控制器日志 | 实时告警、操作反馈、文件预览/下载；按来源/级别/关键词筛选 | 诊断端口 `/api/dualarm/logs`、`/api/dualarm/logs/stream`、`/api/logs/file/latest` |

“按臂”路径前缀是 `/api/arms/{left|right}/`。界面角度 °、长度 mm；SDK 接入必须分别换算为 rad/m，保存后以服务端回读为准。

## 当前接入范围

- 默认通过同源 `/api` 代理连接 `http://127.0.0.1:8080`。开发、preview 都配置了代理；可用 `DUALARM_APP_ORIGIN` 更改目标，修改后重启 Vite。正式部署需要同等反向代理。
- 启动时读取 `/api/arms` 和 `/api/workcell/model`，校验两臂关节名和运动链。模型、网格、基座坐标系来自 App，`?base=shoulder` 仅影响演示模式；真实页面以 App 配置为准。
- 两臂分别轮询真实状态，接收后约 100 ms 再发下一次请求，不重叠轮询。超过 750 ms 未收到有效反馈锁定本臂新操作；使能、状态机、关节、法兰/TCP/工件位姿均来自 App。表格行的提示包含 App 时间戳，两臂不是同一时刻同步采样。
- 控制权需要用户分别申请；每个标签页使用随机 client_id，左右 token 分离保存在本标签页的 sessionStorage，不写入 localStorage 或日志。刷新后先用原凭据发送心跳验证，成功才恢复操作权限，不重复申请。每 2 秒维持心跳；短暂网络失败保留 token 并锁定新操作，恢复后重新验证。明确凭据失效或用户释放时清除对应臂缓存。Web Locks 防止复制标签页沿用同一身份；新标签页保持只读。页面关闭后租约由 App 超时回收。浏览器禁止会话存储时会提示刷新前释放控制权。
- 已接入使能/下使能、关节/笛卡尔/零空间/SVD 点动、停止、暂停/继续和故障复位。速度初值 0.01，滑动条上限 0.50 仅是页面输入上限，运动仍受 App 限位约束。
- 点动串行请求，响应后约 50 ms 续发；App watchdog 为 0.25 s。松开、移出按钮、切臂/换页、失焦、页面隐藏、请求失败、控制权失效或反馈过期均取消续发，并尝试发送本臂停止。开始请求尚未返回时，等它结束后发送停止，避免开始请求越过停止请求。网络中断时不能以页面按钮状态认定已经停止。
- 按臂显示请求错误与当前 ERROR_STATE；连接或操作恢复后，旧提示归档为“已恢复”，诊断事件保留为历史，不再覆盖当前操作状态。固定提示区域避免点动按钮跳动；请求记录及日志仍保留错误码、时间和 request_id。当前运行故障不能清除掩盖。
- 诊断自动连接与日志页输入共用已保存的有效地址；没有保存地址时使用当前主机的 8082 端口。日志失败不伪造运行成功，控制反馈与日志连接独立。
- 精确运动已接入真实 App：MoveJ / MoveL_FK 将 7 轴目标从 ° 换算为 rad；MoveJ_IK / MoveL 将 mm 换算为 m，归一化四元数。MoveJ_IK 使用本臂求解基座下的法兰目标，MoveL 使用当前工具目标，支持填入当前反馈。仅本臂控制权已验证、反馈有效、已使能且运动停止时允许下发；请求失败显示本臂错误，执行状态由实时反馈确认，超时不自动重发。
- 工具、六点标定、坐标与负载已接入真实 App：按臂读取、应用和保存；工具/工件激活与定义保存分开，文件操作只使用本臂默认路径。已配置工具包可标定，不能从本页导入/导出包；保存仅提交 session_id，安装位姿及原包资源由服务端保留。采点只提交工具名、点号和会话 ID，不传浏览器位姿。误差阈值 mm 转为 m；重采或修改阈值后必须重新计算。保存成功后回读，不自动激活。释放/丢失控制权及 frames/load 会清除本地标定会话。
- 精确运动受理后锁定本臂重复运动下发，显示等待反馈、运行、暂停、停止、故障及到位校验。只有受理之后的新反馈、至少三个静止样本及目标偏差满足阈值才显示“反馈已到位”：关节目标最大偏差小于 0.001 rad，位姿目标位置小于 0.5 mm、姿态小于 0.002 rad。MoveL_FK 采用关节终点的保守验证；不同逆解分支即使工具到位，也可能显示“到位未确认”。静止但偏差未满足不认定完成；HTTP 超时保留结果未知状态，不自动重发。记录只关联本标签页下发的目标，不提供服务端任务 ID，也不宣称双臂同步。
- 示教页请求提示合并到标题行；反馈表使用固定列宽，输入区独立滚动，暂停/继续与复位固定在操作栏底部。1440×900 可直接看到七轴点动；数据刷新不改变点动行位置。精确运动输入草稿不随轮询覆盖。
- 状态机名称使用加粗文字和不同颜色：IDLE 灰、STOPPED 绿、RUNNING/点动蓝、PAUSED 琥珀、过渡状态橙、ERROR/FAULT 红；颜色之外保留原状态名称。三维设置及相机按模型 revision 独立保存，切页和刷新恢复，窗口尺寸变化不重置视角。实时入口、配置页和日志使用同一语言设置。
- 不提供双臂同步启动或联合轨迹；两臂各自执行。URDF 下载只包含 XML，网格文件需另外下载。

## 实时接入验证

```bash
node --test test/dualarm-control.test.mjs test/dualarm-frames.test.mjs test/dualarm-logs.test.mjs
# 浏览器拦截全部控制请求：验证动态反馈布局、四种精确运动请求和错误归属，不驱动实际机械臂
node design/dualarm/v2/check-motion-layout.mjs
node design/dualarm/v2/check-features.mjs
node --test test/dualarm-motion.test.mjs test/dualarm-configuration.test.mjs
# 真实 App 控制权测试：申请、刷新恢复、释放、断线与凭据失效；不使能、不运动
node design/dualarm/v2/check-session.mjs
# 以下测试会获取控制权并实际点动已启动的 MuJoCo 双臂，不用于真实硬件：
node design/dualarm/v2/check-live.mjs
```

浏览器联调检查真实状态/位姿/模型、左右独立申请与使能、实际关节点动及松开停止、笛卡尔 Z 点动、错误仅显示在对应臂、反馈过期锁定和请求详情。请求拒绝与断线由浏览器路由注入；运行错误也可由实际 App 速度限位产生。测试结束停止、必要时复位、下使能并释放自己的租约。

当前接近伸直的姿态下，Z 点动曾触发关节速度限位（SpeedLimit -2310），即使较低笛卡尔输入速度也可能发生。页面会展示真实 ERROR_STATE 和底层日志；此接入没有修改求解器或放宽控制器限位。

## 设计依据与检查

延续前一轮 Framed sheet（seed 1578383472，无重抽）；保留 ROCOS 蓝色主操作、单臂页面熟悉的 3D/状态/控制关系。左蓝右青用于运动链身份，文字同时标明左右。当前操作臂与两侧停止按钮始终明确。

主问题：当前操作的是哪条臂、另一臂是否仍在执行？标定页主问题：六点是否齐全、结果是否计算/保存/激活？

采用设计技能的应用界面规范。UI/UX 检索的首轮落到了营销页布局，因此没有采纳 Hero/CTA；窄化查询后只参考实时监控的状态反馈建议，布局仍继承现有 HMI。

检查：

```bash
node design/dualarm/v2/check.mjs
npm run test:control
npm run test:script
npm run build
```

`check.mjs` 使用显式 `?mode=demo`，需要已启动预览服务和系统 Chrome，验证模型加载、按住点动、并发独立 MoveJ、独立停止、工具包标定步骤、重采失效、控制权变更、两臂会话隔离、空工具、模型下载、失联锁定、四种屏幕宽度及零控制器请求。详细结果见 `review.json`。


## 日志连接与验证

实时模式自动连接；也可打开 http://127.0.0.1:5186/#logs ，填写**诊断服务**地址，例如 `http://127.0.0.1:8082`。
不是控制接口的 8080 端口。日志客户端只保存诊断地址，日志请求不携带控制凭据。
一次历史读取后用 `next_id` 订阅 SSE，切换页面仍保留唯一订阅；断开或换地址取消旧请求，
防止旧结果回写。事件按 id 去重，浏览器保留最近 1000 条；服务端 gap 会明确提示缺失。
“操作反馈”包括 INFO 操作及底层状态消息；受理与实际运动完成没有任务关联，不据日志自动重发命令。
文件预览最多读取前 256 KiB，下载由浏览器处理完整当前文件快照；均不包含轮转历史。
日志页保持只读。页面请求记录（包括网络错误）位于独立折叠区；从臂模块进入时默认筛选对应臂。

```bash
node --test test/dualarm-logs.test.mjs
node design/dualarm/v2/check-logs.mjs
```

日志浏览器测试用本地 HTTP/SSE 服务提供明确标为“验证”的测试记录，验证单订阅、去重、
筛选、gap、断线 Last-Event-ID、文件预览/下载、取消过期请求、速度条键盘操作和三种宽度。
`logs.jpg` / `logs-*.png` 为该测试的视觉截图，不代表当前机器人的真实状态。
后台真实两 Robot / MuJoCo 日志归属验证在 rocos-app 的 `dualarm/tests/integration_mujoco.py`。


真实联调截图：`logs-live.jpg` 来自自建的 MuJoCo 双臂测试进程，展示真实 HTTP/SSE
返回的左右 MoveJ 受理及参数拒绝事件。`check-live-logs.mjs` 可在该集成测试运行期间
验证页面；它只发送 GET，不申请控制权或下发运动。

## 顶部控制栏与三维反馈（2026-11-18）

以下保留最初预案的设计记录，示例行为适用于 `?mode=demo`。默认实时模式的功能与反馈来源以“当前接入范围”为准。

按已确认预览实现大场景、窄操作栏、底部双臂数据表。两臂模块移至页面顶部，分别展示状态机字符串、使能和控制权，管理工具按钮先选择对应臂再进入工具页面。顶部已有按臂停止，操作栏只保留暂停/继续和复位。

三维视图复用单臂 `src/scene/RobotVisuals.ts` 的关节坐标系、URDF 关节正方向和透明材质逻辑；显示设置支持双臂/左臂/右臂范围、场景原点、基座、法兰、TCP、工件、名称和轨迹。支持正视、侧视、俯视、复位取景及全屏。轨迹上限 1000 个点，清除或工具切换时重置，只记录打开轨迹后的有效预览数据。

`src/dualarm/scene/frames.ts` 按当前配置明确映射 `base_link → Left_Link7/Right_Link7`。两条链共用基坐标系，基座轴只绘制一次；场景原点与基座重合时合并标签，不人为制造肩部基坐标系。模型自动取景只计算机器人网格，不把坐标辅助线和轨迹计入包围范围。

底部同时显示两臂七关节及 XYZ/RX/RY/RZ。各臂可分别选择法兰、工具、工件；复用单臂 `displayPose` / `preciseReference` 的 RPY（ZYX）转换以及 `useUnits` 全局单位设置。当前法兰反馈来自浏览器 URDF FK；TCP/工件是独立的本地示例定义，新增/保存/激活后，坐标轴与位姿使用同一数据。坐标框架无数据或该臂反馈过期时显示破折号。它们不是控制器实测反馈。

示例定义：两臂 TCP_01 均为法兰 +Z 100 mm，probe_package 为 (20,10,130) mm；Workpiece_01 为基座 (400,±200,0) mm，旋转均为单位四元数。六点保存使用页面已标示的示例 (15,-10,100) mm。正式接入须替换为各臂控制器帧快照，不能采用这些演示值。

新验证：`node --experimental-strip-types --test test/dualarm-frames.test.mjs`，`node design/dualarm/v2/check-layout.mjs`。后者覆盖 FK 按臂更新、坐标选择、单位、轴显示范围、按臂工具入口、失联空值、全屏/视角及响应式布局。截图：`overview.jpg`、`scene-axes.jpg`；结果：`layout-review.json`。

## 肩部求解基坐标系试验

打开 `http://127.0.0.1:5186/?base=shoulder` 使用独立试验模型；不带该参数仍为原公共基座。
试验页的 `left_base` / `right_base` 位于各自 J1 之前，固定不随关节旋转。
反馈与工件坐标按当前臂肩部参考系表达；示例目标和已有示例工件已做平移转换，工具 TCP 保持法兰相对定义。
`MoveJ_IK` 的目标是法兰，`MoveL` 的目标是工具，页面明确区分。
运动仍为浏览器本地预览，不会因为选择试验模型而连接 App 执行运动。
坐标安装关系来自同级 MuJoCo 的 `config/dualarm/shoulder_frames.json`，原模型和试验模型都随构建打包。
完整启动、转换与回退说明见 [肩部试验说明](../../../../rocos-mujoco/config/dualarm/SHOULDER_TRIAL.md)。

启动独立预览后运行 `node design/dualarm/v2/check-shoulder.mjs`，验证两版反馈转换、J1 点动时基座固定、独立反馈、工件位置、模型下载和参考系标注。
