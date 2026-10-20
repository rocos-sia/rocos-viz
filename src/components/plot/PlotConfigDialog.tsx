import { useState } from 'react';
import { Modal, Tree, Space, InputNumber } from 'antd';
import { usePlotStore, ChartConfig, DataSourceKey } from '@/stores/plotStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';

interface PlotConfigDialogProps {
  open: boolean;
  onClose: () => void;
  chartIndex: number;
  config: ChartConfig;
}

export function PlotConfigDialog({ open, onClose, chartIndex, config }: PlotConfigDialogProps) {
  const t = useT();
  const [selectedSource, setSelectedSource] = useState<DataSourceKey>(config.dataSource);
  const [jointIndex, setJointIndex] = useState(config.jointIndex ?? 0);
  const jointCount = useRobotStateStore((s) => s.robotState?.joint_states.length ?? 7);
  const updateChart = usePlotStore((s) => s.updateChart);

  const dataSources = [
    {
      title: t('plot.group.joint'),
      key: 'joint_group',
      selectable: false,
      children: [
        { title: t('plot.src.position'), key: 'joint_position' },
        { title: t('plot.src.velocity'), key: 'joint_velocity' },
        { title: t('plot.src.torque'), key: 'joint_torque' },
        { title: t('plot.src.load'), key: 'joint_load' },
      ],
    },
    {
      title: t('plot.group.flange'),
      key: 'flange_group',
      selectable: false,
      children: [
        { title: 'X', key: 'flange_x' },
        { title: 'Y', key: 'flange_y' },
        { title: 'Z', key: 'flange_z' },
      ],
    },
  ];

  const handleOk = () => {
    const keys: Record<DataSourceKey, TranslationKey> = {
      joint_position: 'plot.src.position', joint_velocity: 'plot.src.velocity', joint_torque: 'plot.src.torque', joint_load: 'plot.src.load',
      flange_x: 'plot.title.flangeX', flange_y: 'teach.flangeY', flange_z: 'teach.flangeZ',
    };
    updateChart(chartIndex, { dataSource: selectedSource, jointIndex, titleKey: keys[selectedSource] });
    onClose();
  };

  return (
    <Modal
      open={open}
      title={t('plot.chartConfig', { n: chartIndex + 1 })}
      onOk={handleOk}
      onCancel={onClose}
      width={400}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <div style={{ marginBottom: 8 }}>{t('plot.dataSource')}:</div>
          <Tree
            treeData={dataSources}
            defaultExpandAll
            onSelect={(keys) => {
              const key = keys[0] as DataSourceKey;
              if (key && !key.endsWith('_group')) {
                setSelectedSource(key);
              }
            }}
            selectedKeys={[selectedSource]}
          />
        </div>

        {selectedSource.startsWith('joint_') && (
          <div>
            <div style={{ marginBottom: 8 }}>{t('plot.jointIndex')}:</div>
            <InputNumber
              min={0}
              max={Math.max(0, jointCount - 1)}
              value={jointIndex}
              onChange={(v) => setJointIndex(v ?? 0)}
            />
          </div>
        )}
      </Space>
    </Modal>
  );
}
