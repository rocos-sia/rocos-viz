import { diagnosticsOrigin } from './client';

export function diagnosticsAddress() {
  const fallback = `${location.protocol}//${location.hostname}:8082`;
  try {
    const saved = localStorage.getItem('rocos.dualarm.diagnostics');
    if (saved) return diagnosticsOrigin(saved);
  } catch { return fallback; }
  return fallback;
}
