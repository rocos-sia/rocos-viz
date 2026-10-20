import { useState, useCallback } from 'react';
import { Button, Space, message, Card } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ForwardOutlined,
} from '@ant-design/icons';
import { RobotApiClient } from '@/core/RobotApiClient';
import { useConnectionStore } from '@/stores/connectionStore';

const DEFAULT_SCRIPT = `-- ROCOS Lua 脚本示例
function main()
  log("开始执行脚本...")

  -- 获取当前关节角度
  local joints = getJointPositions()
  log("当前关节位置: " .. jointsToString(joints))

  -- 移动到目标位置
  local target = {0, -0.5, 0, -1.5, 0, 1.0, 0.8}
  moveJoint(target, 0.3)

  log("脚本执行完成")
end`;

export function ScriptEditor() {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [output, setOutput] = useState('准备就绪');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);

  const getClient = useCallback(() => new RobotApiClient(host, port), [host, port]);

  const handleRun = async () => {
    if (!script.trim()) {
      message.warning('脚本内容为空');
      return;
    }

    try {
      // 后端要求先上传再执行：upload(filename, source) → run()
      await getClient().uploadScript('script.lua', script);
      await getClient().runScript();
      setIsRunning(true);
      setIsPaused(false);
      setOutput((prev) => prev + '\n> 脚本已提交执行');
      message.success('脚本已提交执行');
    } catch (error) {
      message.error('执行失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleStop = async () => {
    try {
      await getClient().stopScript();
      setIsRunning(false);
      setIsPaused(false);
      setOutput((prev) => prev + '\n> 脚本已停止');
    } catch (error) {
      message.error('停止失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handlePause = async () => {
    try {
      await getClient().pauseScript();
      setIsPaused(true);
      setOutput((prev) => prev + '\n> 脚本已暂停');
    } catch (error) {
      message.error('暂停失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleContinue = async () => {
    try {
      await getClient().resumeScript();
      setIsPaused(false);
      setOutput((prev) => prev + '\n> 脚本已继续');
    } catch (error) {
      message.error('继续失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleRun}
            disabled={isRunning && !isPaused}
          >
            运行
          </Button>
          <Button
            icon={<PauseCircleOutlined />}
            onClick={handlePause}
            disabled={!isRunning || isPaused}
          >
            暂停
          </Button>
          <Button
            icon={<ForwardOutlined />}
            onClick={handleContinue}
            disabled={!isPaused}
          >
            继续
          </Button>
          <Button
            danger
            icon={<StopOutlined />}
            onClick={handleStop}
            disabled={!isRunning}
          >
            停止
          </Button>
        </Space>
      </div>

      <Card
        bodyStyle={{ padding: 0 }}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          style={{
            width: '100%',
            height: '100%',
            minHeight: 300,
            background: 'var(--color-bg-surface)',
            color: '#e0e0e0',
            border: 'none',
            padding: 12,
            fontFamily: 'AlibabaPuHuiTi',
            fontSize: 'var(--font-body)',
            resize: 'none',
            outline: 'none',
          }}
          placeholder="在此输入 Lua 脚本..."
          spellCheck={false}
        />
      </Card>

      <Card
        title="输出"
        size="small"
        bodyStyle={{ padding: 8 }}
        style={{ maxHeight: 150 }}
      >
        <pre
          style={{
            margin: 0,
            padding: 8,
            background: '#0a0a14',
            color: '#4ade80',
            fontSize: 'var(--font-caption)',
            fontFamily: 'AlibabaPuHuiTi',
            overflow: 'auto',
            maxHeight: 100,
            whiteSpace: 'pre-wrap',
          }}
        >
          {output}
        </pre>
      </Card>
    </div>
  );
}
