import { Fragment, useState } from 'react';
import { Alert, Button, Modal, Spin, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useRobotInfo } from '@/hooks/useRobotInfo';
import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import type { InfoSource } from '@/core/types';

const sources: Record<InfoSource, TranslationKey> = {
  placeholder: 'info.placeholder', configuration: 'info.configuration', runtime: 'info.runtime',
};

export function ControllerInfoPanel() {
  const t = useT();
  const { info, connected, loading, error, refresh } = useRobotInfo();
  const missing = t('teach.model.missing');
  const display = (value: string | number | boolean | null | undefined) => value == null ? missing
    : typeof value === 'boolean' ? t(value ? 'info.yes' : 'info.no') : String(value);
  const fields = (rows: [TranslationKey, string | number | boolean | null | undefined][]) => <dl>{rows.map(([key, value]) =>
    <Fragment key={key}><dt>{t(key)}</dt><dd>{display(value)}</dd></Fragment>)}</dl>;
  const badge = (source?: InfoSource) => <Tag>{t(sources[source ?? 'placeholder'] ?? 'info.placeholder')}</Tag>;
  const { controller, robot, master } = info ?? {};
  return <div className="teach-controller-info">
    <div className="teach-info-toolbar"><Button icon={<ReloadOutlined />} onClick={refresh} disabled={!connected} loading={loading}>{t('info.refresh')}</Button></div>
    {!connected ? <p className="teach-card-footnote">{t('info.connect')}</p> : loading ? <Spin /> : error ?
      <Alert type="warning" showIcon message={t('info.failed')} description={error === 'timeout' ? t('info.timeout') : error} /> :
      info && info.info_schema_version === undefined ? <Alert type="info" showIcon message={t('info.legacy')} /> : info && <>
        <div className="teach-card-footnote">{t('info.schema', { version: info.info_schema_version ?? '—' })}</div>
        <div className="teach-info-columns">
          <section><h3>{t('info.software')}</h3>{fields([
            ['info.appVersion', controller?.app_version], ['info.commit', controller?.build_commit],
            ['info.apiVersion', controller?.api_version], ['info.abi', controller?.shm_abi_version],
            ['info.capabilities', controller?.capabilities.join(', ') || null],
          ])}</section>
          <section><h3>{t('info.robot')} {badge(robot?.source)}</h3>{fields([
            ['info.name', robot?.name], ['info.packageVersion', robot?.package_version],
            ['info.deviceId', robot?.device_id], ['teach.model.serial', robot?.serial_number],
            ['teach.dof', robot?.dof], ['info.baseLink', robot?.base_link], ['info.tipLink', robot?.tip_link],
            ['teach.model.links', robot?.link_count], ['info.mass', robot?.mass_kg],
            ['info.massComplete', robot?.mass_complete], ['info.digest', robot?.model_digest],
          ])}</section>
          <section><h3>{t('info.master')} {badge(master?.source)}</h3>{fields([
            ['info.backend', master?.backend === 'unknown' ? null : master?.backend], ['info.masterVersion', master?.version],
            ['info.sdkVersion', master?.sdk_version], ['info.masterId', master?.master_id],
            ['info.cycle', master?.cycle_time_us], ['info.slaveCount', master?.configured_slave_count],
          ])}</section>
        </div>
        <h3>{t('info.slaves')}</h3>
        {!info.slaves_complete && <p className="teach-card-footnote">{t('info.partialSlaves')}</p>}
        {info.slaves?.length ? <div className="teach-info-table-scroll"><table className="teach-info-table">
          <thead><tr>{(['info.slaveId', 'info.nameJoint', 'info.role', 'info.identity', 'info.firmware', 'info.pdo', 'teach.source'] as const)
            .map((key) => <th key={key}>{t(key)}</th>)}</tr></thead>
          <tbody>{info.slaves.map((slave, index) => <tr key={`${slave.id}:${index}`}>
            <td>{slave.id}</td><td>{display(slave.name)}<br />{display(slave.joint_name)}</td>
            <td>{t(({ drive: 'info.drive', ft_sensor: 'info.ftSensor', io: 'info.io', unknown: 'info.unknown' } as const)[slave.role] ?? 'info.unknown')}</td>
            <td>{fields([['info.vendor', slave.vendor_id], ['info.product', slave.product_code],
              ['info.revision', slave.revision_number], ['teach.model.serial', slave.serial_number]])}</td>
            <td>{display(slave.firmware_version)}</td><td>{fields([['info.input', slave.input_pdo_count], ['info.output', slave.output_pdo_count]])}</td>
            <td>{badge(slave.source)}<br /><small>{t('info.identitySource')}: {t(({ unknown: 'info.unknown', configuration: 'info.configuration', device: 'info.device' } as const)[slave.identity_source] ?? 'info.unknown')}</small></td>
          </tr>)}</tbody>
        </table></div> : <p className="teach-card-footnote">{t('info.noSlaves')}</p>}
      </>}
  </div>;
}

export function ControllerInfoDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return <>
    <Button className="teach-info-open" size="small" onClick={() => setOpen(true)}>{t('info.open')}</Button>
    <Modal title={t('info.title')} open={open} onCancel={() => setOpen(false)} footer={null}
      width={1100} destroyOnClose styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}>
      <ControllerInfoPanel />
    </Modal>
  </>;
}
