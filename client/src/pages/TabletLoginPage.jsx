import { GoogleLogin } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth.jsx";
import AdminStatus from "../components/AdminStatus.jsx";
import { getRestaurants } from "../api.js";
import LegalFooter from "../components/LegalFooter.jsx";

export default function TabletLoginPage() {
  const navigate = useNavigate();
  const { currentUser, loading, login } = useAuth();
  const [restaurants, setRestaurants] = useState([]);
  const [isLoadingRestaurants, setIsLoadingRestaurants] = useState(false);
  const [error, setError] = useState("");
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  async function loadRestaurantsForAdmin() {
    try {
      setIsLoadingRestaurants(true);
      setError("");
      const data = await getRestaurants();
      setRestaurants(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingRestaurants(false);
    }
  }

  useEffect(() => {
    if (currentUser?.role === "PLATFORM_ADMIN") {
      loadRestaurantsForAdmin();
    }
  }, [currentUser?.role]);

  if (loading) {
    return <AdminStatus title="Checking tablet session..." />;
  }

  if (currentUser?.role === "RESTAURANT_USER") {
    return <Navigate to={`/tablet/restaurants/${currentUser.restaurantId}/live-orders`} replace />;
  }

  if (currentUser?.role === "PLATFORM_ADMIN") {
    return (
      <>
        <main className="admin-login-page">
          <section className="admin-login-card admin-login-card-wide">
            <p className="eyebrow">Restaurant Tablet</p>
            <h1>Choose Restaurant</h1>
            <p>Open a restaurant order dashboard. This screen is only for accepting, printing, and completing orders.</p>

            {error && <p className="login-error">{error}</p>}

            {isLoadingRestaurants ? (
              <p className="empty-message">Loading restaurants...</p>
            ) : restaurants.length === 0 ? (
              <p className="empty-message">No restaurants yet. Create one from the platform admin first.</p>
            ) : (
              <div className="tablet-restaurant-list">
                {restaurants.map((restaurant) => (
                  <Link
                    className="tablet-restaurant-card"
                    key={restaurant.id}
                    to={`/admin/restaurants/${restaurant.id}/live-orders`}
                  >
                    <span>{restaurant.name}</span>
                    <small>/{restaurant.slug}</small>
                  </Link>
                ))}
              </div>
            )}

            <Link className="secondary-login-link" to="/admin">Go to platform admin</Link>
          </section>
        </main>
        <LegalFooter variant="login" />
      </>
    );
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
        await loadRestaurantsForAdmin();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
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
      <LegalFooter variant="login" />
    </>
  );
}
