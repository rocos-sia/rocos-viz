// Independent arm credentials survive reload in this tab only; never log them.
import { advanceMotion, motionLocked } from './motion.mjs';
import { ArmConfiguration } from './configuration.mjs';
export const SIDES = ['left', 'right'];
export const SESSION_KEY = 'rocos.dualarm.control.v1';
export const monotonicNow = () => performance.now();
const newClientId = () => `dualarm-viz-${crypto.randomUUID()}`;
function tabStorage() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}
function restore(storage) {
  try {
    const value = JSON.parse(storage?.getItem(SESSION_KEY) || 'null');
    if (!value || value.version !== 1 || !/^dualarm-viz-[a-f0-9-]{36}$/.test(value.clientId)) return null;
    return { clientId: value.clientId, tokens: Object.fromEntries(SIDES.map(side => [side,
      typeof value.tokens?.[side] === 'string' && value.tokens[side].length <= 512 ? value.tokens[side] : '',
    ])), arms: value.arms && typeof value.arms === 'object' ? value.arms : {} };
  } catch { return null; }
}
function validCachedBody(motion) {
  if (['movej', 'movel_fk'].includes(motion?.kind)) return Array.isArray(motion.body?.joints) && motion.body.joints.length === 7 && motion.body.joints.every(Number.isFinite);
  const pose = motion?.body?.pose;
  return !!pose && ['x', 'y', 'z'].every(axis => Number.isFinite(pose.position?.[axis])) && ['x', 'y', 'z', 'w'].every(axis => Number.isFinite(pose.orientation?.[axis])) && Math.hypot(...['x', 'y', 'z', 'w'].map(axis => pose.orientation[axis])) > 1e-9;
}
export class ApiFailure extends Error {
  constructor(message, code = 'NETWORK', requestId = '') {
    super(message); this.code = code; this.requestId = requestId;
  }
}
export function motionRequest(kind, input) {
  if (!['movej', 'movej_ik', 'movel', 'movel_fk'].includes(kind)) throw new ApiFailure('无效运动类型', 'VALIDATION');
  const finite = value => ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value));
  const body = {};
  for (const key of ['velocity', 'acceleration', 'jerk']) {
    if (!finite(input[key]) || Number(input[key]) <= 0) throw new ApiFailure('速度、加速度和加加速度必须为正数', 'VALIDATION');
    body[key] = Number(input[key]);
  }
  if (body.velocity > .5) throw new ApiFailure('运动速度不能超过页面上限 0.50', 'VALIDATION');
  if (['movej', 'movel_fk'].includes(kind)) {
    if (!Array.isArray(input.target) || input.target.length !== 7 || !input.target.every(finite)) throw new ApiFailure('请填写全部 7 个有限关节目标', 'VALIDATION');
    body.joints = input.target.map(value => Number(value) * (Math.PI / 180));
  } else {
    if (!Array.isArray(input.pose) || input.pose.length !== 7 || !input.pose.every(finite)) throw new ApiFailure('请填写完整的位姿目标', 'VALIDATION');
    const values = input.pose.map(Number);
    const norm = Math.hypot(...values.slice(3));
    if (!Number.isFinite(norm) || norm < 1e-9) throw new ApiFailure('目标四元数无效或全为零', 'VALIDATION');
    body.pose = { position: { x: values[0] / 1000, y: values[1] / 1000, z: values[2] / 1000 },
      orientation: { x: values[3] / norm, y: values[4] / norm, z: values[5] / norm, w: values[6] / norm } };
  }
  if (['movel', 'movel_fk'].includes(kind) && input.tool) body.tool_name = input.tool;
  return body;
}
export class DualArmControl {
  constructor({ storage = tabStorage(), locks = globalThis.navigator?.locks, clock = monotonicNow, fetcher = (...args) => fetch(...args), onArm = () => {}, onError = () => {}, onModel = () => {}, onEvent = () => {} } = {}) {
    this.fetcher = fetcher; this.onArm = onArm; this.onError = onError;
    this.onModel = onModel; this.onEvent = onEvent;
    this.storage = storage; this.locks = locks;
    this.clock = clock;
    const saved = restore(storage);
    this.clientId = saved?.clientId || newClientId();
    this.sessions = Object.fromEntries(SIDES.map(side => {
      const cached = saved?.tokens[side] ? saved?.arms?.[side] : null;
      const instanceId = typeof cached?.instanceId === 'string' ? cached.instanceId : '';
      const remembered = cached?.motion;
      const motion = instanceId && validCachedBody(remembered) && /^[A-Za-z0-9_.:-]{1,128}$/.test(remembered?.commandId || '') && ['movej', 'movej_ik', 'movel', 'movel_fk'].includes(remembered.kind)
        ? { ...remembered, phase: remembered.stopEpoch ? 'stopping' : 'unknown', afterSequence: 0, lastSequence: undefined, quiet: 0 } : null;
      return [side, { token: saved?.tokens[side] || '', verified: false, state: null, updated: -Infinity, held: null, stopping: null, pending: false, instanceId, epoch: 0, protocol: 0, retiredInstances: new Set(), motion,
        calibrationHandle: cached?.calibration && typeof cached.calibration.session_id === 'string' && typeof cached.calibration.name === 'string' ? cached.calibration : null,
        calibrationPreferences: cached?.preferences && typeof cached.preferences.tool === 'string' && typeof cached.preferences.tolerance === 'string' ? cached.preferences : { tool: '', tolerance: '1' } }];
    }));
    this.closed = false; this.timers = new Set();
    this.configuration = new ArmConfiguration(this);
  }
  persist(side) {
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(SESSION_KEY, JSON.stringify({ version: 1, clientId: this.clientId,
        tokens: Object.fromEntries(SIDES.map(arm => [arm, this.sessions[arm].token])),
        arms: Object.fromEntries(SIDES.map(arm => {
          const session = this.sessions[arm], motion = session.motion;
          return [arm, { instanceId: session.instanceId, preferences: session.calibrationPreferences,
            calibration: session.calibrationHandle,
            motion: motionLocked(motion) ? { commandId: motion.commandId, kind: motion.kind, body: motion.body, instanceId: motion.instanceId, epoch: motion.epoch, stopInstance: motion.stopInstance, stopEpoch: motion.stopEpoch, stopAfterSequence: motion.stopAfterSequence } : null }];
        })) }));
    } catch {
      if (side && !this.storageWarning) {
        this.storageWarning = true;
        this.onError(side, { operation: '保存控制会话', code: 'STORAGE', requestId: '', time: new Date().toISOString(), message: '浏览器无法保存会话；刷新前请先释放控制权' });
      }
    }
  }
  forget(side) {
    const s = this.session(side); s.token = ''; s.verified = false;
    s.protocol = 0;
    this.configuration.invalidate(side);
    this.persist(side); this.onArm(side, { owned: false, leaseChecking: false, owner: '', ownerExpires: 0 });
  }
  async claimTab() {
    if (!this.locks) return;
    // Duplicating a tab can copy sessionStorage. Only one document may use a
    // client identity; ordinary reload releases the old document's Web Lock.
    while (!this.closed) {
      const claimed = await new Promise(resolve => {
        this.locks.request(`rocos-dualarm:${this.clientId}`, { ifAvailable: true }, async lock => {
          if (!lock || this.closed) { resolve(false); return; }
          const lifetime = new Promise(release => { this.unlock = release; });
          resolve(true); await lifetime;
        }).catch(() => resolve(true)); // Unsupported storage/locks retain in-memory operation.
      });
      if (claimed || this.closed) return;
      this.clientId = newClientId();
      for (const side of SIDES) { this.sessions[side].token = ''; this.sessions[side].verified = false; this.sessions[side].motion = null; this.configuration.invalidate(side); }
      this.persist();
    }
  }
  session(side) {
    if (!SIDES.includes(side)) throw new ApiFailure('无效臂名', 'INVALID_ARM');
    return this.sessions[side];
  }
  observeProtocol(side, data) {
    const session = this.session(side);
    if (!data?.instance_id || !Number.isSafeInteger(data.motion_epoch)) return false;
    if (session.retiredInstances.has(data.instance_id)) return false;
    if (session.instanceId && session.instanceId !== data.instance_id) {
      session.retiredInstances.add(session.instanceId);
      if (motionLocked(session.motion)) session.motion = { ...session.motion, phase: 'unknown', quiet: 0, stopEpoch: undefined, lastSequence: undefined };
      this.forget(side);
      session.epoch = 0;
      this.error(side, 'App 会话', new ApiFailure('App 已重启；请重新获取控制权并确认停止。未保存的标定会话已失效。', 'APP_RESTARTED'));
    }
    session.instanceId = data.instance_id;
    session.epoch = Math.max(session.epoch, data.motion_epoch);
    if (Number.isInteger(data.command_protocol)) session.protocol = data.command_protocol;
    return true;
  }
  fence(side) {
    const session = this.session(side);
    if (session.protocol !== 1 || !session.instanceId || !Number.isSafeInteger(session.epoch) || session.epoch < 1) throw new ApiFailure('App 尚未确认命令追踪协议，请等待控制权验证或更新双臂 App', 'PROTOCOL');
    return { instance_id: session.instanceId, motion_epoch: session.epoch };
  }
  later(fn, delay) {
    if (this.closed) return;
    const id = setTimeout(() => { this.timers.delete(id); if (!this.closed) fn(); }, delay);
    this.timers.add(id);
  }
  async request(path, body, token = '') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    try {
      const response = await this.fetcher(path, {
        method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'omit', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Rocos-Control-Token': token, 'X-Rocos-Client-Id': this.clientId } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const id = response.headers.get('X-Rocos-Request-Id') || '';
      let result;
      try { result = await response.json(); } catch (error) { if (error.name === 'AbortError') throw error; throw new ApiFailure(`HTTP ${response.status}：无效响应`, response.status, id); }
      if (!response.ok || result.success !== true) throw new ApiFailure(result.message || `HTTP ${response.status}`, result.code ?? response.status, id);
      return result.data;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(error.name === 'AbortError' ? '请求超时，执行结果未知；请查看反馈，不自动重发' : '连接失败，无法确认执行结果');
    } finally { clearTimeout(timeout); }
  }
  async armRequest(side, operation, body, authenticated = false, tokenOverride) {
    const session = this.session(side);
    const token = tokenOverride ?? session.token;
    if (authenticated && !token) throw new ApiFailure('请先获取本臂控制权', 'NO_CONTROL');
    return this.request(`/api/arms/${side}/${operation}`, body, authenticated ? token : '');
  }
  error(side, operation, error) {
    const s = this.session(side);
    const detail = { operation, message: error.message, code: error.code ?? 'CLIENT', requestId: error.requestId || '', time: new Date().toISOString() };
    s.error = detail;
    this.onError(side, detail);
    if ([3006, 3007].includes(error.code) && error.message === 'Invalid or missing control credentials for selected arm') { this.forget(side); }
    if (s.held) void this.stopJog(side);
  }
  recover(side, operation) {
    const session = this.session(side);
    if (!session.error || session.error.operation !== operation) return;
    this.onArm(side, { error: null, lastError: { ...session.error, recovered: true, recoveredAt: new Date().toISOString() } });
    session.error = null;
    this.onEvent(side, `${operation} 已恢复`);
  }
  fresh(side) { const s = this.session(side), age = this.clock() - s.updated; return !!s.state && age >= 0 && age < 750; }
  async start() {
    await this.claimTab();
    if (this.closed) return;
    for (const side of SIDES) this.onArm(side, { owned: false, leaseChecking: !!this.sessions[side].token, motion: this.sessions[side].motion, motionLocked: motionLocked(this.sessions[side].motion), calibrationPreferences: this.sessions[side].calibrationPreferences, calibrationRestoring: !!this.sessions[side].calibrationHandle });
    void this.discover();
    for (const side of SIDES) { void this.poll(side); void this.lease(side); }
    const stale = () => {
      for (const side of SIDES) {
        if (!this.fresh(side)) { this.onArm(side, { online: false }); if (this.session(side).held) void this.stopJog(side); }
      }
      this.later(stale, 100);
    }; stale();
  }
  async discover() {
    try {
      const [info, model] = await Promise.all([this.request('/api/arms'), this.request('/api/workcell/model')]);
      for (const side of SIDES) {
        const arm = info.arms.find(a => a.arm === side), chain = model.arms.find(a => a.arm === side);
        if (!arm || !chain || arm.joint_count !== 7 || arm.base_link !== chain.base_link || arm.tip_link !== chain.tip_link || JSON.stringify(arm.joint_names) !== JSON.stringify(chain.joint_names)) throw new ApiFailure('模型运动链与 App 配置不一致', 'MODEL');
      }
      for (const side of SIDES) {
        const arm = info.arms.find(a => a.arm === side);
        this.session(side).definition = arm;
        if (!this.closed) this.onArm(side, { definition: arm });
      }
      if (!this.closed) this.onModel(model);
      for (const side of SIDES) { this.recover(side, '连接 / 模型清单'); void this.configuration.refresh(side); }
    } catch (error) { if (!this.closed) for (const side of SIDES) this.error(side, '连接 / 模型清单', error); this.later(() => this.discover(), 2500); }
  }
  async poll(side) {
    const s = this.session(side);
    try {
      const state = await this.armRequest(side, 'robot/state');
      if (this.closed) return;
      const names = s.definition?.joint_names;
      if (!names) return;
      const q = names.map(name => state.joint_states?.find(j => j.name === name)?.position);
      const validPose = p => p && ['x','y','z'].every(k => Number.isFinite(p.position?.[k])) && ['x','y','z','w'].every(k => Number.isFinite(p.orientation?.[k]));
      if (q.some(v => !Number.isFinite(v)) || !validPose(state.flange) || !validPose(state.tcp) || typeof state.robot_state !== 'string' || typeof state.is_enabled !== 'boolean') throw new ApiFailure('状态数据不完整，已锁定操作', 'INVALID_STATE');
      if (!Number.isFinite(state.timestamp) || !Number.isSafeInteger(state.state_seq) || state.state_seq < 1 || !this.observeProtocol(side, state)) throw new ApiFailure('状态序号或 App 实例无效，请更新双臂 App', 'INVALID_STATE');
      if (s.sequenceInstance !== state.instance_id) { s.sequenceInstance = state.instance_id; s.lastSequence = 0; }
      if (state.state_seq < s.lastSequence) throw new ApiFailure('App 返回了乱序状态', 'INVALID_STATE');
      if (state.state_seq > s.lastSequence) { s.lastSequence = state.state_seq; s.sequenceChanged = this.clock(); }
      if (this.clock() - s.sequenceChanged >= 750) throw new ApiFailure('App 状态序号已停止更新', 'STALE');
      s.state = state; s.updated = this.clock(); s.readFailed = false;
      this.recover(side, '读取状态');
      const previousPhase = s.motion?.phase;
      s.motion = advanceMotion(s.motion, state.command?.command_id === s.motion?.commandId ? state : { ...state, command: s.queriedCommand }, names);
      if (s.motion?.phase !== previousPhase) this.persist(side);
      this.onArm(side, { online: true, enabled: state.is_enabled, state: state.robot_state, snapshot: state,
        motion: s.motion, motionLocked: motionLocked(s.motion),
        q: q.map(v => v * 180 / Math.PI), tool: state.active_tool_frame_name || '', object: state.active_object_frame_name || '',
        runtimeError: /ERROR|FAULT/.test(state.robot_state) ? `运行错误：${state.robot_state}；请查看本臂日志详情` : '',
        updated: s.updated });
      if (s.held && (!state.is_enabled || /ERROR|FAULT/.test(state.robot_state))) void this.stopJog(side);
      if (s.verified && s.calibrationHandle && !s.calibration) void this.configuration.restore(side);
      if (s.verified && motionLocked(s.motion) && s.motion.phase !== 'submitting' && state.command?.command_id !== s.motion.commandId) void this.queryMotion(side);
    } catch (error) {
      if (this.closed) return;
      this.onArm(side, { online: false });
      if (!s.readFailed) this.error(side, '读取状态', error);
      s.readFailed = true;
    } finally { this.later(() => this.poll(side), 100); }
  }
  async checkLease(side) {
    const s = this.session(side);
    if (s.leaseRequest) return s.leaseRequest;
    const token = s.token;
    const pending = (async () => {
      try {
        const status = token ? await this.armRequest(side, 'control/heartbeat', { command_protocol: 1 }, true) : await this.armRequest(side, 'control/status');
        if (this.closed || s.token !== token) return false;
        if (status.instance_id && (!this.observeProtocol(side, status) || s.token !== token)) return false;
        const owned = !!token && status.has_owner && status.owner_client_id === this.clientId;
        if (token && !owned) {
          this.error(side, '控制权', new ApiFailure('本臂控制权已失效，请重新申请', 'LEASE_LOST'));
          this.forget(side);
        }
        s.verified = owned;
        if (owned) this.recover(side, '控制权验证');
        if (owned) void this.configuration.restore(side);
        this.onArm(side, { owned, leaseChecking: false, owner: status.owner_name || status.owner_client_id || '', ownerExpires: status.expires_in_seconds });
        return owned;
      } catch (error) {
        if (this.closed || s.token !== token) return false;
        if (token) {
          s.verified = false;
          this.error(side, '控制权验证', error);
          // A network failure says nothing about server ownership. Retain the
          // token and retry heartbeat, never reacquire behind the user's back.
          this.onArm(side, { owned: false, leaseChecking: !!s.token });
        }
        return false;
      } finally { s.leaseRequest = null; }
    })();
    s.leaseRequest = pending; return pending;
  }
  async lease(side) {
    await this.checkLease(side);
    this.later(() => this.lease(side), 2000);
  }
  async command(side, operation, body = {}, details = false) {
    const s = this.session(side);
    if (s.pending) return false;
    s.pending = true; this.onArm(side, { pending: true });
    const token = s.token;
    let responseData;
    try {
      if (!this.fresh(side) && !['robot/stop', 'jog/stop', 'control/release'].includes(operation)) throw new ApiFailure('反馈已过期，请等待重新连接', 'STALE');
      if (operation === 'control/acquire') {
        if (s.token) return await this.checkLease(side);
        const result = await this.armRequest(side, operation, { client_id: this.clientId, client_name: '双臂上位机', command_protocol: 1 });
        if (!result.token) throw new ApiFailure('控制权响应缺少 token', 'INVALID_RESPONSE');
        s.token = result.token; s.verified = true; this.persist(side);
        this.observeProtocol(side, result);
        this.persist(side);
        this.onArm(side, { owned: true, leaseChecking: false });
        for (const operation of ['控制权', '控制权验证']) this.recover(side, operation);
      } else {
        if (!s.verified && !['control/release','robot/stop','robot/jog/stop'].includes(operation)) throw new ApiFailure('本臂控制权尚未验证，请等待连接恢复', 'UNVERIFIED');
        if (operation === 'control/release' || operation === 'robot/disable') await this.stopJog(side);
        const result = await this.armRequest(side, operation, body, true);
        if (this.closed || token !== s.token) return details ? { success: false, error: new ApiFailure('控制会话已变更，旧响应已忽略') } : false;
        responseData = result;
        this.observeProtocol(side, result);
        if (token !== s.token) return details ? { success: false, error: new ApiFailure('App 已重启，旧响应已忽略') } : false;
        if (operation === 'control/release') this.forget(side);
      }
      this.onEvent(side, `${operation} 已受理；状态以 App 反馈为准`);
      this.recover(side, s.error?.operation);
      return details ? { success: true, data: responseData } : true;
    } catch (error) {
      if (this.closed || (operation !== 'control/acquire' && token !== s.token)) return details ? { success: false, error: new ApiFailure('控制会话已变更，旧错误已忽略') } : false;
      this.error(side, operation, error); return details ? { success: false, error } : false;
    }
    finally { s.pending = false; this.onArm(side, { pending: false }); }
  }
  async move(side, kind, input) {
    const session = this.session(side);
    if (session.pending || session.stopping || session.stopRequest || session.held || motionLocked(session.motion)) return false;
    try {
      if (!this.fresh(side)) throw new ApiFailure('反馈已过期，请等待重新连接', 'STALE');
      if (!session.token || !session.verified) throw new ApiFailure('请先获取并验证本臂控制权', 'NO_CONTROL');
      if (!session.state.is_enabled || session.state.motion_busy || !['IDLE', 'STOPPED'].includes(session.state.robot_state)) throw new ApiFailure('本臂尚未准备好，请等待使能且运动停止', 'NOT_READY');
      const body = motionRequest(kind, input);
      const trackingBody = { ...body };
      const fence = this.fence(side), commandId = crypto.randomUUID(), token = session.token;
      session.motion = { commandId, instanceId: fence.instance_id, epoch: fence.motion_epoch, kind, body: trackingBody, phase: 'submitting', started: Date.now(), afterSequence: session.state.state_seq };
      this.persist(side);
      this.onArm(side, { motion: session.motion, motionLocked: true });
      const result = await this.command(side, `robot/${kind}`, { ...body, ...fence, command_id: commandId }, true);
      const success = result?.success === true;
      if (this.closed || session.motion?.commandId !== commandId) return success;
      // A stop or restart may have occurred while the request was in flight.
      // Its response must never remove the cancellation state or its fence.
      if (session.motion.phase === 'submitting') session.motion = { ...session.motion, phase: token !== session.token || result?.error?.code === 'NETWORK' ? 'unknown' : success ? 'waiting' : 'failed', acceptedAt: Date.now() };
      if (result?.data?.command?.command_id === commandId && session.state) session.motion = advanceMotion(session.motion, { ...session.state, command: result.data.command }, session.definition.joint_names);
      this.persist(side);
      this.onArm(side, { motion: session.motion, motionLocked: motionLocked(session.motion) });
      if (result?.error?.code === 4101 && session.motion.stopEpoch > session.motion.epoch) this.recover(side, `robot/${kind}`);
      if (success) this.recover(side, `精确运动 ${kind}`);
      return success;
    } catch (error) { this.error(side, `精确运动 ${kind}`, error); return false; }
  }
  startJog(side, kind, index, sign, speed, frame) {
    const s = this.session(side);
    if (s.held || s.stopping || s.stopRequest || s.pending || motionLocked(s.motion) || !s.token || !s.verified || !this.fresh(side) || !s.state.is_enabled || !['IDLE','STOPPED'].includes(s.state.robot_state)) return false;
    const length = kind === 'cartesian' ? 6 : kind === 'svd' ? 1 : 7;
    if (!['joint','cartesian','nullspace','svd'].includes(kind) || !Number.isInteger(index) || index < 0 || index >= length || ![-1,1].includes(sign) || !Number.isFinite(speed) || speed <= 0 || speed > .5) return false;
    const values = Array(length).fill(0); values[index] = kind === 'svd' ? sign * speed : sign;
    let fence;
    try { fence = this.fence(side); } catch (error) { this.error(side, '点动协议', error); return false; }
    const body = { ...fence, timeout: .25, speed, ...(kind === 'cartesian' ? { twist: values, frame } : kind === 'svd' ? { dim_speeds: values } : { joints: values }) };
    const held = { token: s.token, promise: null }; s.held = held;
    this.onArm(side, { jogging: true });
    const tick = async () => {
      if (s.held !== held || this.closed) return;
      if (!this.fresh(side) || s.token !== held.token) { void this.stopJog(side); return; }
      try {
        held.promise = this.armRequest(side, `robot/jog/${kind}`, body, true, held.token);
        await held.promise;
        if (s.held === held) this.later(tick, 50);
      } catch (error) { this.error(side, `点动 ${kind}`, error); }
    };
    void tick(); return true;
  }
  stopJog(side) {
    const s = this.session(side), held = s.held;
    if (!held) return s.stopping ?? Promise.resolve();
    s.held = null; this.onArm(side, { jogging: false, stopping: true });
    // Drain the start request first, so a delayed start cannot overtake stop.
    const stop = (async () => {
      try { await held.promise; } catch { /* Still send stop after a rejected/unknown start. */ }
      try { const result = await this.armRequest(side, 'robot/jog/stop', { instance_id: s.instanceId }, true, held.token); this.observeProtocol(side, result); }
      catch (error) { this.error(side, '停止点动', error); }
      finally { s.stopping = null; this.onArm(side, { stopping: !!s.stopRequest }); }
    })();
    s.stopping = stop; return stop;
  }
  async stop(side) {
    const s = this.session(side);
    if (s.stopRequest) return s.stopRequest;
    this.onArm(side, { stopping: true });
    if (motionLocked(s.motion)) { s.motion = { ...s.motion, phase: 'stopping' }; this.onArm(side, { motion: s.motion, motionLocked: true }); }
    this.persist(side);
    const token = s.token, instance = s.instanceId;
    s.stopRequest = (async () => {
      await this.stopJog(side);
      // An App-side epoch fence makes this safe even if it overtakes MoveJ.
      try {
        const result = await this.armRequest(side, 'robot/stop', { instance_id: instance }, true, token);
        if (this.closed || token !== s.token || !this.observeProtocol(side, result)) return;
        if (motionLocked(s.motion)) s.motion = { ...s.motion, phase: 'stopping', stopInstance: result.instance_id, stopEpoch: result.motion_epoch, stopAfterSequence: result.state_seq, quiet: 0, lastSequence: undefined };
        this.persist(side); this.onArm(side, { motion: s.motion, motionLocked: motionLocked(s.motion) });
        this.onEvent(side, '停止已受理；请确认反馈停止');
      } catch (error) { this.error(side, 'robot/stop', error); }
      finally { s.stopRequest = null; this.onArm(side, { stopping: !!s.stopping }); }
    })();
    return s.stopRequest;
  }
  async queryMotion(side) {
    const session = this.session(side), motion = session.motion;
    if (!motion?.commandId || session.queryingMotion || this.clock() - (session.lastMotionQuery ?? -Infinity) < 500) return;
    session.queryingMotion = true; session.lastMotionQuery = this.clock();
    const token = session.token;
    try {
      const result = await this.armRequest(side, `robot/command_status?command_id=${encodeURIComponent(motion.commandId)}`, undefined, true);
      if (this.closed || token !== session.token || session.motion?.commandId !== motion.commandId || !this.observeProtocol(side, result) || !session.state) return;
      session.queriedCommand = result.command;
      session.motion = advanceMotion(session.motion, { ...session.state, command: result.command }, session.definition.joint_names);
      this.persist(side); this.onArm(side, { motion: session.motion, motionLocked: motionLocked(session.motion) });
    } catch (error) {
      // Not-found is deliberately inconclusive: the original request may still
      // be in transit. Only a server result or a stop fence can unlock it.
      if (error.code !== 4103 && error.code !== 'NETWORK' && token === session.token) this.error(side, '查询运动结果', error);
    } finally { session.queryingMotion = false; }
  }
  close() {
    this.closed = true; for (const timer of this.timers) clearTimeout(timer); this.timers.clear();
    for (const side of SIDES) void this.stopJog(side);
    this.unlock?.();
  }
}
