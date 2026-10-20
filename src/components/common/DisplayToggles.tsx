import { Button } from 'antd';
import { useUIStore } from '@/stores/uiStore';
import { useT } from '@/i18n/useT';

export function DisplayToggles() {
  const t = useT();
  const showTransparent = useUIStore((s) => s.showTransparent);
  const showGround = useUIStore((s) => s.showGround);
  const showTrajectory = useUIStore((s) => s.showTrajectory);
  const toggleTransparent = useUIStore((s) => s.toggleTransparent);
  const toggleGround = useUIStore((s) => s.toggleGround);
  const toggleTrajectory = useUIStore((s) => s.toggleTrajectory);

  return (
    <div className="display-toggle">
      <Button size="small" type={showTransparent ? 'primary' : 'default'} onClick={toggleTransparent}>
        {t('scene.transparent')}
      </Button>
      <Button size="small" type={showGround ? 'primary' : 'default'} onClick={toggleGround}>
        {t('scene.ground')}
      </Button>
      <Button size="small" type={showTrajectory ? 'primary' : 'default'} onClick={toggleTrajectory}>
        {t('scene.trajectory')}
      </Button>
    </div>
  );
}
