# 双臂上位机页面预案 v2

独立 React/Vite 交互预案，对照现有单臂 HMI 与 `rocos-mujoco/dualarm-openapi.yaml`（0.4.0-local）。保留前一版 `../dualarm-console.html`，独立页面新增 `src/dualarm/logs` 只读日志客户端和组件；保留单臂入口、控制 store、SDK 与路由。共享 i18n 仅增加双臂日志文案。

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

## 交互边界

- 日志页点击“连接日志”后，通过只读 GET/SSE 连接真实双臂诊断服务（默认 8082）。不申请控制权、不驱动 MuJoCo 或硬件；其他运动、状态与标定控件仍为本地预案。默认不自动连接。
- 模型及网格为实际项目资源；初始关节值、TCP 名称、控制权、负载与标定指标均为示例。
- MoveJ 与关节点动只在浏览器改变模型关节，不是动力学或安全轨迹模拟；演示限位 ±170° 不能作为真机限位。
- 笛卡尔、零空间、SVD、MoveJ_IK、MoveL、MoveL_FK 展示交互与反馈流程，未实现逆解或轨迹规划。
- 六点流程演示服务端会话语义，但没有运行标定算法。RMS 0.025 mm、最大误差 0.060 mm、条件数 18.4、轴夹角 89.8° 均明确标为页面示例。
- TCP 采集分臂；重采清除旧解；控制权变化要求 P1 新建会话；安装变化清除会话；保存不自动激活。
- 点动/目标运动速度均用滑动条，显示数值与单位；左右臂分别保留速度。范围 0.01–0.50 为演示上限，正式连接需依据模型/控制器限值。调节点动速度先停止当前点动，下次按住才使用新值；运动中不能修改已下发速度。
- 点动停止绑定原始操作臂，松开指针/键盘、切臂、换页、失焦与页面隐藏均停止。正式 SDK 还需串行点动续发、请求超时、停止排序与双凭据。
- 释放控制权不停止已经受理的普通运动。失联演示锁定按钮；真实设备失联不能据此判定机器人已经停止。
- 普通坐标系表单仅演示数据校验与列表更新；完整逐条回读/删除、文件失败恢复、控制器连接与认证生命周期留待正式 SDK 接入。
- 不提供同步启动按钮、全局急停、工具包导入/导出、拖拽、脚本、RCI/DDS 或联合轨迹入口。
- URDF 下载按钮只下载 XML；15 个 STL 单独列出，不能把 XML 当成完整模型包。

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

`check.mjs` 需要已启动预览服务和系统 Chrome，验证模型加载、按住点动、并发独立 MoveJ、独立停止、工具包标定步骤、重采失效、控制权变更、两臂会话隔离、空工具、模型下载、失联锁定、四种屏幕宽度及零控制器请求。详细结果见 `review.json`。


## 日志连接与验证

打开 http://127.0.0.1:5186/#logs ，填写**诊断服务**地址，例如 `http://127.0.0.1:8082`。
不是控制接口的 8080 端口。页面只保存地址，不保存或发送控制凭据。
一次历史读取后用 `next_id` 订阅 SSE，切换页面仍保留唯一订阅；断开或换地址取消旧请求，
防止旧结果回写。事件按 id 去重，浏览器保留最近 1000 条；服务端 gap 会明确提示缺失。
“操作反馈”包括 INFO 操作及底层状态消息；受理与实际运动完成没有任务关联，不据日志自动重发命令。
文件预览最多读取前 256 KiB，下载由浏览器处理完整当前文件快照；均不包含轮转历史。
日志页面不展示预案使能/控制权按钮，避免与真实诊断状态混淆。本地预案记录在独立折叠区。

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

按已确认预览实现大场景、窄操作栏、底部双臂数据表。两臂模块移至页面顶部，分别展示状态机字符串、使能和控制权，管理工具按钮先选择对应臂再进入工具页面。顶部已有按臂停止，操作栏只保留暂停/继续和复位。

三维视图复用单臂 `src/scene/RobotVisuals.ts` 的关节坐标系、URDF 关节正方向和透明材质逻辑；显示设置支持双臂/左臂/右臂范围、场景原点、基座、法兰、TCP、工件、名称和轨迹。支持正视、侧视、俯视、复位取景及全屏。轨迹上限 1000 个点，清除或工具切换时重置，只记录打开轨迹后的有效预览数据。

`src/dualarm/scene/frames.ts` 按当前配置明确映射 `base_link → Left_Link7/Right_Link7`。两条链共用基坐标系，基座轴只绘制一次；场景原点与基座重合时合并标签，不人为制造肩部基坐标系。模型自动取景只计算机器人网格，不把坐标辅助线和轨迹计入包围范围。

底部同时显示两臂七关节及 XYZ/RX/RY/RZ。各臂可分别选择法兰、工具、工件；复用单臂 `displayPose` / `preciseReference` 的 RPY（ZYX）转换以及 `useUnits` 全局单位设置。当前法兰反馈来自浏览器 URDF FK；TCP/工件是独立的本地示例定义，新增/保存/激活后，坐标轴与位姿使用同一数据。坐标框架无数据或该臂反馈过期时显示破折号。它们不是控制器实测反馈。

示例定义：两臂 TCP_01 均为法兰 +Z 100 mm，probe_package 为 (20,10,130) mm；Workpiece_01 为基座 (400,±200,0) mm，旋转均为单位四元数。六点保存使用页面已标示的示例 (15,-10,100) mm。正式接入须替换为各臂控制器帧快照，不能采用这些演示值。

新验证：`node --experimental-strip-types --test test/dualarm-frames.test.mjs`，`node design/dualarm/v2/check-layout.mjs`。后者覆盖 FK 按臂更新、坐标选择、单位、轴显示范围、按臂工具入口、失联空值、全屏/视角及响应式布局。截图：`overview.jpg`、`scene-axes.jpg`；结果：`layout-review.json`。
