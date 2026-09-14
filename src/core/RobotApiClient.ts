import type {
  ApiResponse,
  RobotInfo,
  RobotState,
  Pose,
  MotionResponse,
  TaskStatus,
  EnabledResponse,
  ControlOwnerData,
  ImpedanceData,
  SetImpedanceBody,
} from './types';
import {
  DEFAULT_SPEED_FACTOR,
  MAX_JOINT_SPEED,
  MAX_JOINT_ACCELERATION,
  MAX_CARTESIAN_SPEED,
  MAX_CARTESIAN_ACCELERATION,
} from './constants';

/**
 * 关节状态码映射（与后端 OpenAPI 一致）：
 *   0 = DISABLED（禁用）
 *   1 = FAULT（故障）
 *   2 = ENABLED（启用）
 */
function mapJointStatus(status: number | string): string {
  if (typeof status === 'number') {
    switch (status) {
      case 0: return 'DISABLED';
      case 1: return 'FAULT';
      case 2: return 'ENABLED';
      default: return 'DISABLED';
    }
  }
  return String(status).toUpperCase();
}

function mapState(raw: any): RobotState {
  const flange = raw.flange ?? {
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
  };

  return {
    joint_states: (raw.joint_states ?? []).map((j: any) => ({
      id: j.id,
      name: j.name ?? '',
      position: j.position ?? 0,
      velocity: j.velocity ?? 0,
      acceleration: j.acceleration,
      torque: j.torque ?? 0,
      load_torque: j.load_torque ?? j.load ?? 0,
      load: j.load ?? j.load_torque ?? 0,
      status: mapJointStatus(j.status ?? 0),
    })),
    flange,
    active_tool_frame: raw.active_tool_frame,
    active_tool_frame_name: raw.active_tool_frame_name,
    active_object_frame: raw.active_object_frame,
    active_object_frame_name: raw.active_object_frame_name,
    hw_state: raw.hw_state ?? {},
    robot_state: raw.robot_state,
    work_mode: raw.work_mode,
    is_enabled: raw.is_enabled,
    is_running: raw.is_running,
    control_active: raw.control_active,
    motion_busy: raw.motion_busy,
    timestamp: raw.timestamp,
  } as RobotState;
}

export class RobotApiClient {
  private baseUrl: string;

  constructor(host: string, port: number | string) {
    const normalizedHost = (host || '').trim();
    // Only treat explicit loopback addresses as local; user-entered remote IPs
    // (even if they match window.location.hostname) must connect directly so the
    // Vite dev-server proxy (fixed at startup) is not used with the wrong target.
    const isLocalHost = !normalizedHost ||
      normalizedHost === 'localhost' ||
      normalizedHost === '127.0.0.1' ||
      normalizedHost === '::1';

    this.baseUrl = isLocalHost ? window.location.origin : `${window.location.protocol}//${normalizedHost}:${port}`;
  }

  /** Full URL to the mesh download endpoint for this robot host. */
  getMeshBaseUrl(): string {
    return new URL('/api/robot/urdf/mesh', this.baseUrl).toString();
  }

  /** 获取当前保存的控制权 token（由外部 connectionStore 注入） */
  static getStoredToken(): string | null {
    try {
      const raw = localStorage.getItem('rocos-connection');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.state?.controlToken ?? null;
    } catch {
      return null;
    }
  }

  /** 获取或创建当前标签页的 client_id（sessionStorage 隔离，防止跨标签页窃取 token） */
  static getClientId(): string {
    const key = 'rocos_client_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    }

    console.log(`[RobotApiClient] ${method} ${url.toString()}`);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (method !== 'GET') {
      const token = RobotApiClient.getStoredToken();
      if (token) headers['X-Rocos-Control-Token'] = token;
      headers['X-Rocos-Client-Id'] = RobotApiClient.getClientId();
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);
    console.log(`[RobotApiClient] Response status: ${response.status}`);

    const text = await response.text();
    console.log(`[RobotApiClient] Response body length: ${text.length}`);

    if (!text) {
      throw new Error('Empty response from server');
    }

    const json: ApiResponse<T> = JSON.parse(text);
    console.log(`[RobotApiClient] Parsed response success:`, json.success);

    if (!json.success) {
      throw new Error(`API Error: ${json.message} (code: ${json.code})`);
    }

    return json.data;
  }

