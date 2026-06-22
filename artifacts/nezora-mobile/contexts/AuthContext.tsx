import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

const SERVER_KEY = "cloudos_server_url";
const TOKEN_KEY = "cloudos_admin_token";

interface AuthContextType {
  serverUrl: string;
  token: string;
  isConfigured: boolean;
  isLoading: boolean;
  setCredentials: (url: string, token: string) => Promise<void>;
  clearCredentials: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  serverUrl: "",
  token: "",
  isConfigured: false,
  isLoading: true,
  setCredentials: async () => {},
  clearCredentials: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [url, tok] = await Promise.all([
          AsyncStorage.getItem(SERVER_KEY),
          AsyncStorage.getItem(TOKEN_KEY),
        ]);
        if (url) setServerUrl(url);
        if (tok) setToken(tok);
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const setCredentials = async (url: string, tok: string) => {
    const clean = url.replace(/\/$/, "");
    await Promise.all([
      AsyncStorage.setItem(SERVER_KEY, clean),
      AsyncStorage.setItem(TOKEN_KEY, tok),
    ]);
    setServerUrl(clean);
    setToken(tok);
  };

  const clearCredentials = async () => {
    await Promise.all([
      AsyncStorage.removeItem(SERVER_KEY),
      AsyncStorage.removeItem(TOKEN_KEY),
    ]);
    setServerUrl("");
    setToken("");
  };

  return (
    <AuthContext.Provider
      value={{
        serverUrl,
        token,
        isConfigured: !!(serverUrl && token),
        isLoading,
        setCredentials,
        clearCredentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
