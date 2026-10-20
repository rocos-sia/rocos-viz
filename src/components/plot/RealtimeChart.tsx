import ReactECharts from 'echarts-for-react';
import { ChartConfig } from '@/stores/plotStore';
import { useUIStore } from '@/stores/uiStore';
import { useT } from '@/i18n/useT';

interface RealtimeChartProps {
  config: ChartConfig;
  data: { timestamp: number; value: number | null }[];
  onClick?: () => void;
}

export function RealtimeChart({ config, data, onClick }: RealtimeChartProps) {
  const t = useT();
  // ECharts renders to canvas, which cannot resolve CSS variables — resolve
  // theme-appropriate colors here so axis/title labels stay readable.
  const themeMode = useUIStore((s) => s.themeMode);
  const isDark = themeMode === 'dark';
  const textColor = isDark ? '#e0e0e0' : '#1a1a1a';
  const subTextColor = isDark ? '#858585' : '#6b7280';
  const axisLineColor = isDark ? '#3a3d46' : '#d1d5db';

  const title = config.titleKey ? t(config.titleKey) : config.title;

  const option = {
    animation: false,
    textStyle: { fontFamily: 'AlibabaPuHuiTi' },
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 12, color: textColor },
    },
    tooltip: {
      trigger: 'axis' as const,
    },
    grid: {
      left: 40,
      right: 10,
      top: 30,
      bottom: 25,
    },
    xAxis: {
      type: 'time' as const,
      axisLabel: { fontSize: 13, color: subTextColor },
      axisLine: { lineStyle: { color: axisLineColor } },
    },
    yAxis: {
      type: 'value' as const,
      scale: true,
      axisLabel: { fontSize: 13, color: subTextColor },
      axisLine: { lineStyle: { color: axisLineColor } },
      splitLine: { lineStyle: { color: axisLineColor, opacity: 0.4 } },
    },
    series: [
      {
        name: title,
        type: 'line' as const,
        data: data.map((d) => [d.timestamp, d.value]),
        id: String(config.id),
        showSymbol: false,
        connectNulls: false,
        sampling: 'lttb' as const,
        animation: false,
        lineStyle: { width: 1.5, color: '#3b82f6' },
        areaStyle: { color: 'rgba(59, 130, 246, 0.1)' },
      },
    ],
    dataZoom: [
      { type: 'inside' as const, xAxisIndex: 0 },
    ],
  };

  return (
    <div
      onClick={onClick}
      style={{ width: '100%', height: '100%', cursor: onClick ? 'pointer' : 'default' }}
    >
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