  // ─── Robot State ──────────────────────────────────────────────

  async connect(): Promise<RobotInfo> {
    return this.request('GET', '/api/robot/info');
  }

  /** GET /api/robot/state — 获取机器人完整状态 */
  async getRobotState(): Promise<RobotState> {
    const raw = await this.request<any>('GET', '/api/robot/state');
    return mapState(raw);
  }

  // ─── Basic Control ────────────────────────────────────────────

  async enable(): Promise<void> {
    return this.request('POST', '/api/robot/enable');
  }

  async disable(): Promise<void> {
    return this.request('POST', '/api/robot/disable');
  }

  /** POST /api/robot/reset — 清除报警并复位，仅在 ERROR_STATE 下有效。
   *  不抛出，返回原始响应，由调用方判断 success。 */
  async resetRobot(): Promise<ApiResponse<{ robot_state: string; enabled: boolean }>> {
    const url = new URL('/api/robot/reset', this.baseUrl);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Rocos-Client-Id': RobotApiClient.getClientId(),
    };
    const token = RobotApiClient.getStoredToken();
    if (token) headers['X-Rocos-Control-Token'] = token;
    const response = await fetch(url.toString(), { method: 'POST', headers });
    const json = await response.json();
    console.log('[RobotApiClient] /api/robot/reset response:', json);
    return json as ApiResponse<{ robot_state: string; enabled: boolean }>;
  }

  /** GET /api/robot/enabled — 查询使能状态（后端返回 enabled + disabled + robot_state） */
  async isEnabled(): Promise<EnabledResponse> {
    return this.request<EnabledResponse>('GET', '/api/robot/enabled');
  }

  /**
   * POST /api/robot/workmode — 设置工作模式
   * 注意：当前后端 handler 已被注释（no-op），调用会返回 404。
   * 保留此方法以便后端重新启用后直接可用。
   */
  async setWorkMode(mode: string): Promise<void> {
    return this.request('POST', '/api/robot/workmode', { mode });
  }

  // ─── Motion Control ───────────────────────────────────────────

  /** POST /api/robot/movej — 关节空间运动 */
  async moveJ(
    joints: number[],
    velocity?: number,
    acceleration?: number,
    jerk?: number,
  ): Promise<MotionResponse> {
    return this.request<MotionResponse>('POST', '/api/robot/movej', {
      joints,
      velocity: velocity ?? MAX_JOINT_SPEED * DEFAULT_SPEED_FACTOR,
      acceleration: acceleration ?? MAX_JOINT_ACCELERATION * DEFAULT_SPEED_FACTOR,
      jerk: jerk ?? 2.5,
    });
  }

  /** POST /api/robot/movel — 笛卡尔直线运动 */
  async moveL(
    pose: Pose,
    velocity?: number,
    acceleration?: number,
    jerk?: number,
    toolName?: string,
  ): Promise<MotionResponse> {
    const body: any = {
      pose,
      velocity: velocity ?? MAX_CARTESIAN_SPEED * DEFAULT_SPEED_FACTOR,
      acceleration: acceleration ?? MAX_CARTESIAN_ACCELERATION * DEFAULT_SPEED_FACTOR,
      jerk: jerk ?? 1.25,
    };
    if (toolName) body.tool_name = toolName;
    return this.request<MotionResponse>('POST', '/api/robot/movel', body);
  }

  /** POST /api/robot/movej_ik — 笛卡尔逆运动学 → 关节空间运动 */
  async moveJ_IK(
    pose: Pose,
    velocity?: number,
    acceleration?: number,
    jerk?: number,
  ): Promise<MotionResponse> {
    return this.request<MotionResponse>('POST', '/api/robot/movej_ik', {
      pose,
      velocity: velocity ?? MAX_JOINT_SPEED * DEFAULT_SPEED_FACTOR,
      acceleration: acceleration ?? MAX_JOINT_ACCELERATION * DEFAULT_SPEED_FACTOR,
      jerk: jerk ?? 2.5,
    });
  }

  /** POST /api/robot/movel_fk — 关节空间 → 笛卡尔直线运动 */
  async moveL_FK(
    joints: number[],
    velocity?: number,
    acceleration?: number,
    jerk?: number,
    toolName?: string,
  ): Promise<MotionResponse> {
    const body: any = {
      joints,
      velocity: velocity ?? MAX_CARTESIAN_SPEED * DEFAULT_SPEED_FACTOR,
      acceleration: acceleration ?? MAX_CARTESIAN_ACCELERATION * DEFAULT_SPEED_FACTOR,
      jerk: jerk ?? 1.25,
    };
    if (toolName) body.tool_name = toolName;
    return this.request<MotionResponse>('POST', '/api/robot/movel_fk', body);
  }

  /** POST /api/robot/movec — 圆弧运动（三点模式：pose_via + pose_to） */
  async moveC(params: {
    poseVia: Pose;
    poseTo: Pose;
    poseStart?: Pose;
    velocity?: number;
    acceleration?: number;
    jerk?: number;
  }): Promise<MotionResponse> {
    const body: any = {
      pose_via: params.poseVia,
      pose_to: params.poseTo,
      velocity: params.velocity ?? 0.25,
      acceleration: params.acceleration ?? 0.25,
      jerk: params.jerk ?? 2.5,
    };
    if (params.poseStart) body.pose_start = params.poseStart;
    return this.request<MotionResponse>('POST', '/api/robot/movec', body);
  }

  /** POST /api/robot/stop — 停止运动 */
  async stopMove(): Promise<MotionResponse> {
    return this.request<MotionResponse>('POST', '/api/robot/stop');
  }

  /** POST /api/robot/pause — 暂停运动 */
  async pauseMotion(): Promise<MotionResponse> {
    return this.request<MotionResponse>('POST', '/api/robot/pause');
  }

  /** POST /api/robot/resume — 恢复运动 */
  async resumeMotion(): Promise<MotionResponse> {
    return this.request<MotionResponse>('POST', '/api/robot/resume');
  }

  /** POST /api/robot/wait_move — 等待运动完成 */
  async waitMove(): Promise<MotionResponse> {
    return this.request<MotionResponse>('POST', '/api/robot/wait_move');
  }

  /** GET /api/robot/move_status — 查询运动/任务状态 */
  async getMoveStatus(taskId?: string): Promise<TaskStatus> {
    return this.request<TaskStatus>('GET', '/api/robot/move_status', undefined,
      taskId ? { task_id: taskId } : undefined,
    );
  }

  // ─── Jogging（全向量传递，方向编码在向量中）─────────────────

  /**
   * POST /api/robot/jog/joint — 关节点动
   * @param joints 关节方向向量（正值=正转，负值=反转），长度等于机器人关节数
   */
  async jogJoint(
    joints: number[],
    speed?: number,
    timeout?: number,
    dirThreshold?: number,
  ): Promise<MotionResponse> {
    const body: any = { joints };
    if (speed !== undefined) body.speed = speed;
    if (timeout !== undefined) body.timeout = timeout;
    if (dirThreshold !== undefined) body.dir_threshold = dirThreshold;
    return this.request<MotionResponse>('POST', '/api/robot/jog/joint', body);
  }

  /**
   * POST /api/robot/jog/cartesian — 笛卡尔点动
   * @param twist 6 维 twist 向量 [vx, vy, vz, wx, wy, wz]（正值=正向，负值=反向）
   * @param frame 参考坐标系 BASE / FLANGE / TOOL / OBJECT
   */
  async jogCartesian(
    twist: number[],
    frame?: 'BASE' | 'FLANGE' | 'TOOL' | 'OBJECT',
    speed?: number,
    timeout?: number,
    dirThreshold?: number,
  ): Promise<MotionResponse> {
    const body: any = { twist };
    if (frame) body.frame = frame;
    if (speed !== undefined) body.speed = speed;
    if (timeout !== undefined) body.timeout = timeout;
    if (dirThreshold !== undefined) body.dir_threshold = dirThreshold;
    return this.request<MotionResponse>('POST', '/api/robot/jog/cartesian', body);
  }

  /**
   * POST /api/robot/jog/nullspace — 零空间点动
   * @param joints 关节方向向量（正值=正转，负值=反转），后端投影到零空间执行
   */
  async jogNullspace(
    joints: number[],
    speed?: number,
    timeout?: number,
    dirThreshold?: number,
  ): Promise<MotionResponse> {
    const body: any = { joints };
    if (speed !== undefined) body.speed = speed;
    if (timeout !== undefined) body.timeout = timeout;
    if (dirThreshold !== undefined) body.dir_threshold = dirThreshold;
    return this.request<MotionResponse>('POST', '/api/robot/jog/nullspace', body);
  }

  /**
   * POST /api/robot/jog/svd — SVD 维度速度点动
   * @param dimSpeeds 各维度速度标量数组（正值=正向，负值=反向）
   */
  async jogSvd(
    dimSpeeds: number[],
    timeout?: number,
    dirThreshold?: number,
  ): Promise<MotionResponse> {
    const body: any = { dim_speeds: dimSpeeds };
    if (timeout !== undefined) body.timeout = timeout;
    if (dirThreshold !== undefined) body.dir_threshold = dirThreshold;
    return this.request<MotionResponse>('POST', '/api/robot/jog/svd', body);
  }

  /** POST /api/robot/jog/stop — 停止点动 */
  async jogStop(): Promise<MotionResponse> {
    return this.request<MotionResponse>('POST', '/api/robot/jog/stop');
  }

  // ─── URDF ─────────────────────────────────────────────────────

  /** POST /api/robot/urdf — 上传 URDF 文件到控制器，返回存储路径 */
  async uploadUrdf(file: File): Promise<{ path: string }> {
    const url = new URL('/api/robot/urdf', this.baseUrl);
    const formData = new FormData();
    formData.append('file', file);

    console.log(`[RobotApiClient] uploadUrdf: ${url.toString()} (${file.name})`);

    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
    });
    const json: ApiResponse<{ path: string }> = await response.json();
    if (!json.success) {
      throw new Error(`API Error: ${json.message} (code: ${json.code})`);
    }
    return json.data;
  }

  /** GET /api/robot/urdf — 获取当前 URDF 模型文件（XML 文本） */
  async getUrdf(): Promise<string> {
    const url = new URL('/api/robot/urdf', this.baseUrl);

    console.log(`[RobotApiClient] getUrdf: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/xml, text/xml, */*' },
    });
    if (!response.ok) {
      throw new Error(`URDF fetch failed: ${response.status}`);
    }
    return response.text();
  }

  /** 下载 URDF 引用的 mesh 文件（二进制 STL） */
  async downloadUrdfMesh(path: string): Promise<Blob> {
    const url = new URL('/api/robot/urdf/mesh', this.baseUrl);
    url.searchParams.append('path', path);

    console.log(`[RobotApiClient] downloadUrdfMesh: ${url.toString()}`);

    const response = await fetch(url.toString());
    console.log(`[RobotApiClient] downloadUrdfMesh status: ${response.status}`);

    return response.blob();
  }

  // ─── Lua Script ───────────────────────────────────────────────

  /** POST /api/script/upload — 上传脚本（上传后需调用 runScript() 执行） */
  async uploadScript(filename: string, source: string): Promise<void> {
    return this.request('POST', '/api/script/upload', { filename, source });
  }

  /** POST /api/script/run — 运行已上传的脚本 */
  async runScript(): Promise<void> {
    return this.request('POST', '/api/script/run');
  }

  /** POST /api/script/stop — 停止脚本 */
  async stopScript(): Promise<void> {
    return this.request('POST', '/api/script/stop');
  }

  /** POST /api/script/pause — 暂停脚本 */
  async pauseScript(): Promise<void> {
    return this.request('POST', '/api/script/pause');
  }

  /** POST /api/script/resume — 恢复脚本 */
  async resumeScript(): Promise<void> {
    return this.request('POST', '/api/script/resume');
  }

  /** POST /api/script/step — 单步执行脚本 */
  async stepScript(): Promise<void> {
    return this.request('POST', '/api/script/step');
  }

  // ─── Calibration ──────────────────────────────────────────────

  /**
   * POST /api/calibration/tool — 设置工具坐标系
   * 注意：已废弃，推荐使用 /api/robot/tool_frame。
   */
  async calibrateTool(name: string, frame: Pose): Promise<void> {
    return this.request('POST', '/api/calibration/tool', { name, frame });
  }

  /**
   * POST /api/calibration/object — 设置物体坐标系
   * 注意：已废弃，推荐使用 /api/robot/object_frame。
   */
  async calibrateObject(name: string, frame: Pose): Promise<void> {
    return this.request('POST', '/api/calibration/object', { name, frame });
  }

  // ─── Control Rights ───────────────────────────────────────────

  /** POST /api/control/acquire — 申请控制权（不抛出，返回原始响应） */
  async acquireControl(clientName?: string): Promise<ApiResponse<ControlOwnerData>> {
    const url = new URL('/api/control/acquire', this.baseUrl);
    const clientId = RobotApiClient.getClientId();
    const bodyObj: Record<string, string> = { client_id: clientId };
    if (clientName) bodyObj.client_name = clientName;
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Rocos-Client-Id': clientId,
      },
      body: JSON.stringify(bodyObj),
    });
    return response.json() as Promise<ApiResponse<ControlOwnerData>>;
  }

  /** POST /api/control/takeover — 强制抢占控制权（不抛出，返回原始响应） */
  async takeoverControl(clientName?: string): Promise<ApiResponse<ControlOwnerData>> {
    const url = new URL('/api/control/takeover', this.baseUrl);
    const clientId = RobotApiClient.getClientId();
    const bodyObj: Record<string, string> = { client_id: clientId };
    if (clientName) bodyObj.client_name = clientName;
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Rocos-Client-Id': clientId,
      },
      body: JSON.stringify(bodyObj),
    });
    return response.json() as Promise<ApiResponse<ControlOwnerData>>;
  }

  /** POST /api/control/release — 释放控制权 */
  async releaseControl(token: string): Promise<void> {
    const url = new URL('/api/control/release', this.baseUrl);
    await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Rocos-Control-Token': token,
        'X-Rocos-Client-Id': RobotApiClient.getClientId(),
      },
    });
  }

  /** GET /api/control/status — 查询控制权状态；携带 token 时顺便续期（返回原始响应，不抛出） */
  async getControlStatus(): Promise<ApiResponse<ControlOwnerData>> {
    const url = new URL('/api/control/status', this.baseUrl);
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = RobotApiClient.getStoredToken();
    if (token) headers['X-Rocos-Control-Token'] = token;
    const response = await fetch(url.toString(), { headers });
    return response.json() as Promise<ApiResponse<ControlOwnerData>>;
  }

  // ─── Impedance ──────────────────────────────────────────────────────

  /** GET /api/robot/impedance — 获取当前阻抗控制参数 */
  async getImpedance(): Promise<ImpedanceData> {
    return this.request<ImpedanceData>('GET', '/api/robot/impedance');
  }

  /** POST /api/robot/impedance — 设置阻抗控制参数 */
  async setImpedance(params: SetImpedanceBody): Promise<void> {
    return this.request('POST', '/api/robot/impedance', params);
  }
}
