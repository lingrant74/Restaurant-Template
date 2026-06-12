import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import AdminStatus from "./AdminStatus.jsx";

export default function ProtectedTabletRoute({ children }) {
  const { restaurantId } = useParams();
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <AdminStatus title="Checking tablet session..." />;
  }

  if (!currentUser) {
    return <Navigate to="/tablet/login" replace />;
  }

  if (currentUser.role === "PLATFORM_ADMIN") {
    return <Navigate to="/admin" replace />;
  }

  if (currentUser.role !== "RESTAURANT_USER") {
    return <AdminStatus title="Restaurant tablet access required." />;
  }

  if (Number(currentUser.restaurantId) !== Number(restaurantId)) {
    return <AdminStatus title="You do not have access to this restaurant tablet." />;
  }

  return children;
}
