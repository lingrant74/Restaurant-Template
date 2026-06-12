import { GoogleLogin } from "@react-oauth/google";
import { Navigate, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth.jsx";
import AdminStatus from "../components/AdminStatus.jsx";

export default function TabletLoginPage() {
  const navigate = useNavigate();
  const { currentUser, loading, login } = useAuth();
  const [error, setError] = useState("");
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (loading) {
    return <AdminStatus title="Checking tablet session..." />;
  }

  if (currentUser?.role === "RESTAURANT_USER") {
    return <Navigate to={`/tablet/restaurants/${currentUser.restaurantId}/live-orders`} replace />;
  }

  if (currentUser?.role === "PLATFORM_ADMIN") {
    return <Navigate to="/admin" replace />;
  }

  async function handleGoogleSuccess(response) {
    try {
      setError("");

      if (!response.credential) {
        setError("Google did not return a sign-in credential.");
        return;
      }

      const user = await login(response.credential);

      if (user.role === "RESTAURANT_USER") {
        navigate(`/tablet/restaurants/${user.restaurantId}/live-orders`, {
          replace: true
        });
        return;
      }

      if (user.role === "PLATFORM_ADMIN") {
        navigate("/admin", {
          replace: true
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <p className="eyebrow">Restaurant Tablet</p>
        <h1>Staff Login</h1>
        <p>Use your approved restaurant Google account to open the live orders screen.</p>

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
