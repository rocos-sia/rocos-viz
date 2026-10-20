import { useCallback } from 'react';
import { Button, Tooltip, message } from 'antd';
import { useConnectionStore } from '@/stores/connectionStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useT } from '@/i18n/useT';

export function EnableButton() {
  const t = useT();
  const isConnected = useConnectionStore((s) => s.isConnected);
  const isEnabled = useConnectionStore((s) => s.isRobotEnabled);
  const controlToken = useConnectionStore((s) => s.controlToken);
  const setEnabled = useConnectionStore((s) => s.setEnabled);
  const { host, port } = useConnectionStore.getState();

  const handleToggle = useCallback(async () => {
    if (!isConnected) {
      message.warning(t('common.connectFirst'));
      return;
    }

    const client = new RobotApiClient(host, port);

    try {
      if (isEnabled) {
        await client.disable();
        setEnabled(false);
        message.success(t('enable.didDisable'));
      } else {
        await client.enable();
        setEnabled(true);
        message.success(t('enable.didEnable'));
      }
    } catch (error: any) {
      message.error(t('enable.opFailed', { msg: error.message }));
    }
  }, [isConnected, isEnabled, host, port, setEnabled, t]);

  return (
    <Tooltip title={isEnabled ? t('enable.disableTip') : t('enable.enableTip')}>
      <Button
        className={`enable-pill${isEnabled ? ' is-enabled' : ' is-disabled'}`}
        icon={<span className={`enable-dot ${isEnabled ? 'on' : 'off'}`} />}
        onClick={handleToggle}
        disabled={!isConnected || !controlToken}
        shape="round"
        size="middle"
      >
        {isEnabled ? t('enable.enabled') : t('enable.disabled')}
      </Button>
    </Tooltip>
  );
}
