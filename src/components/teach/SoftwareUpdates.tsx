import { useEffect } from 'react';
import { Alert, Button, Segmented, Tag, notification } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { compareRelease, type UpdateChannel } from '@/core/releases';
import { useSoftwareUpdates } from '@/hooks/useSoftwareUpdates';
import { useUpdateStore } from '@/stores/updateStore';
import { useUIStore } from '@/stores/uiStore';
import { useT } from '@/i18n/useT';
import { TeachCard } from './TeachCard';

export function SoftwareUpdateNotifier() {
  const updates = useSoftwareUpdates();
  const [api, holder] = notification.useNotification();
  const t = useT();
  const navigate = useNavigate();
  const context = `${updates.channel}:${updates.connected ? updates.endpoint : 'offline'}`;
  useEffect(() => { api.destroy('software-updates'); }, [api, context]);
  const pending = updates.attention.map((component) => ({
    key: `${component}:${component === 'app' ? updates.endpoint : 'page'}:${updates.current[component]}:${updates.releases[component]!.version}`,
    label: `${component === 'app' ? 'App' : 'Viz'} ${updates.releases[component]!.version}`,
  })).filter((entry) => !updates.notified.includes(entry.key));
  const pendingJson = JSON.stringify(pending);
  useEffect(() => {
    const entries: { key: string; label: string }[] = JSON.parse(pendingJson);
    if (!entries.length) return;
    useUpdateStore.getState().markNotified(entries.map((entry) => entry.key));
    api.info({
      key: 'software-updates', message: t('updates.found'), description: entries.map((entry) => entry.label).join(' · '),
      duration: 8, placement: 'topRight',
      btn: <Button size="small" onClick={() => { navigate('/settings?tab=updates'); api.destroy('software-updates'); }}>{t('updates.view')}</Button>,
    });
  }, [pendingJson, api, navigate, t]);
  return holder;
}

export function SoftwareUpdates() {
  const updates = useSoftwareUpdates();
  const t = useT();
  const language = useUIStore((s) => s.language);
  const date = (value: string | number) => new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
  return <TeachCard title={t('updates.title')} className="teach-updates">
    <div className="teach-update-toolbar">
      <div><label>{t('updates.channel')}</label><Segmented aria-label={t('updates.channel')} value={updates.channel}
        options={[{ label: t('updates.stable'), value: 'stable' }, { label: t('updates.internal'), value: 'internal' }]}
        onChange={(value) => updates.setChannel(value as UpdateChannel)} /></div>
      <Button type="primary" aria-label={t('updates.check')} icon={<ReloadOutlined aria-hidden="true" />} loading={updates.loading} onClick={() => void updates.check(true)}>{t('updates.check')}</Button>
    </div>
    <p className="teach-muted">{t('updates.schedule')}</p>
    <p className="teach-update-time">{t('updates.lastCheck')}: {updates.snapshot ? date(updates.snapshot.checkedAt) : t('updates.never')}</p>
    {updates.error && <Alert type="warning" showIcon message={t('updates.failed')} description={t(`updates.error.${updates.error}`)} />}
    {updates.snapshot && !updates.fresh && !updates.loading && <p className="teach-update-cache">{t('updates.cached')}</p>}
    <div className="teach-update-grid">
      {(['viz', 'app'] as const).map((component) => {
        const release = updates.releases[component];
        const comparison = compareRelease(updates.current[component], release);
        const ignored = !!release && updates.ignored[component] === release.version;
        const status = updates.loading ? 'checking' : !updates.snapshot ? 'notChecked' : !updates.fresh ? 'cachedStatus'
          : component === 'app' && !updates.connected ? 'disconnected' : comparison;
        const current = updates.current[component] ?? t(component === 'app' && !updates.connected ? 'updates.disconnected'
          : updates.infoLoading ? 'updates.reading' : 'updates.unknown');
        return <section className="teach-update-component" key={component} aria-label={`${component === 'app' ? 'App' : 'Viz'} ${t('updates.title')}`} data-component={component}>
          <div className="teach-update-heading"><h3>{component === 'app' ? 'App' : 'Viz'}</h3>
            <Tag color={status === 'available' ? 'blue' : status === 'current' ? 'green' : undefined}>{t(`updates.${status}`)}</Tag></div>
          <dl className="teach-update-versions">
            <dt>{t(component === 'viz' ? 'updates.pageVersion' : 'updates.controllerVersion')}</dt><dd>{current}</dd>
            <dt>{t('updates.remoteVersion')}</dt><dd>{release?.version ?? (updates.snapshot ? t('updates.unpublished') : '—')}</dd>
            {release && <><dt>{t('updates.publishedAt')}</dt><dd>{date(release.published_at)}</dd></>}
          </dl>
          {component === 'app' && updates.connected && updates.infoError && <p className="teach-muted">{t('updates.infoFailed')}</p>}
          {release && <>
            <div className="teach-update-actions">
              <Button href={release.release_url} target="_blank" rel="noopener noreferrer">{t('updates.releaseNotes')}</Button>
              {comparison === 'available' && <Button type="text" onClick={() => updates.ignore(component, ignored ? null : release.version)}>{t(ignored ? 'updates.unignore' : 'updates.ignore')}</Button>}
            </div>
            {ignored && comparison === 'available' && <p className="teach-muted">{t('updates.ignored')}</p>}
            <details className="teach-update-notes"><summary>{t('updates.notes')}</summary><p>{release.notes || t('updates.noNotes')}</p></details>
            <div className="teach-update-assets">{release.assets.map((asset) => <div className="teach-update-asset" key={asset.url}>
              <div><span>Linux · {asset.arch} · {asset.format.toUpperCase()} · {(asset.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
                <Button icon={<DownloadOutlined aria-hidden="true" />} href={asset.url} target="_blank" rel="noopener noreferrer"
                  aria-label={`${t('updates.download')} ${component === 'app' ? 'App' : 'Viz'} ${asset.arch} ${asset.format}`}>{t('updates.download')}</Button></div>
              <small>SHA256 <code>{asset.sha256}</code></small>
            </div>)}</div>
          </>}
        </section>;
      })}
    </div>
    <p className="teach-muted">{t('updates.ecm')}</p>
    <Alert type="info" showIcon message={t('updates.downloadHint')} description={t('updates.platformHint')} />
  </TeachCard>;
}
