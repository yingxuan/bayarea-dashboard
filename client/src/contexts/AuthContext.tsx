/**
 * Authentication Context
 * Manages user authentication state across the app
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { config } from "@/config";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; error?: string; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status on mount
  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/auth/me`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("[AuthContext] Failed to check auth:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setUser(data.user);
          return { success: true };
        } else {
          return { success: false, error: data.error || "登录失败" };
        }
      } catch (error) {
        console.error("[AuthContext] Login error:", error);
        return { success: false, error: "网络错误，请稍后重试" };
      }
    },
    []
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ email, password, displayName }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setUser(data.user);
          return { success: true };
        } else {
          return { success: false, error: data.error || "注册失败" };
        }
      } catch (error) {
        console.error("[AuthContext] Register error:", error);
        return { success: false, error: "网络错误，请稍后重试" };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${config.apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("[AuthContext] Logout error:", error);
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);

  const forgotPassword = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string; message?: string }> => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          return { success: true, message: data.message };
        }
        return { success: false, error: data.error || "操作失败" };
      } catch (error) {
        console.error("[AuthContext] Forgot password error:", error);
        return { success: false, error: "网络错误，请稍后重试" };
      }
    },
    []
  );

  const resetPassword = useCallback(
    async (token: string, password: string): Promise<{ success: boolean; error?: string; message?: string }> => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, password }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          return { success: true, message: data.message };
        }
        return { success: false, error: data.error || "密码重置失败" };
      } catch (error) {
        console.error("[AuthContext] Reset password error:", error);
        return { success: false, error: "网络错误，请稍后重试" };
      }
    },
    []
  );

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
      forgotPassword,
      resetPassword,
    }),
    [user, isLoading, login, register, logout, refreshUser, forgotPassword, resetPassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
