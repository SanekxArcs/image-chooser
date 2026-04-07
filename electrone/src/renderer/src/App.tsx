import { useEffect, useState } from 'react';

import type { Stats } from './types';
import { apiSession } from './api';
import SetupScreen from './components/SetupScreen';
import ViewerScreen from './components/ViewerScreen';

type Screen = 'setup' | 'viewer';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [initialStats, setInitialStats] = useState<Stats>({ kept: 0, deleted: 0, later: 0 });
  const [startDone, setStartDone] = useState(false);

  // Session restore on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiSession();
        if (cancelled) return;
        if (!data.active) return;

        setInitialStats(data.stats ?? { kept: 0, deleted: 0, later: 0 });

        if (data.index !== undefined && data.total !== undefined && data.index >= data.total) {
          setStartDone(true);
        }
        setScreen('viewer');
      } catch {
        // No session — stay on setup
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleFolderSelected(_folder: string, stats: Stats, startDone: boolean) {
    setInitialStats(stats);
    setStartDone(startDone);
    setScreen('viewer');
  }

  function handleChooseAnother() {
    setScreen('setup');
    setInitialStats({ kept: 0, deleted: 0, later: 0 });
    setStartDone(false);
  }

  if (screen === 'viewer') {
    return (
      <ViewerScreen
        initialStats={initialStats}
        startDone={startDone}
        onChooseAnother={handleChooseAnother}
      />
    );
  }

  return (
    <SetupScreen
      onFolderSelected={handleFolderSelected}
    />
  );
}
