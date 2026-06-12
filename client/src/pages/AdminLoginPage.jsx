import { GoogleLogin } from "@react-oauth/google";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth.jsx";
import AdminStatus from "../components/AdminStatus.jsx";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading, login } = useAuth();
  const [error, setError] = useState("");
  const redirectTo = location.state?.from?.pathname || "/admin";
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (loading) {
    return <AdminStatus title="Checking admin session..." />;
  }

  if (currentUser?.role === "PLATFORM_ADMIN") {
    return <Navigate to="/admin" replace />;
  }

  if (currentUser?.role === "RESTAURANT_USER") {
    return <Navigate to={`/tablet/restaurants/${currentUser.restaurantId}/live-orders`} replace />;
  }

  async function handleGoogleSuccess(response) {
    try {
      setError("");

      if (!response.credential) {
        setError("Google did not return a sign-in credential.");
        return;
      }

      const user = await login(response.credential);

      if (user.role !== "PLATFORM_ADMIN") {
        navigate(`/tablet/restaurants/${user.restaurantId}/live-orders`, {
          replace: true
        });
        return;
      }

      navigate(redirectTo, {
        replace: true
      });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <p className="eyebrow">Restaurant Platform</p>
        <h1>Admin Sign In</h1>
        <p>Use an approved Google account to manage restaurants, menus, and orders.</p>

        {googleClientId ? (
          <div className="google-login-shell">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Google sign-in failed. Please try again.")}
              useOneTap={false}
            />
          </div>
        ) : (
          <p className="login-error">Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID to client/.env.</p>
        )}

        {error && <p className="login-error">{error}</p>}
      </section>
    </main>
  );
}
