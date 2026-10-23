import { useUnitStore } from '@/stores/unitStore';
import { chartUnit } from '@/core/Units';
import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Tabs } from 'antd';
import { PauseOutlined, PlayCircleOutlined, DownloadOutlined, SettingOutlined } from '@ant-design/icons';
import { telemetryBuffer } from '@/core/TelemetryBuffer';
import { useConnectionStore } from '@/stores/connectionStore';
import { usePlotStore } from '@/stores/plotStore';
import { getChartDataKey } from '@/hooks/usePlotDataCollector';
import { RealtimeChart } from '@/components/plot/RealtimeChart';
import { PlotConfigDialog } from '@/components/plot/PlotConfigDialog';
import { useT } from '@/i18n/useT';
import { downloadText } from '@/core/downloadText';
import { ControllerLogs } from './ControllerLogs';
import { LogFileActions } from './LogFileActions';
import { DemoBadge, TeachCard } from './TeachCard';

export function Diagnostics() {
  const t = useT();
  const units = useUnitStore();
  const connected = useConnectionStore((s) => s.isConnected);
  const allCharts = usePlotStore((s) => s.charts);
  const chartCount = usePlotStore((s) => s.chartCount);
  const charts = useMemo(() => allCharts.slice(0, chartCount), [allCharts, chartCount]);
  const [now, setNow] = useState(Date.now());
  const [frozen, setFrozen] = useState(false);
  const [windowMs, setWindowMs] = useState(60_000);
  const [configIndex, setConfigIndex] = useState<number | null>(null);
  useEffect(() => {
    if (frozen) return;
    const timer = setInterval(() => setNow(connected ? telemetryBuffer.latestTime : Date.now()), 100);
    return () => clearInterval(timer);
  }, [frozen, connected]);
  useEffect(() => { setFrozen(false); setNow(Date.now()); }, [connected]);
  const data = useMemo(() => charts.map((chart, i) => connected
    ? telemetryBuffer.read(getChartDataKey(chart.dataSource, chart.jointIndex), windowMs, now)
    : Array.from({ length: 600 }, (_, index) => ({ timestamp: now - windowMs + index * windowMs / 599, value: Math.sin(index / 32 + i + now / 9000) * (i + 1) * 0.2 + Math.cos(index / 13) * 0.025 }))), [charts, connected, windowMs, now]);
  const exportCSV = () => {
    const rows = data.flatMap((points, i) => points.map((p) => `${connected ? 'controller' : 'demo'},${getChartDataKey(charts[i].dataSource, charts[i].jointIndex)},${p.timestamp},${p.value === null ? '' : p.value * chartUnit(charts[i].dataSource, units).factor},${chartUnit(charts[i].dataSource, units).label}`));
    downloadText('telemetry.csv', 'source,channel,timestamp_ms,value,unit\n' + rows.join('\n'), 'text/csv');
  };
  return <div className="teach-page teach-diagnostics" data-motion>
    <Tabs className="teach-fill-tabs" items={[
      { key: 'curves', label: t('teach.charts'), children: <>
        <div className="teach-chart-toolbar"><div>{!connected && <DemoBadge />}<span className="teach-muted">{t('teach.chartHint')}</span></div><div className="teach-button-row">
          <Select aria-label={t('teach.channels')} value={chartCount} onChange={usePlotStore.getState().setChartCount} options={[4, 8, 16].map((value) => ({ value, label: `${value} ${t('teach.channels')}` }))} />
          <Select aria-label={t('teach.window')} value={windowMs} onChange={setWindowMs} options={[1, 5, 10].map((v) => ({ value: v * 60_000, label: `${v} ${t('teach.minute')}` }))} />
          <Button icon={frozen ? <PlayCircleOutlined /> : <PauseOutlined />} onClick={() => setFrozen(!frozen)}>{t(frozen ? 'teach.follow' : 'teach.freeze')}</Button>
          <Button icon={<DownloadOutlined />} onClick={exportCSV}>{t('teach.exportCSV')}</Button>
        </div></div>
        <div className="teach-chart-grid">{charts.map((chart, i) => <TeachCard key={chart.id} title={chart.titleKey ? t(chart.titleKey) : chart.title}
          extra={<Button aria-label={t('app.settings')} icon={<SettingOutlined />} onClick={() => setConfigIndex(i)} />}>
          <RealtimeChart config={chart} data={data[i]} />
        </TeachCard>)}</div>
      </> },
      { key: 'logs', label: t('teach.logs'), children: <TeachCard title={t('teach.logs')} extra={<LogFileActions />}><ControllerLogs /></TeachCard> },
    ]} />
    {configIndex !== null && <PlotConfigDialog open onClose={() => setConfigIndex(null)} chartIndex={configIndex} config={charts[configIndex]} />}
  </div>;
}
