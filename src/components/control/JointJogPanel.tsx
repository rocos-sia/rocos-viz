import { useRobotStateStore } from '@/stores/robotStateStore';
import { JointJogItem } from './JointJogItem';
import { useT } from '@/i18n/useT';

export function JointJogPanel() {
  const t = useT();
  const robotState = useRobotStateStore((s) => s.robotState);
  const joints = robotState?.joint_states || [];

  return (
    <div className="panel-section">
      <div className="panel-section-header">{t('jog.jointSpace')}</div>
      <div>
        {joints.map((joint, i) => (
          <JointJogItem key={`joint_${i}`} index={i} joint={joint} jointCount={joints.length} />
        ))}
        {joints.length === 0 && (
          <div style={{ padding: '8px 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-body)', textAlign: 'center' }}>
            {t('jog.noJointData')}
          </div>
        )}
      </div>
    </div>
  );
}
