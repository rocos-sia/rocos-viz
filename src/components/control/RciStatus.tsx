import { Button, Tooltip } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import { useConnectionStore } from '@/stores/connectionStore';
import { useT } from '@/i18n/useT';

export function RciButton({ onToggle }: { onToggle: () => Promise<void> }) {
  const t = useT();
  const { isConnected, isRobotEnabled, rci, rciBusy, rciPhase } = useConnectionStore();
  const active = isConnected && !!rci?.enabled;
  const allowed = isConnected && rci && rci.robot_state !== 'ERROR_STATE' &&
    (active || (isRobotEnabled && rci.robot_state === 'STOPPED'));
  return <Tooltip title={t(active ? 'rci.exitTip' : 'rci.requireStopped')}>
    <Button className={`rci-switch ${active ? 'is-active' : ''}`} icon={<ApiOutlined aria-hidden="true" />}
      aria-label={t('rci.toggle')} aria-pressed={active} loading={rciBusy || rciPhase === 'releasing' || !!rci?.closing}
      disabled={!allowed || rciBusy || rciPhase === 'releasing' || !!rci?.closing}
      onClick={() => void onToggle()}>RCI</Button>
  </Tooltip>;
}

export function RciStatusBar() {
  const t = useT();
  const { isConnected, rci, rciPhase } = useConnectionStore();
  const known = isConnected && rci;
  const error = known && rci.robot_state === 'ERROR_STATE';
  const active = known && rci.enabled;
  let label: Parameters<typeof t>[0] = 'rci.off';
  if (!known) label = 'rci.unknown';
  else if (error) label = 'rci.error';
  else if (rciPhase === 'releasing') label = 'rci.releasing';
  else if (rci.closing || rciPhase === 'exiting') label = 'rci.closing';
  else if (active) label = rci.robot_state === 'STOPPING' ? 'rci.stopping' : rci.control_active ? 'rci.active' : 'rci.ready';
  else if (rciPhase === 'entering') label = 'rci.entering';
  return <div role="status" data-testid="rci-status" className={`rci-status-bar ${error ? 'is-error' : active ? 'is-active' : ''}`}>
    <ApiOutlined aria-hidden="true" /><span>{t(label)}</span>
    {error && rci.last_control?.fault_code ? <span>({rci.last_control.fault_code})</span> : null}
  </div>;
}
