const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

export function getRestaurants() {
  return apiRequest("/restaurants");
}

export function getRestaurant(restaurantId) {
  return apiRequest(`/restaurants/${restaurantId}`);
}

export function createRestaurant(restaurant) {
  return apiRequest("/restaurants", {
    method: "POST",
    body: JSON.stringify(restaurant)
  });
}

export async function getCategories(restaurantId) {
  const restaurant = await getRestaurant(restaurantId);
  return restaurant.categories || [];
}

export function createCategory(restaurantId, category) {
  return apiRequest(`/restaurants/${restaurantId}/categories`, {
    method: "POST",
    body: JSON.stringify(category)
  });
}

export function updateCategory(categoryId, category) {
  return apiRequest(`/menu-categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(category)
  });
}

export function deleteCategory(categoryId) {
  return apiRequest(`/menu-categories/${categoryId}`, {
    method: "DELETE"
  });
}

export function getCategoryItems(restaurantId, categoryId) {
  return apiRequest(`/restaurants/${restaurantId}/categories/${categoryId}/menu-items`);
}

export function createMenuItem(restaurantId, menuItem) {
  return apiRequest(`/restaurants/${restaurantId}/menu-items`, {
    method: "POST",
    body: JSON.stringify(menuItem)
  });
}

export function updateMenuItem(menuItemId, menuItem) {
  return apiRequest(`/menu-items/${menuItemId}`, {
    method: "PATCH",
    body: JSON.stringify(menuItem)
  });
}

export function deleteMenuItem(menuItemId) {
  return apiRequest(`/menu-items/${menuItemId}`, {
    method: "DELETE"
  });
}

export function getPublicRestaurant(slug) {
  return apiRequest(`/public/restaurants/${slug}`);
}

export function createOrder(restaurantId, order) {
  return apiRequest(`/api/restaurants/${restaurantId}/orders`, {
    method: "POST",
    body: JSON.stringify(order)
  });
}

export function getOrders(restaurantId) {
  return apiRequest(`/api/restaurants/${restaurantId}/orders`);
}

export function updateOrderStatus(orderId, status) {
  return apiRequest(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}
