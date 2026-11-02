import { Alert, Button, Segmented, Slider } from 'antd';
import { PauseOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMotionPreviewStore } from '@/stores/motionPreviewStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useT } from '@/i18n/useT';

export function MotionModeSelector() {
  const t = useT();
  const mode = useMotionPreviewStore(s => s.mode);
  const connected = useConnectionStore(s => s.isConnected);
  const busy = useRobotStateStore(s => !!(s.robotState?.motion_busy || s.robotState?.is_running));
  return <Segmented block className="motion-mode-selector" aria-label={t('preview.mode')}
    value={mode} disabled={!connected || (mode === 'real' && busy)}
    options={[{ value: 'real', label: t('preview.real') }, { value: 'simulation', label: t('preview.simulation') }]}
    onChange={value => useMotionPreviewStore.getState().setMode(value as 'real' | 'simulation')} />;
}

export function MotionPreviewControls() {
  const t = useT();
  const { trajectory, pending, error, playing, time, reset } = useMotionPreviewStore();
  return <section className="motion-preview-controls" aria-label={t('preview.title')} aria-busy={pending}>
    <div className="motion-preview-heading"><strong>{t('preview.title')}</strong>
      <Button size="small" icon={<ReloadOutlined aria-hidden="true" />} onClick={reset}>{t('preview.reset')}</Button>
    </div>
    <p className="motion-preview-note">{t('preview.description')}</p>
    {error && <Alert type="error" showIcon message={t('preview.failed')} description={error} />}
    <div role="status" aria-live="polite" className="motion-preview-status">
      {pending ? t('preview.loading') : trajectory
        ? `${trajectory.motion_type} · ${trajectory.duration.toFixed(2)} s · ${trajectory.points.length} ${t('preview.points')}`
        : t('preview.empty')}
    </div>
    {trajectory && <>
      <div className="motion-preview-playback">
        <Button icon={playing ? <PauseOutlined aria-hidden="true" /> : <PlayCircleOutlined aria-hidden="true" />}
          disabled={pending || trajectory.duration === 0}
          aria-label={t(playing ? 'preview.pause' : 'preview.play')}
          onClick={() => useMotionPreviewStore.setState({ playing: !playing, time: !playing && time >= trajectory.duration ? 0 : time })} />
        <Slider min={0} max={trajectory.duration || 1} step={0.01} value={time}
          disabled={pending || trajectory.duration === 0} aria-label={t('preview.progress')}
          tooltip={{ formatter: value => `${value?.toFixed(2)} s` }}
          onChange={value => useMotionPreviewStore.setState({ time: value, playing: false })} />
        <span className="motion-preview-time">{time.toFixed(2)} s</span>
      </div>
      <p className="motion-preview-note">{t('preview.checks')}</p>
    </>}
  </section>;
}
