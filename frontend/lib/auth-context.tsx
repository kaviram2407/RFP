"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  UserResponse,
  getToken,
  removeToken,
  loginApi,
  getCurrentUserApi,
  ApiError,
} from "./api-client";

interface AuthContextType {
  user: UserResponse | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<UserResponse>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentUser = async () => {
    const existingToken = getToken();
    if (!existingToken) {
      setUser(null);
      setTokenState(null);
      setLoading(false);
      return;
    }

    setTokenState(existingToken);
    try {
      const currentUser = await getCurrentUserApi();
      setUser(currentUser);
      setError(null);
    } catch (err: any) {
      console.error("Auth initialization failed:", err);
      setUser(null);
      setTokenState(null);
      removeToken();
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.detail);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = async (username: string, password: string): Promise<UserResponse> => {
    setLoading(true);
    setError(null);
    try {
      const tokenResponse = await loginApi(username, password);
      setTokenState(tokenResponse.access_token);
      const currentUser = await getCurrentUserApi();
      setUser(currentUser);
      setLoading(false);
      return currentUser;
    } catch (err: any) {
      setLoading(false);
      const errorMessage = err instanceof ApiError ? err.detail : "Login failed";
      setError(errorMessage);
      throw err;
    }
  };

  const logout = () => {
    removeToken();
    setUser(null);
    setTokenState(null);
    setError(null);
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        logout,
        refreshUser: fetchCurrentUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
