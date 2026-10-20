# ROCOS-Viz

ROCOS 机器人可视化与控制 Web 前端。通过浏览器查看机械臂三维模型、实时状态和数据曲线，并连接 ROCOS 控制器执行点动、精确运动与参数配置。

项目目前处于 **rc 测试阶段**，当前版本以 [package.json](package.json) 为准。本仓库包含前端和用于模型展示的简易测试服务；完整运动控制需要连接提供 ROCOS HTTP API 的后端。

## 功能概览

| 功能 | 说明 |
| --- | --- |
| 三维可视化 | 从控制器加载 URDF 及网格，随关节状态更新模型；支持旋转、缩放、预设视角、坐标轴、线框、地面和轨迹显示 |
| 状态监控 | 显示连接、使能、工作模式和机器人状态；优先使用 WebSocket，连接异常时回退到 HTTP 轮询 |
| 控制权管理 | 连接后申请控制权，按服务端建议间隔发送心跳；显示控制权状态，支持确认后接管和断开时释放 |
| 点动控制 | 关节与笛卡尔点动；支持 BASE、FLANGE、TOOL、OBJECT 参考系，以及冗余机械臂的 SVD 零空间点动 |
| 精确运动 | 提供 MoveJ、MoveJ_IK、MoveL、MoveL_FK 指令入口，以及速度比例、暂停、恢复和停止操作 |
| 实时曲线 | 四路图表，可选择关节位置、速度、力矩、负载和法兰位置数据 |
| 阻抗参数 | 读取与设置关节、笛卡尔空间刚度和阻尼，支持 JSON 导入、导出 |
| 界面设置 | 中英文切换、明暗主题、控制面板折叠与宽度调整、曲线浮窗拖动 |

### 当前功能边界

- 系统设置中已实现阻抗参数页；系统状态、安全、坐标系、IO 和维护页目前仅有导航入口。
- API 客户端已封装 Lua 脚本上传、运行、暂停、恢复、停止、单步及列表、源码下载接口；脚本编辑组件及脚本列表、下载入口尚未接入当前主界面。
- 部分控制界面按七关节机械臂设计；其他自由度机器人的适配需结合具体模型与控制器验证。

## 快速开始

### 环境准备

- Node.js：需要 **20.19+（20.x）或 22.12+**；已使用 **Node.js 24.22.0 / npm 11.19.1** 完成安装、测试和生产构建。
- 支持 WebGL 的桌面浏览器，并开启硬件加速。
- 可访问的 ROCOS 控制器；没有控制器时，可使用下方测试服务查看模型和模拟状态。

### 安装与启动

```bash
git clone https://github.com/rocos-sia/rocos-viz.git
cd rocos-viz
npm ci
npm run dev
```

默认打开 `http://localhost:5173`。Vite 默认将 `/api` 和 `/ws` 请求代理到本机 `127.0.0.1:8080`。

### 安装提示

- `packages are looking for funding` 是依赖的赞助提示，不影响运行。
- `whatwg-encoding@3.1.1 deprecated` 来自 `blockly → jsdom` 的间接依赖，表示该包已弃用，不代表安装失败。当前保留 Blockly 12 的兼容性，等待上游依赖迁移；不要直接将它强制替换为 API 不同的 `@exodus/bytes`。
- 新版 npm 默认拦截尚未授权的依赖安装脚本。本项目通过 `package.json` 的 `allowScripts` 按版本授权 esbuild 的二进制安装校验脚本。以后升级 esbuild 如再次出现提示，先运行 `npm install-scripts ls` 检查，审阅后执行 `npm install-scripts approve esbuild`，再运行 `npm rebuild esbuild`；授权命令本身不会执行安装脚本。旧版 npm 不支持这些命令，无需执行。详见 [npm 安装脚本授权说明](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/)。
- 出现漏洞提示时先运行 `npm audit` 查看来源。依赖修复后需同步提交 `package.json` 和 `package-lock.json` 并运行测试、构建；不要直接运行 `npm audit fix --force`，它可能引入不兼容的主版本升级。

### 连接机器人后端

支持两种连接方式：

**通过开发代理连接**：启动时指定后端地址，例如以下 Bash 命令：

```bash
ROBOT_HOST=192.168.1.100 ROBOT_PORT=8080 VITE_PORT=5173 npm run dev
```

在页面连接对话框中填写 `127.0.0.1`，即可使用同源代理。此时实际后端地址和端口由启动环境变量决定，更换代理目标后需要重启 Vite。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `ROBOT_HOST` | `127.0.0.1` | 开发代理指向的控制器主机 |
| `ROBOT_PORT` | `8080` | 开发代理指向的控制器端口 |
| `VITE_PORT` | `5173` | 前端开发服务端口 |

