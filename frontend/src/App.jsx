import { useEffect, useState } from 'react';
import { api, setCurrentUser } from './api.js';
import Dashboard from './Dashboard.jsx';
import InspectionList from './InspectionList.jsx';
import NewInspection from './NewInspection.jsx';

const ROLE_LABEL = {
  quality_engineer: 'Quality Engineer',
  production_supervisor: 'Production Supervisor',
};

export default function App() {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState(null);
  const [tab, setTab] = useState('inspections');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .users()
      .then((list) => {
        setUsers(list);
        if (list[0]) switchUser(list[0].id, list);
      })
      .catch((err) => setError(err.message));
  }, []);

  function switchUser(id, list = users) {
    setCurrentUser(id);
    setUserId(id);
    const next = list.find((u) => u.id === id);
    setTab(next?.role === 'quality_engineer' ? 'log' : 'inspections');
  }

  const user = users.find((u) => u.id === userId);
  const canLog = user?.role === 'quality_engineer';
  const tabs = [
    ...(canLog ? [{ id: 'log', label: 'Log inspection' }] : []),
    { id: 'inspections', label: 'Inspections' },
    { id: 'dashboard', label: 'Dashboard' },
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Inspection log</h1>
        <label className="who">
          Acting as
          <select value={userId ?? ''} onChange={(e) => switchUser(Number(e.target.value))}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({ROLE_LABEL[u.role]})
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="tabs" aria-label="Sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'tab active' : 'tab'}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {error && <p className="notice error">{error}</p>}
        {user && tab === 'log' && canLog && <NewInspection onSaved={() => setTab('inspections')} />}
        {user && tab === 'inspections' && <InspectionList key={userId} />}
        {user && tab === 'dashboard' && <Dashboard key={userId} />}
      </main>
    </div>
  );
}
