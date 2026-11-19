import React from 'react';
import Scene from './Scene';
import { modelFile } from './profile';
import { useT } from '../../../src/i18n/useT';

export default function ModelResources({ live, model, arms, selected, chains }) {
  const t = useT();
  const meshes = ['base_link', ...['Left', 'Right'].flatMap(side => Array.from({ length: 7 }, (_, index) => `${side}_Link${index + 1}`))];
  return <div className="model-grid">
    {(!live || model) && <Scene model={model} arms={arms} selected={selected}/>}
    <section className="settings-panel"><div className="panel-title"><h2>{t('dual.modelSource')}</h2></div>
      <dl><dt>URDF</dt><dd>{live ? model?.revision || '—' : modelFile}</dd><dt>{t('dual.left')}</dt><dd>{chains.left.base} → {chains.left.tip}</dd><dt>{t('dual.right')}</dt><dd>{chains.right.base} → {chains.right.tip}</dd><dt>Meshes / joints</dt><dd>15 / 14</dd></dl>
      {(!live || model) && <a className="button primary" href={live ? model.urdf_url : `./model/urdf/${modelFile}`} download={modelFile}>{t('dual.download')}</a>}
      <p className="muted small">{t('dual.modelDownloadHint')}</p>
      <details><summary>{t('dual.modelMeshes')}</summary><div className="mesh-links">{meshes.map(name => <a key={name} href={live ? `${model?.mesh_url}?path=${encodeURIComponent(`../meshes/${name}.STL`)}` : `./model/meshes/${name}.STL`} download>{name}.STL</a>)}</div></details>
    </section>
  </div>;
}
