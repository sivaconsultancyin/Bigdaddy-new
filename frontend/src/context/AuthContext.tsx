import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Wallet, AppConfigInfo } from '../../../shared/src/types';
import { ApiClient } from '../api/client';
import { walletService } from '../services/supabaseWallet';

interface AuthContextType {
  user: User | null;
  wallet: Wallet | null;
  configInfo: AppConfigInfo | null;
  configError: string | null;
  authError: string | null;
  loading: boolean;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshWallet: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isInvalidSessionError(message: string) {
  return /AUTH_REQUIRED|INVALID_TOKEN|USER_NOT_FOUND_OR_DISABLED|Missing or invalid|Expired or invalid|User does not exist|Authentication required/i.test(message);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [configInfo, setConfigInfo] = useState<AppConfigInfo | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const refreshWallet = useCallback(async () => {
    const activeUser = userRef.current ?? ApiClient.getCurrentSessionUser();
    if (!activeUser) return;
    try {
      const data = await ApiClient.getMyWallet();
      if (data?.wallet) setWallet(data.wallet);
    } catch (err: any) {
      const message = err?.message || '';
      if (isInvalidSessionError(message)) {
        ApiClient.clearToken();
        setUser(null);
        setWallet(null);
        setAuthError('Your session has expired. Please sign in again.');
        return;
      }
      console.warn('Could not refresh Supabase wallet:', message);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = ApiClient.getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await ApiClient.getMe();
      if (!data?.user?.id) {
        throw new Error('The session response was incomplete. Please sign in again.');
      }
      ApiClient.setCurrentSessionUser(data.user);
      setUser(data.user);
      setWallet(data.wallet ?? null);
      setAuthError(null);
    } catch (err: any) {
      const message = err?.message || 'Could not verify your session. Please try again.';
      if (message.includes('PRODUCTION_CONFIGURATION_ERROR')) setConfigError(message);

      if (isInvalidSessionError(message)) {
        ApiClient.clearToken();
        setUser(null);
        setWallet(null);
        setAuthError('Your session has expired. Please sign in again.');
      } else {
        setAuthError(`Could not verify your session: ${message}`);
        console.warn('Session verification failed; keeping token for retry:', message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        const cfg = await ApiClient.getConfig();
        setConfigInfo(cfg);
      } catch (err: any) {
        if (err.message?.includes('PRODUCTION_CONFIGURATION_ERROR')) setConfigError(err.message);
      }
      const token = ApiClient.getToken();
      if (token) {
        await refreshUser();
      } else {
        setLoading(false);
      }
    };
    void initialize();
  }, [refreshUser]);

  // Live subscription to Supabase WalletService updates (instant UI sync when APK game engines settle bets)
  useEffect(() => {
    const unsub = walletService.subscribe((event) => {
      const active = userRef.current;
      if (!active) return;
      if (!event.userId || event.userId === active.id) {
        void refreshWallet();
      }
    });
    return unsub;
  }, [refreshWallet]);

  const login = async (credentials: { username: string; password: string }) => {
    setAuthError(null);
    try {
      const data = await ApiClient.login(credentials);
      if (!data?.token || !data?.user?.id) {
        throw new Error('Login response was incomplete. Please try again.');
      }
      ApiClient.setToken(data.token);
      ApiClient.setCurrentSessionUser(data.user);
      setUser(data.user);
      setWallet(data.wallet ?? null);
    } catch (err: any) {
      if (err.message?.includes('PRODUCTION_CONFIGURATION_ERROR')) {
        setConfigError(err.message);
      }
      throw err;
    }
  };

  const logout = () => {
    ApiClient.clearToken();
    setUser(null);
    setWallet(null);
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        wallet,
        configInfo,
        configError,
        authError,
        loading,
        login,
        logout,
        refreshWallet,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
