/**
 * AuthContext — global auth state with expo-secure-store token persistence
 */

import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { apiSignup, apiLogin, apiGetMe, AuthUser } from '../services/authApi';

// ---------------------------------------------------------------------------
// Secure token storage (expo-secure-store on native, AsyncStorage on web)
// ---------------------------------------------------------------------------

let SecureStore: typeof import('expo-secure-store') | null = null;

async function loadSecureStore() {
  if (Platform.OS !== 'web') {
    try {
      SecureStore = await import('expo-secure-store');
    } catch {
      // fallback to AsyncStorage below
    }
  }
}

async function saveToken(token: string): Promise<void> {
  if (SecureStore && Platform.OS !== 'web') {
    await SecureStore.setItemAsync('auth_token', token);
  } else {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('auth_token', token);
  }
}

async function getToken(): Promise<string | null> {
  if (SecureStore && Platform.OS !== 'web') {
    return SecureStore.getItemAsync('auth_token');
  } else {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return AsyncStorage.getItem('auth_token');
  }
}

async function deleteToken(): Promise<void> {
  if (SecureStore && Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync('auth_token');
  } else {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem('auth_token');
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      await loadSecureStore();
      try {
        const savedToken = await getToken();
        if (savedToken) {
          const profile = await apiGetMe(savedToken);
          setUser(profile);
          setToken(savedToken);
        }
      } catch (e) {
        // Token expired or invalid — clear it
        await deleteToken().catch(() => {});
      }
      setIsLoading(false);
    })();
  }, []);

  const handleLogin = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    await saveToken(result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const handleSignup = useCallback(async (email: string, password: string, name?: string) => {
    const result = await apiSignup(email, password, name);
    await saveToken(result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const handleLogout = useCallback(async () => {
    await deleteToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login: handleLogin,
        signup: handleSignup,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
