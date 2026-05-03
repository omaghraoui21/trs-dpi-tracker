import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetCurrentUser, useLogin, useLogout } from "@workspace/api-client-react";
import type { User, LoginBody } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (credentials: LoginBody) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("auth_token"));
  const [, setLocation] = useLocation();

  const { data: user, isLoading: isUserLoading, refetch } = useGetCurrentUser({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: ["auth", "me", token],
    }
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const login = async (credentials: LoginBody) => {
    const res = await loginMutation.mutateAsync({ data: credentials });
    if (res.token) {
      localStorage.setItem("auth_token", res.token);
      setToken(res.token);
      await refetch();
    }
  };

  const logoutFn = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      localStorage.removeItem("auth_token");
      setToken(null);
      setLocation("/login");
    }
  };

  useEffect(() => {
    if (!token && !isUserLoading) {
      // If we are definitely not logged in, remove token state
      setToken(null);
    }
  }, [token, isUserLoading]);

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        token,
        login,
        logout: logoutFn,
        isLoading: isUserLoading && !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
