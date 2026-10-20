import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useUIStore } from './stores/uiStore';
import './styles/global.css';
import { installTypographyTokens } from './styles/typography';

installTypographyTokens();

function Root() {
  const themeMode = useUIStore((s) => s.themeMode);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
