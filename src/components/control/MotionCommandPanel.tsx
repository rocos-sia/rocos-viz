import { useState, useCallback, useEffect } from 'react';
import { Button, InputNumber, message } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useControlStore } from '@/stores/controlStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { jointMotionParams, cartesianMotionParams } from '@/core/constants';
import { useConnectionStore } from '@/stores/connectionStore';
import { useT } from '@/i18n/useT';
import * as THREE from 'three';

export function MotionCommandPanel() {
  const t = useT();
  const speedFactor = useControlStore((s) => s.speedFactor);
  const isDegree = useControlStore((s) => s.isDegree);
  const isMM = useControlStore((s) => s.isMM);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const { host, port } = useConnectionStore.getState();

  const jointCount = useRobotStateStore((s) => s.robotState?.joint_states.length ?? 7);
  const [cartesian, setCartesian] = useState({ x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 });
  const [joints, setJoints] = useState([0, 0, 0, 0, 0, 0, 0]);

  useEffect(() => { setJoints((values) => Array.from({ length: jointCount }, (_, i) => values[i] ?? 0)); }, [jointCount]);

  const handleMoveJ_IK = useCallback(async () => {
    if (!isConnected) { message.warning(t('common.connectFirst')); return; }

    const x = cartesian.x / (isMM ? 1000 : 1);
    const y = cartesian.y / (isMM ? 1000 : 1);
    const z = cartesian.z / (isMM ? 1000 : 1);
    const roll = cartesian.roll * (isDegree ? Math.PI / 180 : 1);
    const pitch = cartesian.pitch * (isDegree ? Math.PI / 180 : 1);
    const yaw = cartesian.yaw * (isDegree ? Math.PI / 180 : 1);

    const euler = new THREE.Euler(roll, pitch, yaw, 'ZYX');
    const q = new THREE.Quaternion().setFromEuler(euler);

    try {
      const client = new RobotApiClient(host, port);
      const { speed, acceleration } = jointMotionParams(speedFactor);
      await client.moveJ_IK(
        { position: { x, y, z }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } },
        speed,
        acceleration,
      );
      message.success(t('common.sent', { cmd: 'MoveJ_IK' }));
    } catch (error: any) {
      message.error(error.message);
    }
  }, [cartesian, speedFactor, isDegree, isMM, isConnected, host, port, t]);

  const handleMoveL = useCallback(async () => {
    if (!isConnected) { message.warning(t('common.connectFirst')); return; }

    const x = cartesian.x / (isMM ? 1000 : 1);
    const y = cartesian.y / (isMM ? 1000 : 1);
    const z = cartesian.z / (isMM ? 1000 : 1);
    const roll = cartesian.roll * (isDegree ? Math.PI / 180 : 1);
    const pitch = cartesian.pitch * (isDegree ? Math.PI / 180 : 1);
    const yaw = cartesian.yaw * (isDegree ? Math.PI / 180 : 1);

    const euler = new THREE.Euler(roll, pitch, yaw, 'ZYX');
    const q = new THREE.Quaternion().setFromEuler(euler);

    try {
      const client = new RobotApiClient(host, port);
      const { speed, acceleration } = cartesianMotionParams(speedFactor);
      await client.moveL(
        { position: { x, y, z }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } },
        speed,
        acceleration,
      );
      message.success(t('common.sent', { cmd: 'MoveL' }));
    } catch (error: any) {
      message.error(error.message);
    }
  }, [cartesian, speedFactor, isDegree, isMM, isConnected, host, port, t]);

  const handleMoveJ = useCallback(async () => {
    if (!isConnected) { message.warning(t('common.connectFirst')); return; }

    const rads = joints.map((j) => j * (isDegree ? Math.PI / 180 : 1));

    try {
      const client = new RobotApiClient(host, port);
      const { speed, acceleration } = jointMotionParams(speedFactor);
      await client.moveJ(rads, speed, acceleration);
      message.success(t('common.sent', { cmd: 'MoveJ' }));
    } catch (error: any) {
      message.error(error.message);
    }
  }, [joints, speedFactor, isDegree, isConnected, host, port, t]);

  const handleMoveL_FK = useCallback(async () => {
    if (!isConnected) { message.warning(t('common.connectFirst')); return; }

    const rads = joints.map((j) => j * (isDegree ? Math.PI / 180 : 1));

    try {
      const client = new RobotApiClient(host, port);
      const { speed, acceleration } = cartesianMotionParams(speedFactor);
      await client.moveL_FK(rads, speed, acceleration);
      message.success(t('common.sent', { cmd: 'MoveL_FK' }));
    } catch (error: any) {
      message.error(error.message);
    }
  }, [joints, speedFactor, isDegree, isConnected, host, port, t]);

  const updateCartesian = (key: string, value: number | null) => {
    setCartesian((prev) => ({ ...prev, [key]: value || 0 }));
  };

  const updateJoint = (index: number, value: number | null) => {
    setJoints((prev) => {
      const newJoints = [...prev];
      newJoints[index] = value || 0;
      return newJoints;
    });
  };

  const posUnit = isMM ? 'mm' : 'm';
  const angUnit = isDegree ? 'deg' : 'rad';

  return (
    <div className="panel-section">
      <div className="panel-section-header">{t('precise.title')}</div>

      {/* Cartesian Space */}
      <div className="precise-group">
        <div className="precise-group-title">{t('precise.cartesianSpace')}</div>

        <div className="precise-grid">
          {([
            { key: 'x', label: 'X', unit: posUnit },
            { key: 'y', label: 'Y', unit: posUnit },
            { key: 'z', label: 'Z', unit: posUnit },
            { key: 'roll', label: 'RX', unit: angUnit },
            { key: 'pitch', label: 'RY', unit: angUnit },
            { key: 'yaw', label: 'RZ', unit: angUnit },
          ] as const).map(({ key, label, unit }) => (
            <div className="precise-field" key={key}>
              <span className="precise-field-label">{label}</span>
              <InputNumber
                value={cartesian[key]}
                onChange={(v) => updateCartesian(key, v)}
                step={1}
                controls={false}
                className="precise-input"
              />
              <span className="precise-field-unit">{unit}</span>
            </div>
          ))}
        </div>

        <div className="precise-actions">
          <Button size="large" type="primary" icon={<ThunderboltOutlined />} onClick={handleMoveJ_IK} disabled={!isConnected} block>
            MoveJ_IK
          </Button>
          <Button size="large" icon={<ThunderboltOutlined />} onClick={handleMoveL} disabled={!isConnected} block>
            MoveL
          </Button>
        </div>
      </div>

      {/* Joint Space */}
      <div className="precise-group">
        <div className="precise-group-title">{t('precise.jointSpace')}</div>

        <div className="precise-grid">
          {joints.map((val, i) => (
            <div className="precise-field" key={i}>
              <span className="precise-field-label">J{i + 1}</span>
              <InputNumber
                value={val}
                onChange={(v) => updateJoint(i, v)}
                step={1}
                min={-180}
                max={180}
                controls={false}
                className="precise-input"
              />
              <span className="precise-field-unit">{angUnit}</span>
            </div>
          ))}
        </div>

        <div className="precise-actions">
          <Button size="large" type="primary" icon={<ThunderboltOutlined />} onClick={handleMoveJ} disabled={!isConnected} block>
            MoveJ
          </Button>
          <Button size="large" icon={<ThunderboltOutlined />} onClick={handleMoveL_FK} disabled={!isConnected} block>
            MoveL_FK
          </Button>
        </div>
      </div>
    </div>
  );
}
