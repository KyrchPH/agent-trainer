import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Chat from './pages/Chat';
import List from './pages/List';
import AdminConfig from './pages/AdminConfig';
import NamePrompt from './components/NamePrompt';
import { UserNameProvider, useUserName } from './lib/userName';

function Nav() {
  const { pathname } = useLocation();
  const link = (to: string, label: string) => (
    <Link
      to={to}
      className={`px-3 py-1 rounded-md text-sm ${
        pathname === to ? 'bg-chat-panel text-chat-text' : 'text-chat-muted hover:text-chat-text'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex items-center gap-2">
      {link('/', 'Chat')}
      {link('/list', 'Q&A List')}
      {link('/admin-config', 'Admin')}
    </nav>
  );
}

function Header() {
  const { name, clearName } = useUserName();
  return (
    <header className="border-b border-chat-border px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-medium">Livestreamer AI Agent Trainer</h1>
        {name && <span className="text-xs text-chat-muted">· {name}</span>}
      </div>
      <div className="flex items-center gap-3">
        <Nav />
        {name && (
          <button
            onClick={clearName}
            className="text-xs text-chat-muted hover:text-chat-text"
            title="Forget your name"
          >
            Change name
          </button>
        )}
      </div>
    </header>
  );
}

function AppShell() {
  const { name } = useUserName();
  if (!name) return <NamePrompt />;
  return (
    <div className="min-h-screen bg-chat-bg text-chat-text flex flex-col">
      <Header />
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/list" element={<List />} />
        <Route path="/admin-config" element={<AdminConfig />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <UserNameProvider>
      <AppShell />
    </UserNameProvider>
  );
}
