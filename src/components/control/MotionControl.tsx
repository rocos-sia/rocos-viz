import { useCallback } from 'react';
import { Button, Tooltip, message, Slider, Typography } from 'antd';
import {
  CaretRightOutlined,
  PauseOutlined,
  StopFilled,
} from '@ant-design/icons';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useControlStore } from '@/stores/controlStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useT } from '@/i18n/useT';

const { Text } = Typography;

export function MotionControl() {
  const t = useT();
  const isConnected = useConnectionStore((s) => s.isConnected);
  const robotState = useRobotStateStore((s) => s.robotState);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const speedFactor = useControlStore((s) => s.speedFactor);
  const setSpeedFactor = useControlStore((s) => s.setSpeedFactor);

  const isRunning = robotState?.robot_state === 'RUNNING';

  const getClient = useCallback(() => new RobotApiClient(host, port), [host, port]);

  const handleStartPause = useCallback(async () => {
    if (!isConnected) {
      message.warning(t('common.connectFirst'));
      return;
    }
    try {
      const client = getClient();
      if (isRunning) {
        await client.pauseMotion();
        message.success(t('motion.paused'));
      } else {
        await client.resumeMotion();
        message.success(t('motion.started'));
      }
    } catch (error: unknown) {
      message.error(t('enable.opFailed', { msg: error instanceof Error ? error.message : String(error) }));
    }
  }, [isConnected, isRunning, getClient, t]);

  const handleStop = useCallback(async () => {
    if (!isConnected) {
      message.warning(t('common.connectFirst'));
      return;
    }
    try {
      await getClient().stopMove();
      message.success(t('motion.stopped'));
    } catch (error: unknown) {
      message.error(t('enable.opFailed', { msg: error instanceof Error ? error.message : String(error) }));
    }
  }, [isConnected, getClient, t]);

  return (
    <div className="panel-section">
      <div className="panel-section-header">{t('motion.label')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
        <Slider
          min={1}
          max={999}
          value={Math.round(speedFactor * 1000)}
          onChange={(v) => setSpeedFactor(v / 1000)}
          style={{ flex: 1 }}
          tooltip={{ formatter: (v) => `${((v || 0) / 10).toFixed(1)}%` }}
        />
        <Text style={{ width: 56, textAlign: 'right', fontSize: 'var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>
          {(speedFactor * 100).toFixed(1)}%
        </Text>
        <Tooltip title={isRunning ? t('motion.pause') : t('motion.start')}>
          <Button
            className="motion-btn"
            icon={isRunning ? <PauseOutlined /> : <CaretRightOutlined />}
            onClick={handleStartPause}
            disabled={!isConnected}
            shape="circle"
            size="small"
          />
        </Tooltip>
        <Tooltip title={t('motion.stop')}>
          <Button
            className="motion-btn motion-btn-stop"
            icon={<StopFilled />}
            onClick={handleStop}
            disabled={!isConnected}
            shape="circle"
            size="small"
          />
        </Tooltip>
      </div>
    </div>
  );
}
