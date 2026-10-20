import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { SwapOutlined, SyncOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useT } from '@/i18n/useT';

/** Translation and rotation are separate axis groups in the selected reference frame. */
export function CartesianJogLayout({ renderAxis }: { renderAxis: (index: number) => ReactNode }) {
  const t = useT();
  return <div className="teach-cartesian-layout">
    <div className="teach-cartesian-axes">
      <section><h3><SwapOutlined aria-hidden="true" />{t('teach.translation')}</h3>
        {[0, 1, 2].map(renderAxis)}
      </section>
      <section><h3><SyncOutlined aria-hidden="true" />{t('teach.rotation')}<Tooltip title={t('teach.cartesianGuide')}><span className="teach-jog-guide-icon" tabIndex={0} aria-label={t('teach.cartesianGuide')}><InfoCircleOutlined /></span></Tooltip></h3>
        {[3, 4, 5].map(renderAxis)}
      </section>
    </div>
  </div>;
}
