import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentAdminUser, loginWithGoogle, logoutAdminUser } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function checkSession() {
    try {
      setLoading(true);
      const data = await getCurrentAdminUser();
      setCurrentUser(data.user || null);
    } catch {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(credential) {
    const data = await loginWithGoogle(credential);
    setCurrentUser(data.user);
    return data.user;
  }

  async function logout() {
    await logoutAdminUser();
    setCurrentUser(null);
  }

  useEffect(() => {
    checkSession();
  }, []);

  const value = useMemo(() => ({
    currentUser,
    loading,
    login,
    logout,
    checkSession
  }), [currentUser, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
