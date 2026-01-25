'use client';

import { createContext, useContext, ReactNode } from 'react';

interface AuthConfig {
  authEnabled: boolean;
  baseUrl: string | null;
}

const AuthConfigContext = createContext<AuthConfig>({
  authEnabled: false,
  baseUrl: null,
});

export function AuthConfigProvider({
  children,
  authEnabled,
  baseUrl,
}: {
  children: ReactNode;
  authEnabled: boolean;
  baseUrl: string | null;
}) {
  return (
    <AuthConfigContext.Provider value={{ authEnabled, baseUrl }}>
      {children}
    </AuthConfigContext.Provider>
  );
}

export function useAuthConfig() {
  return useContext(AuthConfigContext);
}
