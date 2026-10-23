import { Alert, Button, Spin, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotLogStore } from '@/stores/robotLogStore';
import { useT } from '@/i18n/useT';
import { DemoBadge } from './TeachCard';

function formatLogTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) + `.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

/** 示教页与诊断页使用同一份日志和同一展示规则。 */
export function ControllerLogs() {
  const t = useT();
  const connected = useConnectionStore((state) => state.isConnected);
  const { events, loading, error, live, gap, refresh } = useRobotLogStore();
  if (!connected) return <div className="teach-controller-logs">
    <DemoBadge />
    <div className="teach-log-line">09:42:18 · INFO · {t('teach.log.demo')}</div>
    <div className="teach-log-line">09:40:05 · INFO · {t('teach.event.loaded')}</div>
  </div>;

  return <div className="teach-controller-logs">
    <div className="teach-log-toolbar">
      <span className="teach-muted">{t('logs.scope')}</span>
      <div>
        <Tag color={live ? 'green' : 'default'}>{live ? t('teach.live') : t(error ? 'logs.unavailable' : loading ? 'logs.connecting' : 'logs.reconnecting')}</Tag>
        <Button size="small" aria-label={t('teach.refresh')} icon={<ReloadOutlined aria-hidden="true" />} onClick={refresh} loading={loading}>{t('teach.refresh')}</Button>
      </div>
    </div>
    {gap && <Alert type="warning" showIcon message={t('logs.gap')} />}
    {error ? <Alert type="error" showIcon message={error} /> : loading ? <div className="teach-log-empty"><Spin /></div>
      : events.length ? <div className="teach-log-list">
        {events.map((event) => <div className="teach-log-line" key={event.id}>
          <time title={event.timestamp}>{formatLogTime(event.timestamp)}</time>
          <span className={`teach-log-level teach-log-level-${event.level}`}>{event.level.toUpperCase()}</span>
          <strong>{event.module}</strong>
          <span className="teach-log-message">{event.message}</span>
          {event.code !== null && <small>({event.code})</small>}
        </div>)}
      </div> : <div className="teach-log-empty">{t('logs.empty')}</div>}
  </div>;
}
