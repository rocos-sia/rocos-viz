import { useState } from 'react';
import { Button, Checkbox, Form, Input, Alert } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import { useConnectionStore } from '@/stores/connectionStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useT } from '@/i18n/useT';

export function ConnectionSettings() {
  const t = useT();
  const connection = useConnectionStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const connect = async (values: { host: string; port: string; autoLoadModel: boolean }) => {
    setLoading(true);
    setError('');
    const host = values.host.trim();
    const port = String(Number(values.port));
    try {
      await new RobotApiClient(host, port).connect();
      connection.setConnection(host, port);
      useConnectionStore.setState({ autoLoadModel: values.autoLoadModel, isConnected: true });
    } catch (e) {
      setError(t('conn.failed', { msg: e instanceof Error ? e.message : String(e) }));
    } finally { setLoading(false); }
  };
  return <Form layout="vertical" className="teach-connection-form" initialValues={{ host: connection.host, port: connection.port, autoLoadModel: connection.autoLoadModel }} onFinish={connect} disabled={loading || connection.isConnected}>
    {error && <Alert type="error" showIcon role="alert" message={error} />}
    <div className="teach-connection-fields">
      <Form.Item name="host" label={t('conn.ipAddress')} validateTrigger="onBlur" rules={[{ required: true, whitespace: true, message: t('conn.invalidHost') }, { pattern: /^[a-zA-Z0-9.:[\]-]+$/, message: t('conn.invalidHost') }]}><Input autoComplete="off" /></Form.Item>
      <Form.Item name="port" label={t('conn.port')} validateTrigger="onBlur" rules={[{ validator: (_, value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535 ? Promise.resolve() : Promise.reject(new Error(t('conn.invalidPort'))) }]}><Input inputMode="numeric" /></Form.Item>
    </div>
    <Form.Item name="autoLoadModel" valuePropName="checked"><Checkbox>{t('conn.autoLoadModel')}</Checkbox></Form.Item>
    {!connection.isConnected && <Button type="primary" htmlType="submit" loading={loading} icon={<ApiOutlined aria-hidden="true" />}>{t('conn.connect')}</Button>}
  </Form>;
}
