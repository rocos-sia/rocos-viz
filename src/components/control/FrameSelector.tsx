import { Select, Typography } from 'antd';
import { useControlStore } from '@/stores/controlStore';
import { useUIStore } from '@/stores/uiStore';
import { FRAME } from '@/core/constants';
import { useT } from '@/i18n/useT';

const { Text } = Typography;

export function FrameSelector({ purpose = 'motion' }: { purpose?: 'motion' | 'display' }) {
  const t = useT();
  const currentFrame = useControlStore((s) => s.currentFrame);
  const setFrame = useControlStore((s) => s.setFrame);
  const displayFrame = useUIStore((s) => s.displayFrame);
  const setDisplayFrame = useUIStore((s) => s.setDisplayFrame);
  const label = t(purpose === 'motion' ? 'frame.motionReference' : 'frame.displayReference');

  const frameOptions = [
    { value: FRAME.BASE, label: t('frame.BASE') },
    { value: FRAME.FLANGE, label: t('frame.FLANGE') },
    { value: FRAME.TOOL, label: t('frame.TOOL') },
    { value: FRAME.OBJECT, label: t('frame.OBJECT') },
  ];

  return (
    <div className="frame-selector" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Text className="frame-selector-label" style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)' }}>{label}</Text>
      <Select
        aria-label={label}
        value={purpose === 'motion' ? currentFrame : displayFrame}
        onChange={purpose === 'motion' ? setFrame : setDisplayFrame}
        options={frameOptions}
        size={purpose === 'display' ? 'small' : 'middle'}
        variant={purpose === 'display' ? 'borderless' : 'outlined'}
        style={{ width: 130 }}
      />
    </div>
  );
}
