export interface JointDisplayRange {
  min?: number;
  max?: number;
  unit: '°' | 'mm';
}

/** Metadata from a robot description; masses are in kg and missing values remain null. */
export interface RobotModelSummary {
  name: string;
  dof: number;
  linkCount: number;
  massLinkCount: number;
  definedMass: number | null;
  totalMass: number | null;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Pose {
  position: Vector3D;
  orientation: Quaternion;
}

export interface JointState {
  id?: number;
  name: string;
  position: number;
  velocity: number;
  acceleration?: number;
  torque: number;
  load_torque?: number;
  load?: number;
  status: number | string;
}

export interface HardwareInfo {
  joint_num?: number;
  state?: number;
}

export interface RobotState {
  joint_states: JointState[];
  flange?: Pose;
  /** 基座到当前 TCP；null 表示后端无法求解，缺省表示旧版 App。 */
  tcp?: Pose | null;
  active_tool_frame?: Pose;
  active_tool_frame_name?: string;
  active_tool_package?: ToolPackage | null;
  active_object_frame?: Pose;
  active_object_frame_name?: string;
  hw_state?: HardwareInfo;
  /** 机器人顶层状态字符串，如 "STOPPED", "RUNNING", "IDLE" */
  robot_state?: string;
  /** 当前工作模式，如 "position", "jnt_imp", "cart_imp", "jnt_admit_teach" 等 */
  work_mode?: string;
  is_enabled?: boolean;
  is_running?: boolean;
  control_active?: boolean;
  motion_busy?: boolean;
  timestamp?: number;
}

export interface JointInfo {
  id?: number;
  name: string;
  cnt_per_unit: number;
  torque_per_unit: number;
  ratio: number;
  zero_offset: number;
  unit_name: string;
}

export interface RobotInfo {
  joint_infos: JointInfo[];
}

export interface LinkConfig {
  name: string;
  order: number;
  type?: string;
  mesh: string;
  axis?: Vector3D;
  translate?: [number, number, number] | Vector3D;
  rotate?: [number, number, number] | Vector3D;
  angleAxis?: [number, number, number] | Vector3D;
  translateLink?: [number, number, number] | Vector3D;
  rotateLink?: [number, number, number] | Vector3D;
}

export interface RobotModelConfig {
  name: string;
  links: LinkConfig[];
}

/** 运动/点动指令的后端响应 */
export interface MotionResponse {
  robot_state: string;
  control_active: boolean;
  /** WaitMove 专用 */
  motion_busy?: boolean;
}

/** @deprecated 旧版 MoveResult，后端已不再返回此结构，请使用 MotionResponse */
export interface MoveResult {
  task_id?: string;
  status?: string;
  result: number;
  message: string;
}

export interface TaskStatus {
  task_id: string;
  task: unknown;
  robot_state: string;
  is_running: boolean;
  control_active: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface EnabledResponse {
  enabled: boolean;
  disabled: boolean;
  robot_state: string;
}

export interface ScriptListData {
  scripts: string[];
}

export interface ControlOwnerData {
  token?: string;
  has_owner: boolean;
  owner_ip?: string;
  owner_port?: number;
  owner_connection?: string;
  owner_name?: string;
  owner_agent?: string;
  client_id?: string;
  /** 若客户端未提供 client_id，服务端自动生成，此标记为 true */
  client_id_auto?: boolean;
  owner_client_id?: string;
  held_for_seconds?: number;
  idle_seconds?: number;
  expires_in_seconds?: number;
  ttl_seconds?: number;
  heartbeat_interval_seconds?: number;
}

export interface ImpedanceData {
  work_mode?: string;
  joint_space?: {
    valid?: boolean;
    stiffness: number[];
    damping: number[];
  };
  cartesian_space?: {
    valid?: boolean;
    translational_stiffness: number;
    rotational_stiffness: number;
    translational_damping: number;
    rotational_damping: number;
  };
}

export interface SetImpedanceBody {
  joint_space?: { stiffness: number[]; damping: number[] };
  cartesian_space?: {
    translational_stiffness: number;
    translational_damping: number;
    rotational_stiffness: number;
    rotational_damping: number;
  };
}

export interface CalibrationResult {
  error_state: boolean;
  pose: Pose;
  metrics: { rms_error: number; max_error: number; condition_number: number; axis_angle_degrees: number };
}

export interface ToolPackage {
  name: string; package_version: string; digest: string; revision: number; urdf: string;
  mount: Pose; tcp: Pose; default_mount?: Pose; default_tcp?: Pose; calibration_yaml?: string;
}
export interface ToolFrameList { names: string[]; active: string; file_path: string; package_support?: boolean; robot_id?: string }
export interface NamedToolFrame { name: string; frame: Pose; package?: ToolPackage }
export interface LoadParameters { valid: boolean; mass: number; com: [number, number, number] }
export interface CalibrationSample { index: number; flange: Pose; joints: number[]; timestamp: number }
export interface ToolCalibrationSession {
  session_id: string;
  name: string;
  samples: (CalibrationSample | null)[];
  captured: number;
  result: CalibrationResult | null;
}
