import { Slider, Typography } from 'antd';
import { useControlStore } from '@/stores/controlStore';
import { useT } from '@/i18n/useT';

const { Text } = Typography;

export function SpeedSlider() {
  const t = useT();
  const speedFactor = useControlStore((s) => s.speedFactor);
  const setSpeedFactor = useControlStore((s) => s.setSpeedFactor);

  return (
    <div className="panel-section">
      <div className="panel-section-header">{t('speed.label')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
        <Slider
          min={1}
          max={999}
          value={Math.round(speedFactor * 1000)}
          onChange={(v) => setSpeedFactor(v / 1000)}
          style={{ flex: 1 }}
          tooltip={{ formatter: (v) => `${((v || 0) / 10).toFixed(1)}%` }}
        />
        <Text style={{ width: 60, textAlign: 'right', fontSize: 'var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>
          {(speedFactor * 100).toFixed(1)}%
        </Text>
      </div>
    </div>
  );
}
