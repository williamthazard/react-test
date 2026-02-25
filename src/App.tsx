import { useState } from 'react';
import AccessCodeWall from './components/AccessCodeWall';
import TestPage from './components/TestPage';
import TestEditor from './components/TestEditor';
import { type TestDataPayload } from './data/questionsData';

type AuthState = { role: 'student' | 'editor'; code: string; payload: TestDataPayload | null } | null;

function App() {
  const [auth, setAuth] = useState<AuthState>(null);

  if (!auth) {
    return <AccessCodeWall onUnlock={(role, code, payload) => setAuth({ role, code, payload })} />;
  }

  return auth.role === 'editor'
    ? <TestEditor code={auth.code} initialPayload={auth.payload} />
    : <TestPage code={auth.code} initialPayload={auth.payload} />;
}

export default App;
