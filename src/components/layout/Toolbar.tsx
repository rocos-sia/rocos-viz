import { useConnectionStore } from '@/stores/connectionStore';

interface ToolbarProps {
  onShowConnect: () => void;
  onShowAbout: () => void;
}

export function Toolbar({ onShowConnect, onShowAbout }: ToolbarProps) {
  const isConnected = useConnectionStore((s) => s.isConnected);

  return (
    <div className="app-toolbar">
      <img className="logo" src="/icons/rocos-viz.png" alt="ROCOS HMI" />
      <button
        onClick={onShowConnect}
        style={{
          background: isConnected ? 'var(--color-primary, #3b82f6)' : 'transparent',
          color: 'var(--color-text)',
          border: '1px solid var(--color-primary, #3b82f6)',
          borderRadius: 4,
          padding: '4px 12px',
          cursor: 'pointer',
          fontSize: 'var(--font-body)',
        }}
      >
        {isConnected ? '● Connected' : '○ Connect'}
      </button>
      <div style={{ flex: 1 }} />
      <button
        onClick={onShowAbout}
        style={{
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 'var(--font-caption)',
        }}
      >
        About
      </button>
    </div>
  );
}
