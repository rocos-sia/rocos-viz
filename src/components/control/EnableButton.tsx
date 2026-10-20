import { useCallback } from 'react';
import { Button, Tooltip, message } from 'antd';
import { ThunderboltFilled } from '@ant-design/icons';
import { useConnectionStore } from '@/stores/connectionStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useT } from '@/i18n/useT';

export function EnableButton({ iconOnly = false, disabled = false }: { iconOnly?: boolean; disabled?: boolean }) {
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
    } catch (error: unknown) {
      message.error(t('enable.opFailed', { msg: error instanceof Error ? error.message : String(error) }));
    }
  }, [isConnected, isEnabled, host, port, setEnabled, t]);

  const active = isConnected && isEnabled;
  const status = t(active ? 'enable.enabled' : 'enable.disabled');
  const action = t(active ? 'enable.disableTip' : 'enable.enableTip');

  return (
    <Tooltip title={`${status} · ${action}`} trigger={['hover', 'focus']}>
      <Button
        className={`${iconOnly ? 'teach-enable-icon' : 'enable-pill'}${active ? ' is-enabled' : ' is-disabled'}`}
        aria-label={status}
        aria-pressed={active}
        icon={iconOnly ? <ThunderboltFilled aria-hidden="true" /> : <span className={`enable-dot ${active ? 'on' : 'off'}`} />}
        onClick={handleToggle}
        disabled={disabled || !isConnected || !controlToken}
        shape={iconOnly ? 'default' : 'round'}
        size="middle"
      >
        {iconOnly ? null : status}
      </Button>
    </Tooltip>
  );
}
