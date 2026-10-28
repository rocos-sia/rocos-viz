import { useEffect } from 'react';
import { version } from '../../package.json';
import { CHECK_INTERVAL, compareRelease, selectReleases } from '@/core/releases';
import { useUpdateStore } from '@/stores/updateStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotInfo } from './useRobotInfo';

export function useSoftwareUpdates() {
  const updates = useUpdateStore();
  const { info, connected, loading: infoLoading, error: infoError } = useRobotInfo();
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const snapshot = updates.cache[updates.channel] ?? null;
  const releases = selectReleases(snapshot);
  const current = { viz: version, app: connected ? info?.controller?.app_version ?? null : null };
  const available = (['app', 'viz'] as const).filter((component) => compareRelease(current[component], releases[component]) === 'available');
  const fresh = !!snapshot && Date.now() - snapshot.checkedAt < CHECK_INTERVAL && snapshot.checkedAt <= Date.now() && !updates.error && !updates.loading;
  const attention = fresh ? available.filter((component) => updates.ignored[component] !== releases[component]?.version) : [];
  return { ...updates, snapshot, releases, current, connected, infoLoading, infoError, fresh, attention, endpoint: `${host}:${port}` };
}

/** 页面存活期间每天检查；恢复网络和切回窗口时复核到期时间。 */
export function useAutomaticUpdateCheck() {
  useEffect(() => {
    const check = () => { if (document.visibilityState !== 'hidden') void useUpdateStore.getState().check(); };
    check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
}
