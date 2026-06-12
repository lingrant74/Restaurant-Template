import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import AdminStatus from "./AdminStatus.jsx";

export default function ProtectedAdminRoute({ children }) {
  const location = useLocation();
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <AdminStatus title="Checking admin session..." />;
  }

  if (!currentUser) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (currentUser.role === "RESTAURANT_USER") {
    return <Navigate to={`/tablet/restaurants/${currentUser.restaurantId}/live-orders`} replace />;
  }

  if (currentUser.role !== "PLATFORM_ADMIN") {
    return <AdminStatus title="Platform admin access required." />;
  }

  return children;
}
