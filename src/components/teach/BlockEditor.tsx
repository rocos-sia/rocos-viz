import { useEffect, useRef, useState } from 'react';
import { Alert, Button, message } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as zh from 'blockly/msg/zh-hans';
import * as en from 'blockly/msg/en';
import { luaGenerator } from 'blockly/lua';
import { z } from 'zod';
import { useUIStore } from '@/stores/uiStore';
import { useTeachStore } from '@/stores/teachStore';
import { useT } from '@/i18n/useT';
import { downloadText } from '@/core/downloadText';

const projectSchema = z.object({ schemaVersion: z.literal(1), workspace: z.record(z.string(), z.unknown()) });

export function BlockEditor() {
  const t = useT();
  const language = useUIStore((s) => s.language);
  const root = useRef<HTMLDivElement>(null);
  const workspace = useRef<Blockly.WorkspaceSvg>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [generated, setGenerated] = useState('');
  useEffect(() => {
    if (!root.current) return;
    Blockly.setLocale(Object.fromEntries(Object.entries(language === 'zh' ? zh : en).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
    Blockly.common.defineBlocksWithJsonArray([
      { type: 'teach_move', message0: `${t('teach.block.move')} %1`, args0: [{ type: 'field_input', name: 'POINT', text: 'P001' }], previousStatement: null, nextStatement: null, colour: '#2563eb' },
      { type: 'teach_wait', message0: `${t('teach.block.wait')} %1`, args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0, max: 60 }], previousStatement: null, nextStatement: null, colour: '#476581' },
      { type: 'teach_output', message0: `${t('teach.block.io')} DO %1`, args0: [{ type: 'field_number', name: 'INDEX', value: 0, min: 0, max: 7 }], previousStatement: null, nextStatement: null, colour: '#3b8791' },
    ]);
    luaGenerator.forBlock.teach_move = (block) => `-- Preview move: ${String(block.getFieldValue('POINT')).replace(/[\r\n]/g, ' ')}\n`;
    luaGenerator.forBlock.teach_wait = (block) => `-- Preview wait: ${Number(block.getFieldValue('SECONDS'))} s\n`;
    luaGenerator.forBlock.teach_output = (block) => `-- Preview output: DO ${Number(block.getFieldValue('INDEX'))}\n`;
    const theme = Blockly.Theme.defineTheme('rocos', { name: 'rocos', base: Blockly.Themes.Classic, fontStyle: { family: 'AlibabaPuHuiTi', size: 14, weight: '500' } });
    const instance = Blockly.inject(root.current, {
      theme, renderer: 'zelos', trashcan: true,
      zoom: { controls: true, wheel: false, startScale: 0.95 },
      toolbox: { kind: 'categoryToolbox', contents: [
        { kind: 'category', name: t('teach.block.motion'), colour: '#2563eb', contents: ['teach_move', 'teach_wait', 'teach_output'].map((type) => ({ kind: 'block', type })) },
        { kind: 'category', name: t('teach.block.logic'), colour: '#5874a8', contents: ['controls_if', 'logic_compare', 'logic_boolean'].map((type) => ({ kind: 'block', type })) },
        { kind: 'category', name: t('teach.block.loops'), colour: '#459182', contents: [{ kind: 'block', type: 'controls_repeat_ext' }] },
        { kind: 'category', name: t('teach.block.math'), colour: '#6678a4', contents: [{ kind: 'block', type: 'math_number' }] },
      ] },
      grid: { spacing: 24, length: 1, colour: '#dbe3ef', snap: true },
    });
    workspace.current = instance;
    try {
      const saved = useTeachStore.getState().workspace;
      if (saved) Blockly.serialization.workspaces.load(JSON.parse(saved), instance);
      else Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
        { type: 'teach_move', x: 50, y: 50, fields: { POINT: 'P002' }, next: { block: { type: 'teach_wait', fields: { SECONDS: 1 }, next: { block: { type: 'teach_output', fields: { INDEX: 1 } } } } } },
      ] } }, instance);
    } catch { message.warning(t('teach.invalidProject')); }
    const update = () => {
      setGenerated('-- PREVIEW ONLY: robot API mapping is not implemented.\n' + luaGenerator.workspaceToCode(instance));
      useTeachStore.getState().setWorkspace(JSON.stringify(Blockly.serialization.workspaces.save(instance)));
    };
    update();
    instance.addChangeListener(update);
    const observer = new ResizeObserver(() => Blockly.svgResize(instance));
    observer.observe(root.current);
    return () => { observer.disconnect(); instance.removeChangeListener(update); instance.dispose(); workspace.current = undefined; };
  }, [language, t]);
  const importFile = async (file?: File) => {
    if (!file || !workspace.current) return;
    try {
      if (file.size > 2_000_000) throw new Error('size');
      const project = projectSchema.parse(JSON.parse(await file.text()));
      Blockly.serialization.workspaces.load(project.workspace, workspace.current);
    } catch { message.error(t('teach.invalidProject')); }
    if (fileInput.current) fileInput.current.value = '';
  };
  return <>
    <Alert type="info" showIcon message={t('teach.blockHint')} />
    <div className="teach-button-row">
      <Button icon={<DownloadOutlined />} onClick={() => downloadText('rocos-project.json', JSON.stringify({ schemaVersion: 1, workspace: JSON.parse(useTeachStore.getState().workspace ?? '{}') }, null, 2), 'application/json')}>{t('teach.downloadProject')}</Button>
      <Button icon={<UploadOutlined />} onClick={() => fileInput.current?.click()}>{t('teach.importProject')}</Button>
      <input ref={fileInput} hidden type="file" accept=".json" onChange={(e) => void importFile(e.target.files?.[0])} />
      <Button onClick={() => downloadText('preview.lua', generated)}>{t('teach.download')} Lua</Button>
    </div>
    <div className="teach-block-layout"><div className="teach-block-editor" ref={root} /><div className="teach-generated"><h3>{t('teach.luaPreview')}</h3><pre>{generated}</pre></div></div>
  </>;
}
