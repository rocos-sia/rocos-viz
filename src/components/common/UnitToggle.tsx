import { useUnitStore } from '@/stores/unitStore';
import { Button, Tooltip } from 'antd';
import { useT } from '@/i18n/useT';

export function UnitToggle() {
  const t = useT();
  const isDegree = useUnitStore((s) => s.isDegree);
  const isMM = useUnitStore((s) => s.isMM);
  const toggleDegree = useUnitStore((s) => s.toggleDegree);
  const toggleMM = useUnitStore((s) => s.toggleMM);

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <Tooltip title={isDegree ? t('unit.degTip') : t('unit.radTip')}>
        <Button size="small" onClick={toggleDegree}>
          {isDegree ? 'deg' : 'rad'}
        </Button>
      </Tooltip>
      <Tooltip title={isMM ? t('unit.mmTip') : t('unit.mTip')}>
        <Button size="small" onClick={toggleMM}>
          {isMM ? 'mm' : 'm'}
        </Button>
      </Tooltip>
    </div>
  );
}
