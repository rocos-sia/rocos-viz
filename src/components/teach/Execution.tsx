import { useEffect } from 'react';
import { Alert, Button, Progress, Steps } from 'antd';
import { CaretRightOutlined, PauseOutlined, StepForwardOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTeachStore } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { DemoBadge, TeachCard } from './TeachCard';
import { Robot3DCard } from './Robot3DCard';

export function Execution() {
  const t = useT();
  const running = useTeachStore((s) => s.demoRunning);
  const step = useTeachStore((s) => s.demoStep);
  const setRunning = useTeachStore((s) => s.setDemoRunning);
  const advance = useTeachStore((s) => s.advanceDemo);
  const reset = useTeachStore((s) => s.resetDemo);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(advance, 900);
    return () => window.clearInterval(timer);
  }, [running, advance]);
  useEffect(() => () => setRunning(false), [setRunning]);
  return <div className="teach-page teach-execution" data-motion>
    <Alert className="teach-feature-notice" type="info" showIcon message={t('teach.previewOnly')} description={t('teach.previewUnavailable')} />
    <div className="teach-execution-grid">
      <TeachCard title={t('teach.sequence')} extra={<DemoBadge />}>
        <h3 className="teach-program-name">pick_place.lua</h3>
        <Steps direction="vertical" current={step % 4} items={['step.move', 'step.wait', 'step.grip', 'step.home'].map((key, i) => ({
          title: t(`teach.${key}` as Parameters<typeof t>[0]),
          description: ['P002 · 100 mm/s', 'DI 00 = ON', 'DO 01 = ON', 'P001 · 50 mm/s'][i],
        }))} />
        <Progress percent={Math.round(step / 12 * 100)} />
        <div className="teach-button-row">
          <Button type="primary" icon={running ? <PauseOutlined /> : <CaretRightOutlined />} onClick={() => setRunning(!running)}>{t(running ? 'teach.pause' : 'teach.previewRun')}</Button>
          <Button icon={<StepForwardOutlined />} disabled={running} onClick={advance}>{t('teach.previewStep')}</Button>
          <Button icon={<ReloadOutlined />} onClick={reset}>{t('teach.reset')}</Button>
        </div>
      </TeachCard>
      <Robot3DCard />
    </div>
  </div>;
}
