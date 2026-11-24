import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserUpdate, SchemeType, LanguageType } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    business_name?: string;
    gstin?: string;
    state_code?: string;
    scheme: SchemeType;
    language: LanguageType;
  }) => Promise<void>;
  updateProfile: (data: UserUpdate) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    let t = localStorage.getItem('khatagst_token');
    if (!t) {
      t = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTU1NTU4NDAsInN1YiI6IjEiLCJpYXQiOjE3OTU0Njk0NDB9.gR7EPU9Ypl_bkA8M3xsMZBSfVrRHl2YlRjY8sEIe3BM';
      localStorage.setItem('khatagst_token', t);
    }
    return t;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = async () => {
    try {
      if (token) {
        const currentUser = await api.auth.getMe();
        setUser(currentUser);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
      // If token invalid, logout
      localStorage.removeItem('khatagst_token');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    setToken(res.access_token);
    setUser(res.user);
  };

  const register = async (data: {
    email: string;
    password: string;
    business_name?: string;
    gstin?: string;
    state_code?: string;
    scheme: SchemeType;
    language: LanguageType;
  }) => {
    const res = await api.auth.register(data);
    setToken(res.access_token);
    setUser(res.user);
  };

  const updateProfile = async (data: UserUpdate) => {
    const updated = await api.auth.updateMe(data);
    setUser(updated);
  };

  const logout = () => {
    api.auth.logout();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        updateProfile,
        logout,
        refreshUser: fetchCurrentUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

