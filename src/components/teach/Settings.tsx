import { useCompactScreen } from '@/hooks/useCompactScreen';
import { Button, Segmented, Switch, Tabs } from 'antd';
import { useUIStore } from '@/stores/uiStore';
import { useTeachStore } from '@/stores/teachStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { ImpedancePanel } from '@/components/settings/ImpedancePanel';
import { useT } from '@/i18n/useT';
import { version } from '../../../package.json';
import { TeachCard } from './TeachCard';

export function Settings({ onConnect }: { onConnect: () => void }) {
  const t = useT();
  const compact = useCompactScreen();
  const language = useUIStore((s) => s.language);
  const theme = useUIStore((s) => s.themeMode);
  const reducedMotion = useTeachStore((s) => s.reducedMotion);
  const connected = useConnectionStore((s) => s.isConnected);
  const token = useConnectionStore((s) => s.controlToken);
  return <div className="teach-page teach-settings" data-motion><Tabs className="teach-fill-tabs" items={[
    { key: 'appearance', label: t('teach.appearance'), children: <div className="teach-two-col">
      <TeachCard title={t('teach.workspace')}>
        <div className="teach-setting-row"><span>{t('teach.appearance')}</span><Segmented value={theme} options={[{ label: t('teach.light'), value: 'light' }, { label: t('teach.dark'), value: 'dark' }]} onChange={(value) => useUIStore.setState({ themeMode: value as 'light' | 'dark' })} /></div>
        <div className="teach-setting-row"><span>{t('teach.language')}</span><Segmented value={language} options={[{ label: '中文', value: 'zh' }, { label: 'English', value: 'en' }]} onChange={(value) => useUIStore.setState({ language: value as 'zh' | 'en' })} /></div>
        <div className="teach-setting-row"><span>{t('teach.reducedMotion')}</span><Switch checked={reducedMotion} aria-label={t('teach.reducedMotion')} onChange={useTeachStore.getState().setReducedMotion} /></div>
        <div className="teach-setting-row"><span>{t('teach.font')}</span><strong>AlibabaPuHuiTi</strong></div>
      </TeachCard>
      <TeachCard title={t('teach.about')}><h3 className="teach-about-brand">ROCOS <span>Teach</span></h3><p className="teach-muted">{t('teach.station')}</p><div className="teach-setting-row"><span>{t('teach.version')}</span><strong>{version}</strong></div><Button onClick={onConnect}>{t('teach.connection')}</Button></TeachCard>
    </div> },
    { key: 'impedance', label: t('teach.impedance'), children: <TeachCard title={t('teach.impedance')}><p className="teach-muted">{!connected || !token ? t('teach.jogReason') : t('teach.live')}</p><fieldset disabled={compact || !connected || !token} className="teach-fieldset"><ImpedancePanel /></fieldset></TeachCard> },
  ]} /></div>;
}
