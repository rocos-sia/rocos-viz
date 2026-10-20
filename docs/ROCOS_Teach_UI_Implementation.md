# ROCOS Teach UI 首轮实现

设计基线：[ROCOS_Teach_UI_Design_Spec_v1.0.md](ROCOS_Teach_UI_Design_Spec_v1.0.md)。本轮按内部测试提交，软件版本由 `3.0.0-rc.2` 更新为 `3.0.0-rc.3`，保留现有控制器接口。

## 运行与预览

使用 Node.js 20.19+，执行 `npm ci`、`npm run dev`。从 `/#/dashboard` 进入总览；首次打开无需控制器，即可浏览七个页面。连接参数仍通过顶部“连接”对话框配置。默认开发代理参数保持 `ROBOT_HOST`、`ROBOT_PORT`、`VITE_PORT`。

离线浏览时，所有真实控制命令禁用；示例程序、IO、点位及执行步骤都有标识。真实脚本操作位于“程序编程 → Lua 编辑”。“运行调试”当前用于确认本地示例交互，不执行控制器程序。

## 代码入口

- `src/components/teach/TeachShell.tsx`：路由、全局状态、导航及控制栏。
- `src/hooks/useControllerSession.ts`：原有连接、控制权和模型生命周期；切页持续运行。
- `src/components/teach/`：七个页面与共用卡片、场景、点位面板。
- `src/stores/teachStore.ts`：独立示例数据及本地草稿；不会污染实时状态。
- `src/styles/teach.css`：设计令牌、桌面/Pad/手机布局；`useMotionScope` 管理 Anime.js 生命周期。
- `src/core/HeldJog.ts` / `src/hooks/useHeldJog.ts`：串行点动与输入取消清理。
- `src/core/TelemetryBuffer.ts` / `src/hooks/useTelemetryCollector.ts`：独立采集环形缓存。
- `public/demo/talon/`：复用仓库已有 Talon URDF/STL 的离线示例，不需要请求控制器模型接口。

## 3D 显示控件

场景上方居中显示轴测、俯视、前视、右视四个图标；下方居中显示半透明、坐标轴、关节轴、地面、轨迹五个开关。两组按钮均为 32×32 CSS px，浮动栏高度为 42px，支持中英文悬停提示与键盘聚焦提示。模型坐标轴使用加粗的实体箭杆与末端箭头，红、绿、蓝分别表示局部 X、Y、Z 正方向。

半透明开关将模型材质的不透明度设为原值的 30%，关闭后恢复原始材质设置。坐标轴与关节轴独立控制，不隐式改变透明度。关节轴使用 URDF 的关节局部 `axis`，直箭头表示轴正方向；旋转关节（revolute / continuous）另绘制按右手规则的正向旋转弧箭头，移动关节（prismatic）仅显示直箭头。固定及无单一运动轴的关节不绘制此标记。演示和在线模型共用 `RobotVisuals.ts`，加载完成后读取最新开关状态，卸载时清理订阅和辅助图形。

## 验证

```sh
npm run test:control
npm run test:script
npm run test:teach
npm run test:scene
npm run test:ui
npm run build
```

UI 回归默认启动或复用 `127.0.0.1:5188`，需要本机安装 Chrome。覆盖七页离线导航、预览操作不发送 `/api/` 请求、工程导出、语言切换、1920/1024/390 CSS px 布局、固定停止栏，以及 REST/WebSocket 拦截环境下的点动停止与会话持续性。截图保存在忽略提交的 `test-results/`。

待实机验证：控制器支持的运动/脚本状态枚举、断网及控制权失效时的设备停止行为、完整 URDF 加载、低性能 Pad 的 3D 与曲线并发性能。软件停止入口仍不是硬件急停。

## 实际界面截图

以下为浏览器实际渲染截图（离线示例状态），与设计规范中的概念图分开保存。

![1920×1200 总览](assets/rocos-teach/dashboard-implemented.png)

![1920×1200 手动示教](assets/rocos-teach/teaching-implemented.png)

![1024×768 Pad 手动示教](assets/rocos-teach/pad-implemented.png)

本轮验证结果：构建通过；控制心跳 6 项、脚本协议 7 项、点动及缓存 5 项、浏览器 5 项测试通过。新增与重构模块的定向 ESLint 检查及 `git diff --check` 通过。未连接真实控制器执行运动，未测量目标 Pad 的硬件性能。
