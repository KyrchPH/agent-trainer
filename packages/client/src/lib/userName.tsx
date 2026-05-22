import { createContext, useContext, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'agent_trainer_user_name';

interface UserNameContextValue {
  name: string | null;
  setName: (name: string) => void;
  clearName: () => void;
}

const UserNameContext = createContext<UserNameContextValue | null>(null);

export function UserNameProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const value: UserNameContextValue = {
    name,
    setName: (next: string) => {
      const trimmed = next.trim();
      if (!trimmed) return;
      window.localStorage.setItem(STORAGE_KEY, trimmed);
      setNameState(trimmed);
    },
    clearName: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      setNameState(null);
    }
  };

  return <UserNameContext.Provider value={value}>{children}</UserNameContext.Provider>;
}

export function useUserName(): UserNameContextValue {
  const ctx = useContext(UserNameContext);
  if (!ctx) throw new Error('useUserName must be used within UserNameProvider');
  return ctx;
}
