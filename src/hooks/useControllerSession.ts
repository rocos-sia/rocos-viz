import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { useConnectionStore } from '@/stores/connectionStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { startControlHeartbeat } from '@/core/ControlHeartbeat';
import { useRobotConnection } from './useRobotConnection';
import { useT } from '@/i18n/useT';

/** One controller session owned by the application shell, never by a route. */
export function useControllerSession() {
  const t = useT();
  const [urdfContent, setUrdfContent] = useState<string | null>(null);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  // Mount the connection hook so polling / WebSocket starts when isConnected changes
  useRobotConnection();

  const controlToken = useConnectionStore((s) => s.controlToken);
  const controlOwnerName = useConnectionStore((s) => s.controlOwnerName);
  const controlOwnerIp = useConnectionStore((s) => s.controlOwnerIp);
  const setControlToken = useConnectionStore((s) => s.setControlToken);
  const setControlAcquiredAt = useConnectionStore((s) => s.setControlAcquiredAt);
  const setControlOwner = useConnectionStore((s) => s.setControlOwner);

  const handleDisconnect = useCallback(async () => {
    const token = useConnectionStore.getState().controlToken;
    useConnectionStore.getState().reset(); // Stop heartbeat before releasing.
    if (token) {
      try { await new RobotApiClient(host, port).releaseControl(token); }
      catch (error) { console.warn('Control release failed; lease will expire', error); }
    }
  }, [host, port]);

  const handleTakeover = useCallback(async () => {
    try {
      const client = new RobotApiClient(host, port);
      const result = await client.takeoverControl(`web-${navigator.platform}`);
      const connection = useConnectionStore.getState();
      if (!connection.isConnected || connection.host !== host || connection.port !== port) {
        if (result.success && result.data?.token) await client.releaseControl(result.data.token);
        return;
      }
      if (result.success && result.data?.token) {
        setControlToken(result.data.token);
        setControlAcquiredAt(Date.now());
        setControlOwner(result.data.owner_name ?? null, result.data.owner_ip ?? null);
        if (result.data.client_id) {
          sessionStorage.setItem('rocos_client_id', result.data.client_id);
        }
        message.success(t('control.takeoverSuccess'));
      } else {
        message.error(t('control.takeoverFailed', { msg: result.message }));
      }
    } catch (err) {
      message.error(t('control.takeoverFailed', { msg: err instanceof Error ? err.message : String(err) }));
    }
  }, [host, port, setControlToken, setControlAcquiredAt, setControlOwner, t]);

  // Acquire control right after connecting
  useEffect(() => {
    if (!isConnected) {
      setControlToken(null);
      setControlAcquiredAt(null);
      setControlOwner(null, null);
      return;
    }
    // A page reload can restore this tab's credentials; heartbeat validates them.
    if (useConnectionStore.getState().controlToken) return;

    let cancelled = false;

    async function acquireControl() {
      try {
        const client = new RobotApiClient(host, port);
        const result = await client.acquireControl(`web-${navigator.platform}`);
        if (cancelled) {
          if (result.success && result.data?.token) await client.releaseControl(result.data.token);
          return;
        }
        if (result.success && result.data?.token) {
          setControlToken(result.data.token);
          setControlAcquiredAt(Date.now());
          setControlOwner(result.data.owner_name ?? null, result.data.owner_ip ?? null);
          if (result.data.client_id) {
            sessionStorage.setItem('rocos_client_id', result.data.client_id);
          }
        } else {
          // code 3008: held by someone else
          setControlToken(null);
          setControlAcquiredAt(null);
          setControlOwner(result.data?.owner_name ?? null, result.data?.owner_ip ?? null);
        }
      } catch {
        // ignore — control right is a best-effort feature
      }
    }

    acquireControl();

    return () => { cancelled = true; };
  }, [isConnected, host, port, setControlToken, setControlAcquiredAt, setControlOwner]);

  // Renew ownership independently of buttons, robot motion, or read-only polling.
  useEffect(() => {
    if (!isConnected || !controlToken) return;
    const client = new RobotApiClient(host, port);
    return startControlHeartbeat({
      heartbeat: (signal) => client.heartbeatControl(controlToken, signal),
      onRejected: () => {
        if (useConnectionStore.getState().controlToken !== controlToken) return;
        setControlToken(null);
        setControlAcquiredAt(null);
        message.warning(t('control.lost'));
      },
      onError: (error) => console.warn('Control heartbeat failed; retrying without takeover', error),
    });
  }, [isConnected, host, port, controlToken, setControlToken, setControlAcquiredAt, t]);

  // Poll control status every 1s: detects expiry, server-side token rejection, and takeover
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const client = new RobotApiClient(host, port);
        const observedToken = useConnectionStore.getState().controlToken;
        const resp = await client.getControlStatus();
        const { controlToken: token } = useConnectionStore.getState();
        if (cancelled || token !== observedToken) return; // Ignore an older session's response.

        if (token) {
          // Server rejected the token even on the read endpoint (non-standard but handle it)
          if (!resp.success && (resp.code === 3007 || resp.code === 3006)) {
            setControlToken(null);
            setControlAcquiredAt(null);
            setControlOwner(null, null);
            return;
          }
          const status = resp.data;
          if (!status?.has_owner) {
            // token expired
            setControlToken(null);
            setControlAcquiredAt(null);
            setControlOwner(null, null);
          } else if (
            status.owner_client_id && status.owner_client_id !== RobotApiClient.getClientId()
          ) {
            setControlToken(null);
            setControlAcquiredAt(null);
            setControlOwner(status.owner_name ?? null, status.owner_ip ?? null);
          }
        } else {
          // not holding — keep owner info fresh for the takeover dialog
          const status = resp.data;
          if (status) setControlOwner(status.owner_name ?? null, status.owner_ip ?? null);
        }
      } catch {
        // ignore poll failures
      }
    };

    const id = window.setInterval(poll, 1_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isConnected, host, port, setControlToken, setControlAcquiredAt, setControlOwner]);

  // Fetch URDF model from controller on connect
  useEffect(() => {
    if (!isConnected) {
      setUrdfContent(null);
      return;
    }

    let cancelled = false;

    async function fetchModel() {
      try {
        const client = new RobotApiClient(host, port);
        const urdfXml = await client.getUrdf();

        if (cancelled) return;

        if (urdfXml && urdfXml.trim().startsWith('<')) {
          console.log('[AppLayout] Loaded URDF from controller, length:', urdfXml.length);
          setUrdfContent(urdfXml);
        }
      } catch (error) {
        console.error('Failed to fetch robot model:', error);
        if (!cancelled) {
          message.error(t('model.fetchFailed', { msg: error instanceof Error ? error.message : String(error) }));
        }
      }
    }

    fetchModel();

    return () => { cancelled = true; };
  }, [isConnected, host, port, t]);

  return { urdfContent, handleDisconnect, handleTakeover, controlOwnerName, controlOwnerIp };
}
