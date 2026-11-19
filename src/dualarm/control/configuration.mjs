import { motionLocked } from './motion.mjs';

export class ArmConfiguration {
  constructor(control) { this.control = control; }
  invalidate(side) {
    const session = this.control.session(side);
    session.calibration = null;
    this.control.onArm(side, { calibration: null, calibrationSaved: false });
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
    try {
      if (!control.fresh(side)) throw new Error('Feedback expired');
      if (!session.token || !session.verified) throw new Error('Acquire control of this arm first');
      if (session.held || session.stopping || motionLocked(session.motion) || session.state.motion_busy || !['IDLE', 'STOPPED'].includes(session.state.robot_state)) throw new Error('Stop this arm before changing configuration');
      session.pending = true; control.onArm(side, { pending: true });
      const token = session.token;
      const data = await control.armRequest(side, operation, body, true);
      if (control.closed || token !== session.token) return null;
      if (operation === 'robot/frames/load' || operation === 'robot/tool_frame') this.invalidate(side);
      if (operation === 'calibration/pose' || operation === 'calibration/run') {
        session.calibration = data;
        control.onArm(side, { calibration: data, calibrationSaved: false });
      } else if (operation === 'calibration/save') {
        const refreshed = await control.armRequest(side, `calibration/result?session_id=${encodeURIComponent(body.session_id)}`);
        session.calibration = refreshed;
        control.onArm(side, { calibration: refreshed, calibrationSaved: true });
      }
      if (operation.startsWith('robot/') || operation === 'calibration/save') await this.refresh(side);
      control.recover(side, session.error?.operation);
      control.onEvent(side, `${operation} 已受理`);
      return data ?? {};
    } catch (error) {
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
    if (!id) return;
    try {
      const data = await control.armRequest(side, `calibration/result?session_id=${encodeURIComponent(id)}`);
      if (session.calibration?.session_id === id) { session.calibration = data; control.onArm(side, { calibration: data }); }
    } catch (error) { if (error.code === 4004) this.invalidate(side); control.error(side, 'calibration/result', error); }
  }
}
