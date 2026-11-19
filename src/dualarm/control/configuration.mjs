import { motionLocked } from './motion.mjs';

export class ArmConfiguration {
  constructor(control) { this.control = control; }
  invalidate(side) {
    const session = this.control.session(side);
    session.calibration = null;
    session.calibrationHandle = null;
    this.control.persist(side);
    this.control.onArm(side, { calibration: null, calibrationSaved: false, calibrationRestoring: false });
  }
  remember(side, patch) {
    const control = this.control, session = control.session(side);
    session.calibrationPreferences = { ...session.calibrationPreferences, ...patch };
    control.persist(side);
    control.onArm(side, { calibrationPreferences: session.calibrationPreferences });
  }
  async restore(side) {
    const control = this.control, session = control.session(side), handle = session.calibrationHandle;
    if (!handle || session.calibration || session.restoringCalibration || !session.verified || control.clock() - (session.lastCalibrationRestore ?? -Infinity) < 1000) return;
    if (!session.instanceId || handle.instance_id !== session.instanceId) {
      this.invalidate(side);
      control.error(side, '恢复标定', new Error('App 已重启，未保存的标定会话已失效，请重新采点'));
      return;
    }
    session.restoringCalibration = true;
    session.lastCalibrationRestore = control.clock();
    control.onArm(side, { calibrationRestoring: true });
    const token = session.token;
    try {
      const data = await control.armRequest(side, `calibration/result?session_id=${encodeURIComponent(handle.session_id)}`);
      if (control.closed || token !== session.token || session.calibrationHandle?.session_id !== handle.session_id) return;
      if (data.session_id !== handle.session_id || data.name !== handle.name) throw new Error('Calibration session context changed');
      const configuration = session.configuration || await this.refresh(side);
      // A newer navigation/discovery refresh can supersede this one. Its null
      // return is not a failed calibration recovery; retry after it publishes.
      if (!configuration) return;
      const tool = configuration.tools[data.name];
      if (!tool || (tool.package?.digest || '') !== (data.package_digest || '') || (tool.package?.revision || 0) !== (data.package_revision || 0)) {
        this.invalidate(side);
        throw new Error('Tool installation changed; restart calibration');
      }
      if (control.closed || token !== session.token || session.calibrationHandle?.session_id !== handle.session_id) return;
      session.calibration = data;
      control.onArm(side, { calibration: data, calibrationSaved: data.saved === true });
      this.remember(side, { tool: data.name, calculatedTolerance: data.result && Number(session.calibrationPreferences.tolerance) / 1000 === data.max_error ? session.calibrationPreferences.tolerance : null });
      control.recover(side, '恢复标定');
    } catch (error) {
      if (control.closed || token !== session.token) return;
      if (error.code === 4004) this.invalidate(side);
      control.error(side, '恢复标定', error);
    } finally { session.restoringCalibration = false; control.onArm(side, { calibrationRestoring: !!session.calibrationHandle && !session.calibration }); }
  }
  async refresh(side) {
    const control = this.control, session = control.session(side);
    const sequence = session.configSequence = (session.configSequence || 0) + 1;
    control.onArm(side, { configurationLoading: true });
    try {
      const [tools, objects, load] = await Promise.all(['tool_frames', 'object_frames', 'load_params'].map(name => control.armRequest(side, `robot/${name}`)));
      if (!Array.isArray(tools.names) || !Array.isArray(objects.names)) throw new Error('Invalid frame list');
      const readFrames = async (names, kind) => Object.fromEntries(await Promise.all(names.map(async name => {
        const data = await control.armRequest(side, `robot/${kind}_frame?name=${encodeURIComponent(name)}`);
        return [name, data];
      })));
      const [toolFrames, objectFrames] = await Promise.all([readFrames(tools.names, 'tool'), readFrames(objects.names, 'object')]);
      if (control.closed || sequence !== session.configSequence) return null;
      const configuration = { tools: toolFrames, objects: objectFrames, load, path: tools.file_path };
      session.configuration = configuration;
      control.onArm(side, { configuration, configurationError: '', configurationLoading: false });
      return configuration;
    } catch (error) {
      if (!control.closed && sequence === session.configSequence) control.onArm(side, { configurationError: error.message, configurationLoading: false });
      return null;
    }
  }
  async write(side, operation, body) {
    const control = this.control, session = control.session(side);
    if (session.pending) return null;
    const token = session.token;
    try {
      if (!control.fresh(side)) throw new Error('Feedback expired');
      if (!session.token || !session.verified) throw new Error('Acquire control of this arm first');
      if (session.held || session.stopping || session.stopRequest || session.restoringCalibration || motionLocked(session.motion) || session.state.motion_busy || !['IDLE', 'STOPPED'].includes(session.state.robot_state)) throw new Error('Stop this arm before changing configuration');
      session.pending = true; control.onArm(side, { pending: true });
      const data = await control.armRequest(side, operation, body, true);
      if (control.closed || token !== session.token) return null;
      if (operation === 'robot/frames/load' || operation === 'robot/tool_frame') this.invalidate(side);
      if (operation === 'calibration/pose' || operation === 'calibration/run') {
        session.calibration = data;
        session.calibrationHandle = { session_id: data.session_id, name: data.name, instance_id: session.instanceId };
        control.persist(side);
        control.onArm(side, { calibration: data, calibrationSaved: false });
      } else if (operation === 'calibration/save') {
        const refreshed = await control.armRequest(side, `calibration/result?session_id=${encodeURIComponent(body.session_id)}`);
        if (control.closed || token !== session.token) return null;
        session.calibration = refreshed;
        control.onArm(side, { calibration: refreshed, calibrationSaved: true });
      }
      if (operation.startsWith('robot/') || operation === 'calibration/save') await this.refresh(side);
      control.recover(side, session.error?.operation);
      control.onEvent(side, `${operation} 已受理`);
      return data ?? {};
    } catch (error) {
      if (control.closed || token !== session.token) return null;
      if (operation.startsWith('calibration/') && [4001, 4002, 4004].includes(error.code)) {
        if (error.code === 4004) this.invalidate(side);
        else if (session.calibration) {
          session.calibration = { ...session.calibration, result: null };
          control.onArm(side, { calibration: session.calibration, calibrationSaved: false });
        }
      }
      control.error(side, operation, error);
      return null;
    } finally { session.pending = false; control.onArm(side, { pending: false }); }
  }
  async readCalibration(side) {
    const control = this.control, session = control.session(side), id = session.calibration?.session_id;
    const token = session.token;
    if (!id) return;
    try {
      const data = await control.armRequest(side, `calibration/result?session_id=${encodeURIComponent(id)}`);
      if (!control.closed && token === session.token && session.verified && session.calibration?.session_id === id) { session.calibration = data; control.onArm(side, { calibration: data, calibrationSaved: data.saved === true }); }
    } catch (error) {
      if (control.closed || token !== session.token || session.calibration?.session_id !== id) return;
      if (error.code === 4004) this.invalidate(side); control.error(side, 'calibration/result', error);
    }
  }
}
