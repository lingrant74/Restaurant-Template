import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import CategoryDetailPage from "./pages/CategoryDetailPage.jsx";
import PublicRestaurantPage from "./pages/PublicRestaurantPage.jsx";
import CheckoutReturnPage from "./pages/CheckoutReturnPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import RestaurantDetailPage from "./pages/RestaurantDetailPage.jsx";
import ModifiersPage from "./pages/ModifiersPage.jsx";
import RestaurantsPage from "./pages/RestaurantsPage.jsx";
import LiveOrdersPage from "./pages/LiveOrdersPage.jsx";
import AdminLoginPage from "./pages/AdminLoginPage.jsx";
import RestaurantUsersPage from "./pages/RestaurantUsersPage.jsx";
import RestaurantPaymentsPage from "./pages/RestaurantPaymentsPage.jsx";
import TabletLoginPage from "./pages/TabletLoginPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import LegalPage from "./pages/LegalPage.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute.jsx";
import ProtectedTabletRoute from "./components/ProtectedTabletRoute.jsx";
import { AuthProvider } from "./auth.jsx";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function adminPage(page) {
  return (
    <ProtectedAdminRoute>
      {page}
    </ProtectedAdminRoute>
  );
}

function tabletPage(page) {
  return (
    <ProtectedTabletRoute>
      {page}
    </ProtectedTabletRoute>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/terms" element={<LegalPage type="terms" />} />
            <Route path="/privacy" element={<LegalPage type="privacy" />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/tablet/login" element={<TabletLoginPage />} />
            <Route path="/admin" element={adminPage(<RestaurantsPage />)} />
            <Route path="/admin/restaurants/:restaurantId" element={adminPage(<RestaurantDetailPage />)} />
            <Route path="/admin/restaurants/:restaurantId/orders" element={adminPage(<OrdersPage />)} />
            <Route path="/admin/restaurants/:restaurantId/live-orders" element={adminPage(<LiveOrdersPage />)} />
            <Route path="/admin/restaurants/:restaurantId/modifiers" element={adminPage(<ModifiersPage />)} />
            <Route path="/admin/restaurants/:restaurantId/users" element={adminPage(<RestaurantUsersPage />)} />
            <Route path="/admin/restaurants/:restaurantId/payments" element={adminPage(<RestaurantPaymentsPage />)} />
            <Route path="/admin/restaurants/:restaurantId/categories/:categoryId" element={adminPage(<CategoryDetailPage />)} />
            <Route path="/tablet/restaurants/:restaurantId/live-orders" element={tabletPage(<LiveOrdersPage />)} />
            <Route path="/checkout/return" element={<CheckoutReturnPage />} />
            <Route path="/r/:slug" element={<PublicRestaurantPage />} />
            <Route path="/:slug" element={<PublicRestaurantPage />} />
            <Route path="*" element={<PublicRestaurantPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
