import type { ReactNode } from 'react';
import { useT } from '@/i18n/useT';

export function DemoBadge() {
  const t = useT();
  return <span className="teach-demo-badge">{t('teach.demo')}</span>;
}

export function TeachCard({ title, extra, children, className = '' }: {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <section className={`teach-card ${className}`}>
    <header className="teach-card-header"><h2>{title}</h2><div className="teach-card-extra">{extra}</div></header>
    <div className="teach-card-body">{children}</div>
  </section>;
}
