import { useState } from 'react';
import { Button, Input, Modal, Popconfirm, Tabs, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTeachStore, demoJoints, demoPosition, type TeachPoint } from '@/stores/teachStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useRobotStateStore } from '@/stores/robotStateStore';
import { useT } from '@/i18n/useT';
import { DemoBadge } from './TeachCard';
import { IOSummary, ProgramList } from './Overview';

export function ContextPanel() {
  const t = useT();
  const points = useTeachStore((s) => s.points);
  const addPoint = useTeachStore((s) => s.addPoint);
  const renamePoint = useTeachStore((s) => s.renamePoint);
  const deletePoint = useTeachStore((s) => s.deletePoint);
  const [edit, setEdit] = useState<TeachPoint | null>(null);
  const [name, setName] = useState('');
  const [collapsed, setCollapsed] = useState(() => matchMedia('(max-width: 1199px)').matches);
  const connected = useConnectionStore((s) => s.isConnected);
  const record = () => {
    const state = useRobotStateStore.getState().robotState;
    if (connected && (!state?.flange || !state.joint_states.length)) { message.warning(t('teach.noData')); return; }
    addPoint({
      name: `${t('teach.point')} ${points.length + 1}`,
      joints: connected ? state!.joint_states.map((j) => j.position * 180 / Math.PI) : demoJoints,
      position: connected ? [state!.flange!.position.x, state!.flange!.position.y, state!.flange!.position.z].map((v) => v * 1000) : demoPosition,
      source: connected ? 'captured' : 'demo',
    });
    message.success(t('teach.savedLocal'));
  };
  return <section className={`teach-card teach-context ${collapsed ? 'collapsed' : ''}`}>
    <Tabs defaultActiveKey="points" tabBarExtraContent={<div className="teach-context-actions">
      <Button type="primary" icon={<PlusOutlined />} onClick={record}>{t('teach.recordPoint')}</Button>
      <Button aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{t(collapsed ? 'teach.expand' : 'teach.collapse')}</Button>
    </div>} items={[
      { key: 'points', label: `${t('teach.points')} (${points.length})`, children: <div className="teach-table-scroll">
        <div className="teach-context-caption">{t('teach.localPoints')}</div>
        <table className="teach-table"><thead><tr><th>ID</th><th>{t('teach.name')}</th><th>X (mm)</th><th>Y (mm)</th><th>Z (mm)</th><th>{t('teach.source')}</th><th>{t('teach.actions')}</th></tr></thead>
          <tbody>{points.map((p, i) => <tr key={p.id}><td><span className="teach-point-index">{String(i + 1).padStart(2, '0')}</span></td><td>{p.name}</td>{p.position.map((v, j) => <td key={j}>{v.toFixed(3)}</td>)}<td>{p.source === 'demo' ? <DemoBadge /> : t('teach.captured')}</td><td>
            <Button type="text" aria-label={t('teach.rename')} icon={<EditOutlined />} onClick={() => { setEdit(p); setName(p.name); }} />
            <Popconfirm title={t('teach.deletePoint')} onConfirm={() => deletePoint(p.id)}><Button type="text" danger aria-label={t('teach.deletePoint')} icon={<DeleteOutlined />} /></Popconfirm>
          </td></tr>)}</tbody></table>
        {!points.length && <p className="teach-empty">{t('teach.noPoints')}</p>}
      </div> },
      { key: 'programs', label: t('teach.programs'), children: <><DemoBadge /><ProgramList /></> },
      { key: 'io', label: t('teach.io'), children: <><DemoBadge /><IOSummary /></> },
      { key: 'alarms', label: t('teach.alarms'), children: <p><DemoBadge /> {t('teach.demoNoAlarms')}</p> },
      { key: 'logs', label: t('teach.logs'), children: <p><DemoBadge /> 09:42:18 — {t('teach.event.saved')}</p> },
    ]} />
    <Modal title={t('teach.rename')} open={!!edit} onCancel={() => setEdit(null)} onOk={() => { if (edit && name.trim()) { renamePoint(edit.id, name.trim()); setEdit(null); } }}>
      <Input aria-label={t('teach.name')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
    </Modal>
  </section>;
}
