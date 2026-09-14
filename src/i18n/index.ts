/**
 * Lightweight i18n: a flat key → { en, zh } dictionary plus a `t()` resolver.
 *
 * Language lives in the UI store (`uiStore.language`). Components read it via the
 * `useT()` hook so switching re-renders immediately. `t(lang, key, vars)` is the
 * pure resolver for use outside React (e.g. inside event handlers / antd message).
 *
 * Default language is English. antd's own component text is switched separately
 * in App.tsx by feeding ConfigProvider the matching locale.
 */

export type Language = 'en' | 'zh';

type Entry = { en: string; zh: string };

const DICT = {
  // ---- App / toolbar ----
  'app.about': { en: 'About', zh: '关于' },
  'app.chart': { en: 'Chart', zh: '图表' },
  'app.settings': { en: 'Settings', zh: '设置' },
  'app.theme.toLight': { en: 'Switch to light mode', zh: '切换为浅色模式' },
  'app.theme.toDark': { en: 'Switch to dark mode', zh: '切换为深色模式' },
  'app.lang.toEn': { en: 'Switch to English', zh: '切换为英文' },
  'app.lang.toZh': { en: '切换为中文', zh: '切换为中文' },
  'view.axonometric': { en: 'Axonometric', zh: '轴测图' },
  'view.top': { en: 'Top', zh: '俯视图' },
  'view.front': { en: 'Front', zh: '前视图' },
  'view.right': { en: 'Right', zh: '右视图' },

  // ---- Connection ----
  'conn.connected': { en: 'Connected', zh: '已连接' },
  'conn.disconnected': { en: 'Disconnected', zh: '未连接' },
  'conn.clickToConnect': { en: 'Not connected · click to connect', zh: '未连接 · 点击连接' },
  'conn.clickToOpen': { en: 'Click to open the connection dialog', zh: '点击打开连接窗口' },
  'conn.clickToDisconnect': { en: 'Click to disconnect', zh: '点击断开连接' },
  'conn.disconnectTitle': { en: 'Disconnect', zh: '断开连接' },
  'conn.disconnectConfirm': { en: 'Disconnect from {target}?', zh: '确定要断开 {target} 吗？' },
  'conn.disconnect': { en: 'Disconnect', zh: '断开' },
  'conn.cancel': { en: 'Cancel', zh: '取消' },
  'conn.connect': { en: 'Connect', zh: '连接' },
  'conn.dialogTitle': { en: 'Connect to Robot Controller', zh: '连接机器人控制器' },
  'conn.ipAddress': { en: 'IP Address', zh: 'IP 地址' },
  'conn.port': { en: 'Port', zh: '端口' },
  'conn.autoLoadModel': { en: 'Auto-load robot model', zh: '自动加载机器人模型' },
  'conn.needIpPort': { en: 'Please enter IP address and port', zh: '请输入 IP 地址和端口号' },
  'conn.success': { en: 'Connected successfully', zh: '连接成功' },
  'conn.failed': { en: 'Connection failed: {msg}', zh: '连接失败: {msg}' },

  // ---- Status bar ----
  'status.enabled': { en: 'Enabled', zh: '已使能' },
  'status.disabled': { en: 'Disabled', zh: '未使能' },
  'status.time': { en: 'Time', zh: '时间' },
  'status.running': { en: 'Running', zh: '运行时长' },

  // ---- Scene toggles ----
  'scene.axes': { en: 'Axes', zh: '坐标轴' },
  'scene.mesh': { en: 'Mesh', zh: '网格' },
  'scene.ground': { en: 'Ground', zh: '地面' },
  'scene.trajectory': { en: 'Trajectory', zh: '轨迹' },

  // ---- 3D viewport error ----
  'scene.error.title': { en: '3D viewport unavailable', zh: '3D 视图无法显示' },
  'scene.error.hint': {
    en: 'WebGL could not start. Enable hardware acceleration in the browser, update the GPU driver, or open the page in Chrome/Edge. The control panels still work.',
    zh: 'WebGL 无法启动。请在浏览器中开启硬件加速、更新显卡驱动，或改用 Chrome/Edge 打开。控制面板仍可正常使用。',
  },

  // ---- Enable ----
  'enable.enable': { en: 'Enable', zh: '使能' },
  'enable.enabled': { en: 'Enabled', zh: '已使能' },
  'enable.disabled': { en: 'Disabled', zh: '未使能' },
  'enable.enableTip': { en: 'Enable robot', zh: '使能机器人' },
  'enable.disableTip': { en: 'Disable robot', zh: '禁用机器人' },
  'enable.didEnable': { en: 'Robot enabled', zh: '已使能' },
  'enable.didDisable': { en: 'Robot disabled', zh: '已禁用' },
  'enable.opFailed': { en: 'Operation failed: {msg}', zh: '操作失败: {msg}' },

  // ---- Common ----
  'common.connectFirst': { en: 'Please connect to the robot first', zh: '请先连接机器人' },
  'common.sent': { en: '{cmd} sent', zh: '{cmd} 已发送' },

  // ---- Work mode ----
  'mode.label': { en: 'Mode', zh: '模式' },
  'mode.position': { en: 'Position', zh: '位置模式' },
  'mode.ee_admit_teach': { en: 'EE Admittance Teach', zh: '末端执行器导纳示教' },
  'mode.jnt_admit_teach': { en: 'Joint Admittance Teach', zh: '关节导纳示教' },
  'mode.jnt_imp': { en: 'Joint Impedance', zh: '关节阻抗' },
  'mode.cart_imp': { en: 'Cartesian Impedance', zh: '笛卡尔阻抗' },
  'mode.switched': { en: 'Work mode switched to: {mode}', zh: '工作模式已切换为: {mode}' },
  'mode.switchFailed': { en: 'Switch failed: {msg}', zh: '切换失败: {msg}' },

  // ---- Frame selector ----
  'frame.label': { en: 'Frame', zh: '坐标系' },
  'frame.BASE': { en: 'BASE', zh: '基座坐标系' },
  'frame.FLANGE': { en: 'FLANGE', zh: '法兰坐标系' },
  'frame.TOOL': { en: 'TOOL', zh: '工具坐标系' },
  'frame.OBJECT': { en: 'OBJECT', zh: '工件坐标系' },

  // ---- Speed ----
  'speed.label': { en: 'Speed Scaling', zh: '速度比例' },

  // ---- Motion Control ----
  'motion.label': { en: 'Motion Control', zh: '运动控制' },
  'motion.start': { en: 'Start', zh: '开始' },
  'motion.pause': { en: 'Pause', zh: '暂停' },
  'motion.nextStep': { en: 'Next Step', zh: '单步执行' },
  'motion.stop': { en: 'Stop', zh: '停止' },
  'motion.started': { en: 'Motion started', zh: '运动已开始' },
  'motion.paused': { en: 'Motion paused', zh: '运动已暂停' },
  'motion.stepped': { en: 'Step executed', zh: '已执行单步' },
  'motion.stopped': { en: 'Motion stopped', zh: '运动已停止' },

  // ---- Control panel tabs ----
  'tab.jog': { en: 'Jog', zh: '点动控制' },
  'tab.precise': { en: 'Precise', zh: '精确控制' },

  // ---- Jog panels ----
  'jog.jointSpace': { en: 'JOINT SPACE', zh: '关节空间' },
  'jog.cartesianSpace': { en: 'CARTESIAN SPACE', zh: '笛卡尔空间' },
  'jog.nullSpace': { en: 'NULL SPACE', zh: '零空间' },
  'jog.noJointData': { en: 'Connect the robot to see joint data', zh: '连接机器人后显示关节数据' },
  'jog.negative': { en: 'Jog negative', zh: '负方向点动' },
  'jog.positive': { en: 'Jog positive', zh: '正方向点动' },

  // ---- Units ----
  'unit.degTip': { en: 'Current: deg (click for rad)', zh: '当前：度 (点击切换为弧度)' },
  'unit.radTip': { en: 'Current: rad (click for deg)', zh: '当前：弧度 (点击切换为度)' },
  'unit.mmTip': { en: 'Current: mm (click for m)', zh: '当前：mm (点击切换为 m)' },
  'unit.mTip': { en: 'Current: m (click for mm)', zh: '当前：m (点击切换为 mm)' },

  // ---- Precise control ----
  'precise.title': { en: 'Precise Control', zh: '精确控制' },
  'precise.cartesianSpace': { en: 'Cartesian Space', zh: '笛卡尔空间' },
  'precise.jointSpace': { en: 'Joint Space', zh: '关节空间' },
  'precise.position': { en: 'Position', zh: '位置' },
  'precise.orientation': { en: 'Orientation', zh: '姿态' },
  'precise.run': { en: 'Run', zh: '运行' },

  // ---- Plot ----
  'plot.realtimeCurves': { en: 'Realtime Curves', zh: '实时曲线' },
  'plot.chartConfig': { en: 'Chart {n} Configuration', zh: '图表 {n} 配置' },
  'plot.dataSource': { en: 'Data source', zh: '数据源' },
  'plot.jointIndex': { en: 'Joint index', zh: '关节索引' },
  'plot.group.joint': { en: 'Joint Data', zh: '关节数据' },
  'plot.group.flange': { en: 'End Pose', zh: '末端位姿' },
  'plot.src.position': { en: 'Position (J1-J7)', zh: '位置 (J1-J7)' },
  'plot.src.velocity': { en: 'Velocity (J1-J7)', zh: '速度 (J1-J7)' },
  'plot.src.torque': { en: 'Torque (J1-J7)', zh: '力矩 (J1-J7)' },
  'plot.src.load': { en: 'Load (J1-J7)', zh: '负载 (J1-J7)' },
  'plot.title.jointPosition': { en: 'Joint Position', zh: '关节位置' },
  'plot.title.jointVelocity': { en: 'Joint Velocity', zh: '关节速度' },
  'plot.title.jointTorque': { en: 'Joint Torque', zh: '关节力矩' },
  'plot.title.flangeX': { en: 'End Position X', zh: '末端位置 X' },

  // ---- Control Rights ----
  'control.acquired': { en: 'Control acquired', zh: '已获取控制权' },
  'control.notHeld': { en: 'No control right', zh: '未获取控制权' },
  'control.takeover': { en: 'Force takeover', zh: '强制夺权' },
  'control.takeoverTitle': { en: 'Force Takeover', zh: '强制夺权' },
  'control.takeoverConfirm': { en: 'The control right is held by {owner}. Force takeover?', zh: '控制权当前由 {owner} 持有，确定强制夺权？' },
  'control.takeoverOk': { en: 'Takeover', zh: '夺权' },
  'control.takeoverCancel': { en: 'Cancel', zh: '取消' },
  'control.takeoverSuccess': { en: 'Control right acquired', zh: '已成功获取控制权' },
  'control.takeoverFailed': { en: 'Takeover failed: {msg}', zh: '夺权失败: {msg}' },
  'control.reset': { en: 'Reset robot', zh: '机器人复位' },
  'control.resetSuccess': { en: 'Robot reset successfully', zh: '机器人已成功复位' },
  'control.resetFailed': { en: 'Reset failed: {msg}', zh: '复位失败: {msg}' },
  'control.acquireFailed': { en: 'Failed to acquire control: {msg}', zh: '获取控制权失败: {msg}' },

  // ---- System Settings ----
  'settings.title': { en: 'System Settings', zh: '系统设置' },
  'settings.nav.system-status': { en: 'System Status', zh: '系统状态' },
  'settings.nav.impedance': { en: 'Impedance', zh: '阻抗参数' },
  'settings.nav.safety': { en: 'Safety', zh: '系统安全' },
  'settings.nav.coordinate': { en: 'Coordinate', zh: '坐标系' },
  'settings.nav.io': { en: 'IO Configuration', zh: 'IO 配置' },
  'settings.nav.maintenance': { en: 'Maintenance', zh: '系统维护' },

  // ---- Impedance panel ----
  'imp.jointSpace': { en: 'Joint Space', zh: '关节空间' },
  'imp.cartesianSpace': { en: 'Cartesian Space', zh: '笛卡尔空间' },
  'imp.joint': { en: 'Joint {n}', zh: '关节 {n}' },
  'imp.stiffness': { en: 'Stiffness', zh: '刚度' },
  'imp.damping': { en: 'Damping', zh: '阻尼比' },
  'imp.baseFrame': { en: 'Base Frame', zh: '基坐标系' },
  'imp.toolFrame': { en: 'Tool Frame', zh: '工具坐标系' },
  'imp.import': { en: 'Import', zh: '导入' },
  'imp.export': { en: 'Export', zh: '导出' },
  'imp.refresh': { en: 'Refresh', zh: '刷新' },
  'imp.apply': { en: 'Apply', zh: '应用' },
  'imp.connectFirst': { en: 'Please connect to the robot first', zh: '请先连接机器人' },
  'imp.refreshed': { en: 'Refreshed', zh: '已刷新' },
  'imp.refreshFailed': { en: 'Refresh failed: {msg}', zh: '刷新失败: {msg}' },
  'imp.applied': { en: 'Parameters applied', zh: '参数已应用' },
  'imp.applyFailed': { en: 'Apply failed: {msg}', zh: '应用失败: {msg}' },
  'imp.imported': { en: 'Imported', zh: '已导入' },
  'imp.importError': { en: 'Invalid file format', zh: '文件格式错误' },

  // ---- Panel / misc ----
  'panel.expand': { en: 'Expand control panel', zh: '展开控制面板' },
  'panel.collapse': { en: 'Collapse control panel', zh: '收起控制面板' },
  'panel.resizeTip': { en: 'Drag to resize panel width', zh: '拖动调节面板宽度' },
  'model.noLinks': { en: 'Robot model has no links, check controller config', zh: '机器人模型无 links，请检查控制器配置' },
  'model.fetchFailed': { en: 'Failed to fetch robot model: {msg}', zh: '获取机器人模型失败: {msg}' },
} as const satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof DICT;

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/** Pure resolver — safe to call outside React. */
export function t(
  lang: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const entry = DICT[key];
  if (!entry) return key;
  return interpolate(entry[lang] ?? entry.en, vars);
}
