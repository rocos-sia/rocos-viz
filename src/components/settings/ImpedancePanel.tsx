import { useUnits } from '@/stores/unitStore';
import { useState, useCallback, useRef } from 'react';
import { Button, InputNumber, Slider, Radio, Spin, message, Divider } from 'antd';
import {
  ImportOutlined,
  ExportOutlined,
  SyncOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useConnectionStore } from '@/stores/connectionStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useT } from '@/i18n/useT';

const JOINT_COUNT = 7;

const STIFFNESS_MIN = 0;
const STIFFNESS_MAX = 2000;
const DAMPING_MIN = 0;
const DAMPING_MAX = 2;
const DEFAULT_STIFFNESS = 1000;
const DEFAULT_DAMPING = 0.2;

interface JointParam { stiffness: number; damping: number; }
interface AxisGroup { stiffness: number; damping: number; }

interface LocalState {
  joints: JointParam[];
  translational: AxisGroup;
  rotational: AxisGroup;
  frame: 'base' | 'tool';
}

const CART_AXES: { key: string; label: string; group: 'translational' | 'rotational' }[] = [
  { key: 'x',  label: 'X',  group: 'translational' },
  { key: 'y',  label: 'Y',  group: 'translational' },
  { key: 'z',  label: 'Z',  group: 'translational' },
  { key: 'rx', label: 'Rx', group: 'rotational' },
  { key: 'ry', label: 'Ry', group: 'rotational' },
  { key: 'rz', label: 'Rz', group: 'rotational' },
];

function defaultState(): LocalState {
  return {
    joints: Array.from({ length: JOINT_COUNT }, () => ({
      stiffness: DEFAULT_STIFFNESS,
      damping: DEFAULT_DAMPING,
    })),
    translational: { stiffness: DEFAULT_STIFFNESS, damping: DEFAULT_DAMPING },
    rotational:    { stiffness: DEFAULT_STIFFNESS, damping: DEFAULT_DAMPING },
    frame: 'base',
  };
}

// ─── Param Row ───────────────────────────────────────────────────────────────

interface ParamRowProps {
  linear?: boolean;
  label: string;
  stiffness: number;
  damping: number;
  onStiffnessChange: (v: number) => void;
  onDampingChange:   (v: number) => void;
  stiffnessLabel: string;
  dampingLabel: string;
}

