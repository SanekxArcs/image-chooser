import { useCallback, useEffect, useState } from 'react';

import { apiSession } from './api';
import SettingsSheet from './components/SettingsSheet';
import SetupScreen from './components/SetupScreen';
import ViewerScreen from './components/ViewerScreen';

type Screen = 'boot' | 'setup' | 'viewer';

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);

  // Resume the last session if its folder still exists.
  useEffect(() => {
    let cancelled = false;
    apiSession()
      .then(data => { if (!cancelled) setScreen(data.active ? 'viewer' : 'setup'); })
      .catch(() => { if (!cancelled) setScreen('setup'); });
    return () => { cancelled = true; };
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsVersion(v => v + 1);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app">
      {screen === 'viewer' && (
        <ViewerScreen
          settingsVersion={settingsVersion}
          blocked={settingsOpen}
          onChooseAnother={() => setScreen('setup')}
          onOpenSettings={openSettings}
        />
      )}
      {screen === 'setup' && (
        <SetupScreen onFolderSelected={() => setScreen('viewer')} onOpenSettings={openSettings} />
      )}
      {settingsOpen && <SettingsSheet onClose={closeSettings} />}
    </div>
  );
}
