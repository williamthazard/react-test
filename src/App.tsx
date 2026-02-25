import { useState } from 'react';
import AccessCodeWall from './components/AccessCodeWall';
import TestPage from './components/TestPage';
import TestEditor from './components/TestEditor';

type AuthState = { role: 'student' | 'editor'; code: string } | null;

function App() {
  const [auth, setAuth] = useState<AuthState>(null);

  if (!auth) {
    return <AccessCodeWall onUnlock={(role, code) => setAuth({ role, code })} />;
  }

  return auth.role === 'editor'
    ? <TestEditor code={auth.code} />
    : <TestPage code={auth.code} />;
}

export default App;
