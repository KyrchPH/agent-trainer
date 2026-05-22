import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Chat from './pages/Chat';
import List from './pages/List';
import AdminConfig from './pages/AdminConfig';
import NamePrompt from './components/NamePrompt';
import AuroraBackground from './components/AuroraBackground';
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
    </nav>
  );
}

function Header() {
  const { name, clearName } = useUserName();
  return (
    <header className="relative z-10 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-medium">WiseAI</h1>
        {name && (
          <span className="text-xs text-chat-muted inline-flex items-center gap-1.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z" />
            </svg>
            {name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Nav />
        {name && (
          <button
            onClick={clearName}
            className="text-chat-muted hover:text-chat-text p-1 rounded-md transition"
            aria-label="Log out"
            title="Log out"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z"
                clipRule="evenodd"
              />
            </svg>
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
    <div className="relative h-screen bg-chat-bg text-chat-text flex flex-col overflow-hidden">
      <AuroraBackground variant="subtle" />
      <Header />
      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/list" element={<List />} />
          <Route path="/admin-config" element={<AdminConfig />} />
        </Routes>
      </div>
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
