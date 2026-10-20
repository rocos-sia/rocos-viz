import { Select, Typography } from 'antd';
import { useControlStore } from '@/stores/controlStore';
import { FRAME } from '@/core/constants';
import { useT } from '@/i18n/useT';

const { Text } = Typography;

export function FrameSelector() {
  const t = useT();
  const currentFrame = useControlStore((s) => s.currentFrame);
  const setFrame = useControlStore((s) => s.setFrame);

  const frameOptions = [
    { value: FRAME.BASE, label: t('frame.BASE') },
    { value: FRAME.FLANGE, label: t('frame.FLANGE') },
    { value: FRAME.TOOL, label: t('frame.TOOL') },
    { value: FRAME.OBJECT, label: t('frame.OBJECT') },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)' }}>{t('frame.label')}:</Text>
      <Select
        aria-label={t('frame.label')}
        value={currentFrame}
        onChange={setFrame}
        options={frameOptions}
        size="middle"
        style={{ width: 130 }}
      />
    </div>
  );
}
