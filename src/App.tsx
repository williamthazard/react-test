import { useState } from 'react';
import AccessCodeWall from './components/AccessCodeWall';
import TestPage from './components/TestPage';
import TestEditor from './components/TestEditor';

type Role = 'student' | 'editor' | null;

function App() {
  const [role, setRole] = useState<Role>(null);

  if (!role) {
    return <AccessCodeWall onUnlock={(r: 'student' | 'editor') => setRole(r)} />;
  }

  return role === 'editor' ? <TestEditor /> : <TestPage />;
}

export default App;