function ParamRow({ linear = false, label, stiffness, damping, onStiffnessChange, onDampingChange, stiffnessLabel, dampingLabel }: ParamRowProps) {
  const units = useUnits();
  const numerator = linear ? units.force : units.torque;
  const denominator = linear ? units.length : units.angle;
  const factor = numerator.factor / denominator.factor;
  const unit = `${numerator.label}/${denominator.label}`;
  const dampingUnit = `${numerator.label}·s/${denominator.label}`;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
        {label}
      </div>
      <div className="teach-impedance-inputs">
        <span style={{ fontSize: 'var(--font-body)', flexShrink: 0, minWidth: 26 }}>{stiffnessLabel} ({unit})</span>
        <InputNumber
          value={stiffness * factor}
          min={STIFFNESS_MIN * factor}
          max={STIFFNESS_MAX * factor}
          step={factor}
          precision={6}
          size="small"
          style={{ width: 88 }}
          onChange={(v) => v !== null && onStiffnessChange(v / factor)}
        />
        <Slider
          value={stiffness * factor}
          min={STIFFNESS_MIN * factor}
          max={STIFFNESS_MAX * factor}
          step={factor}
          style={{ flex: 1, minWidth: 60 }}
          tooltip={{ formatter: (v) => `${v?.toFixed(2)}` }}
          onChange={(v) => onStiffnessChange(v / factor)}
        />
        <span style={{ fontSize: 'var(--font-body)', flexShrink: 0, minWidth: 34 }}>{dampingLabel} ({dampingUnit})</span>
        <InputNumber
          value={damping * factor}
          min={DAMPING_MIN * factor}
          max={DAMPING_MAX * factor}
          step={0.01 * factor}
          precision={6}
          size="small"
          style={{ width: 72 }}
          onChange={(v) => v !== null && onDampingChange(v / factor)}
        />
        <Slider
          value={damping * factor}
          min={DAMPING_MIN * factor}
          max={DAMPING_MAX * factor}
          step={0.01 * factor}
          style={{ flex: 1, minWidth: 60 }}
          tooltip={{ formatter: (v) => `${v?.toFixed(2)}` }}
          onChange={(v) => onDampingChange(v / factor)}
        />
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, extra }: { title: string; extra?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      paddingBottom: 8,
      borderBottom: '1px solid var(--color-border)',
    }}>
      <span style={{ fontWeight: 600, fontSize: 'var(--font-body)' }}>{title}</span>
      {extra}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function ImpedancePanel() {
  const t = useT();
  const [state, setState] = useState<LocalState>(defaultState);
  const [loading, setLoading] = useState(false);

  const host        = useConnectionStore((s) => s.host);
  const port        = useConnectionStore((s) => s.port);
  const isConnected = useConnectionStore((s) => s.isConnected);

  const stiffnessLabel = t('imp.stiffness');
  const dampingLabel   = t('imp.damping');

  const updateJoint = useCallback((index: number, field: 'stiffness' | 'damping', value: number) => {
    setState((prev) => ({
      ...prev,
      joints: prev.joints.map((j, i) => i === index ? { ...j, [field]: value } : j),
    }));
  }, []);

  const updateCart = useCallback((group: 'translational' | 'rotational', field: 'stiffness' | 'damping', value: number) => {
    setState((prev) => ({
      ...prev,
      [group]: { ...prev[group], [field]: value },
    }));
  }, []);

  // ── Refresh (fetch from controller) ──
  const handleRefresh = useCallback(async () => {
    if (!isConnected) { message.warning(t('imp.connectFirst')); return; }
    setLoading(true);
    try {
      const client = new RobotApiClient(host, port);
      const data = await client.getImpedance();
      setState((prev) => {
        const next = { ...prev };
        if (data.joint_space?.stiffness?.length) {
          next.joints = Array.from({ length: JOINT_COUNT }, (_, i) => ({
            stiffness: data.joint_space!.stiffness[i] ?? DEFAULT_STIFFNESS,
            damping:   data.joint_space!.damping[i]   ?? DEFAULT_DAMPING,
          }));
        }
        if (data.cartesian_space) {
          const cs = data.cartesian_space;
          next.translational = {
            stiffness: cs.translational_stiffness ?? DEFAULT_STIFFNESS,
            damping:   cs.translational_damping   ?? DEFAULT_DAMPING,
          };
          next.rotational = {
            stiffness: cs.rotational_stiffness ?? DEFAULT_STIFFNESS,
            damping:   cs.rotational_damping   ?? DEFAULT_DAMPING,
          };
        }
        return next;
      });
      message.success(t('imp.refreshed'));
    } catch (err) {
      message.error(t('imp.refreshFailed', { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      setLoading(false);
    }
  }, [isConnected, host, port]);

  // ── Apply (send to controller) ──
  const handleApply = useCallback(async () => {
    if (!isConnected) { message.warning(t('imp.connectFirst')); return; }
    setLoading(true);
    try {
      const client = new RobotApiClient(host, port);
      await client.setImpedance({
        joint_space: {
          stiffness: state.joints.map((j) => j.stiffness),
          damping:   state.joints.map((j) => j.damping),
        },
        cartesian_space: {
          translational_stiffness: state.translational.stiffness,
          translational_damping:   state.translational.damping,
          rotational_stiffness:    state.rotational.stiffness,
          rotational_damping:      state.rotational.damping,
        },
      });
      message.success(t('imp.applied'));
    } catch (err) {
      message.error(t('imp.applyFailed', { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      setLoading(false);
    }
  }, [isConnected, host, port, state]);

  // ── Export ──
  const handleExport = useCallback(() => {
    const payload = {
      joint_space: {
        stiffness: state.joints.map((j) => j.stiffness),
        damping:   state.joints.map((j) => j.damping),
      },
      cartesian_space: {
        translational_stiffness: state.translational.stiffness,
        translational_damping:   state.translational.damping,
        rotational_stiffness:    state.rotational.stiffness,
        rotational_damping:      state.rotational.damping,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'impedance_params.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  // ── Import ──
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setState((prev) => {
          const next = { ...prev };
          if (data.joint_space) {
            next.joints = Array.from({ length: JOINT_COUNT }, (_, i) => ({
              stiffness: data.joint_space.stiffness?.[i] ?? DEFAULT_STIFFNESS,
              damping:   data.joint_space.damping?.[i]   ?? DEFAULT_DAMPING,
            }));
          }
          if (data.cartesian_space) {
            const cs = data.cartesian_space;
            next.translational = {
              stiffness: cs.translational_stiffness ?? DEFAULT_STIFFNESS,
              damping:   cs.translational_damping   ?? DEFAULT_DAMPING,
            };
            next.rotational = {
              stiffness: cs.rotational_stiffness ?? DEFAULT_STIFFNESS,
              damping:   cs.rotational_damping   ?? DEFAULT_DAMPING,
            };
          }
          return next;
        });
        message.success(t('imp.imported'));
      } catch {
        message.error(t('imp.importError'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  return (
    <Spin spinning={loading} style={{ height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* Two-column body */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          overflowY: 'auto',
          paddingBottom: 12,
          alignItems: 'start',
        }}>
          {/* ── Joint Space ── */}
          <div>
            <SectionHeader title={t('imp.jointSpace')} />
            {state.joints.map((joint, i) => (
              <ParamRow
                key={i}
                label={t('imp.joint', { n: i + 1 })}
                stiffness={joint.stiffness}
                damping={joint.damping}
                stiffnessLabel={stiffnessLabel}
                dampingLabel={dampingLabel}
                onStiffnessChange={(v) => updateJoint(i, 'stiffness', v)}
                onDampingChange={(v)   => updateJoint(i, 'damping',   v)}
              />
            ))}
          </div>

          {/* ── Cartesian Space ── */}
          <div>
            <SectionHeader
              title={t('imp.cartesianSpace')}
              extra={
                <Radio.Group
                  value={state.frame}
                  size="small"
                  onChange={(e) => setState((prev) => ({ ...prev, frame: e.target.value }))}
                >
                  <Radio value="base">{t('imp.baseFrame')}</Radio>
                  <Radio value="tool">{t('imp.toolFrame')}</Radio>
                </Radio.Group>
              }
            />
            {CART_AXES.map(({ key, label, group }) => (
              <ParamRow
                key={key}
                label={label}
                linear={group === 'translational'}
                stiffness={state[group].stiffness}
                damping={state[group].damping}
                stiffnessLabel={stiffnessLabel}
                dampingLabel={dampingLabel}
                onStiffnessChange={(v) => updateCart(group, 'stiffness', v)}
                onDampingChange={(v)   => updateCart(group, 'damping',   v)}
              />
            ))}
          </div>
        </div>

        {/* Bottom buttons */}
        <Divider style={{ margin: '12px 0 12px' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Button icon={<ImportOutlined />} onClick={() => fileInputRef.current?.click()}>{t('imp.import')}</Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>{t('imp.export')}</Button>
          <Button icon={<SyncOutlined />}   onClick={handleRefresh}>{t('imp.refresh')}</Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={handleApply}>{t('imp.apply')}</Button>
        </div>
      </div>
    </Spin>
  );
}
