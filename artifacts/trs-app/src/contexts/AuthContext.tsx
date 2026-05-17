import React, { createContext, useContext } from "react";
import { useGetCurrentUser, useLogout, customFetch } from "@workspace/api-client-react";
import type { User, LoginBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  login: (credentials: LoginBody) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading: isUserLoading,
    refetch,
  } = useGetCurrentUser({
    query: {
      retry: false,
      queryKey: ["auth", "me"],
      staleTime: 5 * 60 * 1000,
    },
  });

  const logoutMutation = useLogout();

  const login = async (credentials: LoginBody) => {
    const result = await customFetch<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    if (result.token) localStorage.setItem("auth_token", result.token);
    await refetch();
  };

  const logoutFn = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      localStorage.removeItem("auth_token");
      queryClient.setQueryData(["auth", "me"], null);
      setLocation("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        login,
        logout: logoutFn,
        isLoading: isUserLoading,
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