**浏览器直连控制器**：在连接对话框中填写控制器的非回环 IP 或主机名及端口，请求将直接发往该地址。后端需要支持跨域访问，并允许 `X-Rocos-Control-Token`、`X-Rocos-Client-Id` 等请求头。HTTPS 页面需配合可访问的 HTTPS/WSS 后端或同源反向代理。

### 基本操作

1. 在连接对话框中填写地址和端口，点击连接。成功后自动获取控制器 URDF 模型并开始接收状态。
2. 查看顶部控制权状态。若控制权由其他客户端持有，可继续观察；需要操作时，通过接管按钮确认接管。
3. 取得控制权后使能机器人，选择工作模式、参考系及速度比例，在右侧点动或精确运动页操作。实际可用操作由控制器状态决定。
4. 打开曲线窗口查看实时数据，点击图表选择数据源；通过工具栏切换视角、显示选项、语言和主题。
5. 在系统设置的阻抗参数页读取当前值，编辑后应用；JSON 导入后仍需点击应用才会写入控制器。
6. 结束使用时，通过界面的断开连接操作释放控制权。机器人进入 `ERROR_STATE` 时，界面会显示复位入口。

## 无控制器时查看模型

仓库提供基于 Python 标准库的简易 URDF 测试服务，已验证 Python 3.10 可用，无需安装额外 pip 依赖。在仓库根目录另开终端运行：

```bash
python3 server/urdf_server.py --port 8080 --urdf server/models/talon/robot.urdf
```

再运行 `npm run dev`，在页面连接 `127.0.0.1:8080`。也可以省略 `--urdf`，使用默认的简单机械臂模型。

测试服务提供 URDF、网格文件和模拟状态等接口，**不提供完整控制权、运动、脚本和阻抗接口**。它适合查看模型及曲线，控制权相关请求可能返回 404。该脚本依赖 Python 的 `cgi` 模块，运行环境需提供此模块。

## 构建与验证

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务 |
| `npm run build` | 执行 TypeScript 检查并生成 `dist/` |
| `npm run preview` | 本地预览生产构建 |
| `npm run test:control` | 验证控制权凭据、心跳、重试与清理行为 |
| `npm run test:script` | 验证脚本列表、源码下载、文件名编码及错误处理 |
| `npm run test:scene` | 验证模型透明度恢复、关节轴正方向与辅助图形清理 |
| `npx eslint src` | 手动执行 ESLint，仓库未配置 `lint` 脚本 |

自动化测试使用 Node.js 内置测试框架及模拟网络响应，不能替代真实控制器联调。

生产部署时，将 `dist/` 作为站点根目录提供静态服务，并按连接方式配置控制器地址。若使用同源连接，需在部署服务中将 `/api` 和 `/ws` 反向代理到控制器，并启用 WebSocket 转发。开发环境的 `ROBOT_HOST`、`ROBOT_PORT` 不会自动成为生产环境的代理配置；`npm run preview` 用于本地预览。

## 项目结构

```text
src/
  components/   控制面板、连接、图表与系统设置等界面
  core/         REST/WebSocket 客户端、心跳、模型加载与运动学
  hooks/        连接生命周期与曲线采集
  stores/       Zustand 状态管理
  scene/        Three.js 三维场景
  i18n/         中英文词典
  styles/       全局样式与主题
public/         字体与图标
server/         简易 Python 测试服务和示例模型
test/           协议与控制权回归测试
docs/           API 协议和说明
.agents/skills/ 项目技能（版本维护、UI/UX Pro Max）
```

前端使用 React 18、TypeScript、Vite、Ant Design、Zustand、Three.js / React Three Fiber 和 ECharts。

## 常见问题

- **连接失败**：确认控制器地址、端口以及 `/api/robot/info` 是否可访问；使用开发代理时检查启动环境变量，直连时检查浏览器网络面板中的跨域错误。
- **模型空白或网格缺失**：检查 `/api/robot/urdf`、`/api/robot/urdf/mesh` 是否可访问，以及 URDF 中引用的网格是否由控制器提供。
- **无法启动三维视图**：开启浏览器硬件加速，检查 WebGL 和显卡驱动。三维视图异常时，控制面板仍可显示。
- **操作提示没有控制权或令牌失效**：检查顶部持有者状态，确认是否被其他客户端接管或会话已过期；按需重新取得控制权。

## 协议与贡献

- [OpenAPI 协议](<docs/ROCOS  API.openapi.yaml>)：对照前后端接口定义。
- [贡献指南](AGENTS.md)：目录约定、代码风格与验证要求。
- [版本维护技能](.agents/skills/project-versioning/SKILL.md)：提交前确认更新类型；内部测试递增 `rc.N`，确认 patch 发布时递增补丁号并移除 rc 后缀。

提交问题时，请附上前端版本、控制器版本、连接方式、复现步骤及相关浏览器日志。
