import { useState, useRef } from 'react';
import { Button, Progress, message, Card, Upload } from 'antd';
import { DownloadOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useConnectionStore } from '@/stores/connectionStore';
import { useModelStore } from '@/stores/modelStore';
import { RobotApiClient } from '@/core/RobotApiClient';
import { parseUrdf } from '@/core/UrdfModelLoader';
import type { ModelDownloadProgress } from '@/core/ModelDownloader';

export function ModelLoaderPanel() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);

  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const setModel = useModelStore((s) => s.setModel);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Upload a local URDF file to the controller, then parse & render it. */
  const handleUpload = async (file: File) => {
    setLoading(true);
    setProgress({ total: 2, loaded: 0, currentFile: file.name });

    try {
      const client = new RobotApiClient(host, port);

      // 1. Upload the URDF to the controller
      const { path } = await client.uploadUrdf(file);
      console.log('[ModelLoaderPanel] URDF uploaded to:', path);
      setProgress({ total: 2, loaded: 1, currentFile: '正在获取 URDF...' });

      // 2. Fetch the URDF content back
      const urdfXml = await client.getUrdf();

      // 3. Cache the URDF text in IndexedDB
      await cacheUrdf(host, port, urdfXml);

      // 4. Parse & build the Three.js model
      setProgress({ total: 2, loaded: 1, currentFile: '正在解析模型...' });
      const { robot } = await parseUrdf(urdfXml, client.getMeshBaseUrl());

      setModel(robot, { name: path, links: [] });
      setProgress({ total: 2, loaded: 2, currentFile: file.name });
      message.success('URDF 模型加载完成');
    } catch (error) {
      message.error('加载失败: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  /** Load URDF already stored on the controller. */
  const handleLoadFromController = async () => {
    setLoading(true);
    setProgress({ total: 1, loaded: 0, currentFile: '获取 URDF...' });

    try {
      const client = new RobotApiClient(host, port);
      const urdfXml = await client.getUrdf();

      if (!urdfXml || !urdfXml.trim().startsWith('<')) {
        message.warning('控制器未返回有效的 URDF 文件');
        return;
      }

      await cacheUrdf(host, port, urdfXml);

      setProgress({ total: 2, loaded: 1, currentFile: '正在解析模型...' });
      const { robot } = await parseUrdf(urdfXml, client.getMeshBaseUrl());

      setModel(robot, { name: 'controller', links: [] });
      setProgress({ total: 2, loaded: 2, currentFile: '完成' });
      message.success('从控制器加载 URDF 模型完成');
    } catch (error) {
      message.error('加载失败: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  /** Clear all cached data (meshes + URDFs). */
  const handleClearCache = async () => {
    try {
      const db = await openCacheDB();
      await clearStore(db, 'meshes');
      await clearStore(db, 'urdfs');
      db.close();
      message.success('缓存已清除');
    } catch {
      message.error('清除缓存失败');
    }
  };

  const percent = progress && progress.total > 0
    ? Math.round((progress.loaded / progress.total) * 100)
    : 0;

  return (
    <div style={{ padding: 16 }}>
      <Card title="URDF 模型" size="small">
        <div style={{ marginBottom: 16 }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            上传本地 URDF 文件，或从控制器 {host}:{port} 加载已有模型
          </p>

          <Upload
            accept=".urdf,.xacro,.URDF"
            showUploadList={false}
            customRequest={({ file }) => handleUpload(file as File)}
          >
            <Button
              icon={<UploadOutlined />}
              loading={loading}
              style={{ marginRight: 8 }}
            >
              上传 URDF
            </Button>
          </Upload>

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleLoadFromController}
            loading={loading}
            style={{ marginRight: 8 }}
          >
            从控制器加载
          </Button>

          <Button
            icon={<DeleteOutlined />}
            onClick={handleClearCache}
          >
            清除缓存
          </Button>
        </div>

        {loading && progress && (
          <div>
            <Progress percent={percent} size="small" />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-caption)', marginTop: 8 }}>
              {progress.loaded}/{progress.total} — {progress.currentFile}
            </p>
          </div>
        )}
      </Card>

      {/* Hidden file input for drag-and-drop backup */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".urdf,.xacro,.URDF"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
    </div>
  );
}

// ── IndexedDB helpers (reuse existing DB name, add urdfs store) ──

const DB_NAME = 'rocos-model-cache';
const DB_VERSION = 2;

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meshes')) {
        db.createObjectStore('meshes', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('urdfs')) {
        db.createObjectStore('urdfs', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function clearStore(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch {
      // store may not exist
      resolve();
    }
  });
}

async function cacheUrdf(host: string, port: string, text: string): Promise<void> {
  try {
    const db = await openCacheDB();
    const tx = db.transaction('urdfs', 'readwrite');
    tx.objectStore('urdfs').put({
      key: `urdf_${host}:${port}`,
      text,
      timestamp: Date.now(),
    });
    tx.oncomplete = () => db.close();
  } catch {
    // Don't block on cache failures
  }
}
