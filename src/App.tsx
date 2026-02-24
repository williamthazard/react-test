import { useState } from 'react';
import AccessCodeWall from './components/AccessCodeWall';
import TestPage from './components/TestPage';

function App() {
  const [unlocked, setUnlocked] = useState(false);

  return unlocked ? <TestPage /> : <AccessCodeWall onUnlock={() => setUnlocked(true)} />;
}

export default App;
