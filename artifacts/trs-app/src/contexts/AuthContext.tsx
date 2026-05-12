import React, { createContext, useContext } from "react";
import { useGetCurrentUser, useLogin, useLogout } from "@workspace/api-client-react";
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

  const { data: user, isLoading: isUserLoading, refetch } = useGetCurrentUser({
    query: {
      retry: false,
      queryKey: ["auth", "me"],
    }
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const login = async (credentials: LoginBody) => {
    await loginMutation.mutateAsync({ data: credentials });
    await refetch();
  };

  const logoutFn = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
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
