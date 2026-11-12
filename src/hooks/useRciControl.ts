import { useCallback, useEffect } from 'react';
import { Modal, message } from 'antd';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useT } from '@/i18n/useT';

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 100));

// 释放响应丢失时检查持有者，保留失败凭据以便下一轮重试。
async function release(client: RobotApiClient, token: string) {
  try { await client.releaseControl(token); }
  catch (error) {
    const status = await client.getControlStatus(AbortSignal.timeout(5000));
    if (!status.success || (status.data?.has_owner &&
        status.data.owner_client_id === RobotApiClient.getClientId())) throw error;
  }
}

export function useRciControl() {
  const t = useT();
  const connection = useConnectionStore();
  const { host, port, isConnected, rci, rciBusy, rciPhase, controlToken, connectionEpoch } = connection;

  const run = useCallback(async (intent: 'enter' | 'exit' | 'takeover') => {
    const original = useConnectionStore.getState();
    if (!original.isConnected || original.host !== host || original.port !== port ||
        original.rciBusy || original.rciPhase === 'releasing') return;
    const epoch = original.connectionEpoch;
    const current = () => {
      const state = useConnectionStore.getState();
      return state.isConnected && state.connectionEpoch === epoch && state.host === host && state.port === port;
    };
    const check = () => { if (!current()) throw new Error(t('rci.connectionChanged')); };
    const client = new RobotApiClient(host, port);
    useConnectionStore.setState({ rciBusy: true, rciPhase: intent === 'enter' ? 'entering' : null });
    try {
      let token = original.controlToken;
      if (token) {
        const heartbeat = await client.heartbeatControl(token, AbortSignal.timeout(5000));
        check();
        if (!heartbeat.success) {
          token = null;
          useConnectionStore.setState({ controlToken: null, controlAcquiredAt: null });
        }
      }
      if (!token) {
        let result = await client.acquireControl(`web-${navigator.platform}`);
        if (!current()) {
          if (result.success && result.data?.token) await release(client, result.data.token);
          return;
        }
        if (!result.success && result.code === 3008) {
          const owner = [result.data?.owner_name, result.data?.owner_ip].filter(Boolean).join(' / ') || t('teach.unknown');
          const confirmed = await new Promise<boolean>(resolve => {
            Modal.confirm({
              title: t('control.takeoverTitle'),
              content: t('rci.takeoverConfirm', { owner }),
              okText: t(intent === 'enter' ? 'rci.takeoverEnter' : 'rci.takeoverExit'),
              cancelText: t('rci.cancel'),
              onOk: () => resolve(true), onCancel: () => resolve(false),
            });
          });
          check();
          if (!confirmed) return;
          result = await client.takeoverControl(`web-${navigator.platform}`);
        }
        if (!current()) {
          if (result.success && result.data?.token) await release(client, result.data.token);
          return;
        }
        if (!result.success || !result.data?.token) throw new Error(result.message);
        token = result.data.token;
        useConnectionStore.setState({ controlToken: token, controlAcquiredAt: Date.now(),
          controlOwnerName: result.data.owner_name ?? null, controlOwnerIp: result.data.owner_ip ?? null });
      }
      const waitReady = async () => {
        const deadline = Date.now() + 15000;
        while (true) {
          check();
          const status = await client.getRciStatus();
          check();
          if (status.robot_state === 'ERROR_STATE') throw new Error(t('rci.error'));
          if (!status.enabled && !status.closing && !status.control_active && status.robot_state === 'STOPPED') return;
          if (Date.now() >= deadline) throw new Error(t('rci.waitTimeout'));
          await pause();
        }
      };
      if (intent === 'enter') {
        let status = await client.getRciStatus();
        check();
        if (status.closing || status.robot_state === 'STOPPING') await waitReady();
        // 服务端再次验证使能、STOPPED 和活动脚本。
        try { await client.enableRci(token); }
        catch (error) {
          try { status = await client.getRciStatus(); }
          catch {
            check();
            if (useConnectionStore.getState().rci?.robot_state !== 'ERROR_STATE')
              useConnectionStore.getState().setRci(null);
            throw error;
          }
          if (!status.enabled || status.closing) throw error;
        }
        check();
        useConnectionStore.setState({ rciPhase: 'releasing' });
        await release(client, token);
        check();
        useConnectionStore.setState({ controlToken: null, controlAcquiredAt: null, rciPhase: null });
      } else {
        useConnectionStore.setState({ rciPhase: 'exiting' });
        await client.disableRci(token);
        check();
        // ERROR_STATE 仍允许取得控制权用于复位。
        const status = await client.getRciStatus();
        check();
        if (status.enabled || status.closing || status.control_active) await waitReady();
      }
      if (intent === 'enter' && useConnectionStore.getState().rci?.robot_state === 'ERROR_STATE')
        throw new Error(t('rci.error'));
      message.success(t(intent === 'enter' ? 'rci.entered' : 'rci.exited'));
    } catch (error) {
      if (current()) message.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (current()) useConnectionStore.setState(state => ({ rciBusy: false,
        rciPhase: state.rciPhase === 'releasing' && state.controlToken ? 'releasing' : null }));
    }
  }, [host, port, t]);

  // 刷新页面恢复到 RCI 时释放已有凭据；失败后持续只读、暂停心跳并重试。
  useEffect(() => {
    if (!controlToken && rciPhase === 'releasing') {
      useConnectionStore.setState({ rciPhase: null });
      return;
    }
    if (!isConnected || !controlToken || rciBusy || rciPhase === 'exiting' ||
        (!rci?.enabled && rciPhase !== 'releasing')) return;
    let cancelled = false;
    let inFlight = false;
    const client = new RobotApiClient(host, port);
    useConnectionStore.setState({ rciPhase: 'releasing' });
    const attempt = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await release(client, controlToken);
        const state = useConnectionStore.getState();
        if (!cancelled && state.connectionEpoch === connectionEpoch && state.controlToken === controlToken)
          useConnectionStore.setState({ controlToken: null, controlAcquiredAt: null, rciPhase: null });
      } catch { /* 保留绿色待确认状态，下个周期重试。 */ }
      finally { inFlight = false; }
    };
    void attempt();
    const timer = setInterval(attempt, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [host, port, isConnected, controlToken, rci?.enabled, rciBusy, rciPhase, connectionEpoch]);

  return {
    toggleRci: () => run(useConnectionStore.getState().rci?.enabled ? 'exit' : 'enter'),
    takeControl: () => run('takeover'),
  };
}
