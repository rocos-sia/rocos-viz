import { useCompactScreen } from '@/hooks/useCompactScreen';
import { Select, message } from 'antd';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { WORK_MODES } from '@/core/constants';
import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';

export function WorkModeSelector() {
  const t = useT();
  const compact = useCompactScreen();
  const isConnected = useConnectionStore((s) => s.isConnected);
  const { host, port } = useConnectionStore.getState();
  const token = useConnectionStore((s) => s.controlToken);
  const workMode = useRobotStateStore((s) => s.robotState?.work_mode);

  const modeLabel = (value: string) => t(`mode.${value}` as TranslationKey);

  const handleChange = async (mode: string) => {
    if (!isConnected) {
      message.warning(t('common.connectFirst'));
      return;
    }

    const client = new RobotApiClient(host, port);
    try {
      await client.setWorkMode(mode);
      message.success(t('mode.switched', { mode: modeLabel(mode) }));
    } catch (error: any) {
      message.error(t('mode.switchFailed', { msg: error.message }));
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{t('mode.label')}:</span>
      <Select
        value={workMode || 'position'}
        onChange={handleChange}
        options={WORK_MODES.map((m) => ({ value: m.value, label: modeLabel(m.value) }))}
        size="middle"
        style={{ width: 160 }}
        disabled={compact || !isConnected || !token}
      />
    </div>
  );
}
