import { BrowserRouter, Route, Routes } from "react-router-dom";
import CategoryDetailPage from "./pages/CategoryDetailPage.jsx";
import PublicRestaurantPage from "./pages/PublicRestaurantPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import RestaurantDetailPage from "./pages/RestaurantDetailPage.jsx";
import RestaurantsPage from "./pages/RestaurantsPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<RestaurantsPage />} />
        <Route path="/admin/restaurants/:restaurantId" element={<RestaurantDetailPage />} />
        <Route path="/admin/restaurants/:restaurantId/orders" element={<OrdersPage />} />
        <Route path="/admin/restaurants/:restaurantId/categories/:categoryId" element={<CategoryDetailPage />} />
        <Route path="/:slug" element={<PublicRestaurantPage />} />
        <Route path="*" element={<PublicRestaurantPage />} />
      </Routes>
    </BrowserRouter>
  );
}
