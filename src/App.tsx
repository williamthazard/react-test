import { useState } from 'react';
import AccessCodeWall from './components/AccessCodeWall';
import TestPage from './components/TestPage';
import TestEditor from './components/TestEditor';

type AuthState = { role: 'student' | 'editor'; code: string; questions: any[] | null } | null;

function App() {
  const [auth, setAuth] = useState<AuthState>(null);

  if (!auth) {
    return <AccessCodeWall onUnlock={(role, code, questions) => setAuth({ role, code, questions })} />;
  }

  return auth.role === 'editor'
    ? <TestEditor code={auth.code} initialQuestions={auth.questions} />
    : <TestPage code={auth.code} initialQuestions={auth.questions} />;
}

export default App;
