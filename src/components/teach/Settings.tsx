import { ConnectionSettings } from '@/components/connection/ConnectionSettings';
import { useUnitStore } from '@/stores/unitStore';
import { useCompactScreen } from '@/hooks/useCompactScreen';
import { Button, Popconfirm, Segmented, Switch, Tabs } from 'antd';
import { DisconnectOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useUIStore } from '@/stores/uiStore';
import { useTeachStore } from '@/stores/teachStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { ImpedancePanel } from '@/components/settings/ImpedancePanel';
import { useT } from '@/i18n/useT';
import { version } from '../../../package.json';
import { TeachCard } from './TeachCard';
import { useSearchParams } from 'react-router';
import { SoftwareUpdates } from './SoftwareUpdates';

export function Settings({ onDisconnect, onTakeover }: {
  onDisconnect: () => Promise<void>;
  onTakeover: () => Promise<void>;
}) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const activeTab = ['appearance', 'connection', 'units', 'impedance', 'updates'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'appearance';
  const units = useUnitStore();
  const compact = useCompactScreen();
  const language = useUIStore((s) => s.language);
  const theme = useUIStore((s) => s.themeMode);
  const reducedMotion = useTeachStore((s) => s.reducedMotion);
  const connected = useConnectionStore((s) => s.isConnected);
  const token = useConnectionStore((s) => s.controlToken);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const owner = useConnectionStore((s) => s.controlOwnerName ?? s.controlOwnerIp);
  return <div className="teach-page teach-settings" data-motion><Tabs className="teach-fill-tabs" activeKey={activeTab}
    onChange={(tab) => setParams((previous) => { const next = new URLSearchParams(previous); next.set('tab', tab); return next; }, { replace: true })} items={[
    { key: 'appearance', label: t('teach.appearance'), children: <div className="teach-two-col">
      <TeachCard title={t('teach.workspace')}>
        <div className="teach-setting-row"><span>{t('teach.appearance')}</span><Segmented value={theme} options={[{ label: t('teach.light'), value: 'light' }, { label: t('teach.dark'), value: 'dark' }]} onChange={(value) => useUIStore.setState({ themeMode: value as 'light' | 'dark' })} /></div>
        <div className="teach-setting-row"><span>{t('teach.language')}</span><Segmented aria-label={t('teach.language')} value={language} options={[{ label: '中文', value: 'zh' }, { label: 'English', value: 'en' }]} onChange={(value) => useUIStore.setState({ language: value as 'zh' | 'en' })} /></div>
        <div className="teach-setting-row"><span>{t('teach.reducedMotion')}</span><Switch checked={reducedMotion} aria-label={t('teach.reducedMotion')} onChange={useTeachStore.getState().setReducedMotion} /></div>
        <div className="teach-setting-row"><span>{t('teach.font')}</span><strong>AlibabaPuHuiTi</strong></div>
      </TeachCard>
      <TeachCard title={t('teach.about')}><div className="teach-about-brand">ROCOS <span>HMI</span></div><p className="teach-muted">{t('teach.station')}</p><div className="teach-setting-row"><span>{t('teach.version')}</span><strong>{version}</strong></div></TeachCard>
    </div> },
    { key: 'connection', label: t('teach.connection'), children: <TeachCard title={t('teach.connection')}>
        <div className="teach-setting-row teach-connection-setting">
          <div><span>{t('teach.connection')}</span><small className="teach-muted">{connected ? `${host}:${port}` : t('conn.disconnected')}</small></div>
          {connected ? <Popconfirm title={t('conn.disconnectTitle')} description={t('conn.disconnectConfirm', { target: `${host}:${port}` })} onConfirm={onDisconnect}>
            <Button icon={<DisconnectOutlined aria-hidden="true" />}>{t('conn.disconnect')}</Button>
          </Popconfirm> : null}
        </div>
        <ConnectionSettings />
        {connected && <div className="teach-setting-row"><span>{t('teach.ownership')}</span>
          {token ? <strong>{t('teach.local')}</strong> : <Popconfirm title={t('control.takeoverTitle')} description={t('control.takeoverConfirm', { owner: owner ?? t('teach.unknown') })} onConfirm={onTakeover}>
            <Button icon={<SafetyCertificateOutlined aria-hidden="true" />}>{t('control.takeover')}</Button>
          </Popconfirm>}
        </div>}
    </TeachCard> },
    { key: 'units', label: t('settings.units'), children: <TeachCard title={t('settings.units')}>
      <p className="teach-muted">{t('settings.unitHint')}</p>
      <div className="teach-unit-settings">
        <div className="teach-setting-row"><span>{t('settings.angle')}</span><Segmented aria-label={t('settings.angle')} value={units.isDegree ? 'deg' : 'rad'} options={['deg', 'rad']} onChange={(value) => units.setUnits({ isDegree: value === 'deg' })} /></div>
        <div className="teach-setting-row"><span>{t('settings.length')}</span><Segmented aria-label={t('settings.length')} value={units.isMM ? 'mm' : 'm'} options={['mm', 'm']} onChange={(value) => units.setUnits({ isMM: value === 'mm' })} /></div>
        <div className="teach-setting-row"><span>{t('settings.force')}</span><Segmented aria-label={t('settings.force')} value={units.forceUnit} options={['N', 'kN']} onChange={(value) => units.setUnits({ forceUnit: value as 'N' | 'kN' })} /></div>
        <div className="teach-setting-row"><span>{t('settings.torque')}</span><Segmented aria-label={t('settings.torque')} value={units.torqueUnit} options={['N·m', 'N·mm']} onChange={(value) => units.setUnits({ torqueUnit: value as 'N·m' | 'N·mm' })} /></div>
        <div className="teach-setting-row"><span>{t('settings.mass')}</span><Segmented aria-label={t('settings.mass')} value={units.massUnit} options={['kg', 'g']} onChange={(value) => units.setUnits({ massUnit: value as 'kg' | 'g' })} /></div>
      </div>
    </TeachCard> },
    { key: 'impedance', label: t('teach.impedance'), children: <TeachCard title={t('teach.impedance')}><p className="teach-muted">{!connected || !token ? t('teach.jogReason') : t('teach.live')}</p><fieldset disabled={compact || !connected || !token} className="teach-fieldset"><ImpedancePanel /></fieldset></TeachCard> },
    { key: 'updates', label: t('updates.title'), children: <SoftwareUpdates /> },
  ]} /></div>;
}
