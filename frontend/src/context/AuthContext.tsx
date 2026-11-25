import React, { createContext, useContext, useEffect, useState } from "react";
import { apiFetch, getAuthToken, setAuthToken } from "../lib/api";

export type UserRole = "employee" | "supervisor" | "hr_admin" | "it_admin";

export interface CurrentUser {
  id: string;
  nik: string;
  fullName: string;
  email: string;
  role: UserRole;
  department?: string;
  position?: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch<{ user: Record<string, string> }>("/auth/me")
      .then((res) => {
        const u = res.user;
        setUser({
          id: u.id,
          nik: u.nik,
          fullName: u.full_name,
          email: u.email,
          role: u.role as UserRole,
          department: u.department,
          position: u.position,
        });
      })
      .catch(() => {
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await apiFetch<{ token: string; user: CurrentUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(res.token);
    setUser(res.user);
  }

  function logout() {
    setAuthToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus digunakan di dalam AuthProvider");
  return ctx;
}
