import { useEffect, useState } from 'react';
import { Avatar, Select } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useT } from '@/i18n/useT';

/** Local default identity; controller credentials and ownership are separate. */
const users = [{ id: 'admin', name: 'admin', role: 'teach.administrator' }] as const;

function HeaderClock() {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return <time className="teach-header-clock" dateTime={now.toISOString()} aria-label={`${t('teach.currentTime')}: ${date} ${time}`}>
    <strong>{time}</strong>
    <small>{date}</small>
  </time>;
}

export function HeaderAccount() {
  const t = useT();
  const [userId, setUserId] = useState('admin');
  return <div className="teach-header-account">
    <Select
      className="teach-user-select"
      aria-label={t('teach.currentUser')}
      value={userId}
      onChange={setUserId}
      showSearch={false}
      options={users.map((user) => ({
        value: user.id,
        label: <span className="teach-user-option">
          <Avatar size={32} icon={<UserOutlined aria-hidden="true" />} />
          <span className="teach-user-details"><strong>{user.name}</strong><small>{t('teach.userPermission')}: {t(user.role)}</small></span>
        </span>,
      }))}
    />
    <HeaderClock />
  </div>;
}
