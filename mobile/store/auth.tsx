import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  clearStoredAuth,
  getStoredToken,
  getStoredUser,
  storeToken,
  storeUser,
  type StoredUser,
} from "@/lib/api";

interface AuthContextType {
  user: StoredUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (token: string, user: StoredUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([getStoredToken(), getStoredUser()]);
        if (t && u) {
          setToken(t);
          setUser(u);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (t: string, u: StoredUser) => {
    await Promise.all([storeToken(t), storeUser(u)]);
    setToken(t);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await clearStoredAuth();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
