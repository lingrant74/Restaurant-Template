const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
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

export function loginWithGoogle(credential) {
  return apiRequest("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential })
  });
}

export function getCurrentAdminUser() {
  return apiRequest("/api/auth/me");
}

export function logoutAdminUser() {
  return apiRequest("/api/auth/logout", {
    method: "POST"
  });
}

export function getRestaurantUsers(restaurantId) {
  return apiRequest(`/api/restaurants/${restaurantId}/users`);
}

export function createRestaurantUser(restaurantId, user) {
  return apiRequest(`/api/restaurants/${restaurantId}/users`, {
    method: "POST",
    body: JSON.stringify(user)
  });
}

export function updateRestaurantUser(userId, user) {
  return apiRequest(`/api/restaurant-users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(user)
  });
}

export function deleteRestaurantUser(userId) {
  return apiRequest(`/api/restaurant-users/${userId}`, {
    method: "DELETE"
  });
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

export function getLiveOrdersRestaurant(restaurantId) {
  return apiRequest(`/api/restaurants/${restaurantId}/live-orders-info`);
}

export function updateOrderStatus(orderId, status) {
  return apiRequest(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function acceptOrder(orderId) {
  return apiRequest(`/api/orders/${orderId}/accept`, {
    method: "PATCH"
  });
}

export function declineOrder(orderId) {
  return apiRequest(`/api/orders/${orderId}/decline`, {
    method: "PATCH"
  });
}

export function markOrderPrinted(orderId) {
  return apiRequest(`/api/orders/${orderId}/printed`, {
    method: "PATCH"
  });
}

export function getPrintAgentOrders(restaurantId) {
  return apiRequest(`/api/print-agent/restaurants/${restaurantId}/orders`);
}

export function getModifierGroups(restaurantId) {
  return apiRequest(`/api/restaurants/${restaurantId}/modifier-groups`);
}

export function createModifierGroup(restaurantId, modifierGroup) {
  return apiRequest(`/api/restaurants/${restaurantId}/modifier-groups`, {
    method: "POST",
    body: JSON.stringify(modifierGroup)
  });
}

export function updateModifierGroup(groupId, modifierGroup) {
  return apiRequest(`/api/modifier-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(modifierGroup)
  });
}

export function deleteModifierGroup(groupId) {
  return apiRequest(`/api/modifier-groups/${groupId}`, {
    method: "DELETE"
  });
}

export function createModifierOption(groupId, option) {
  return apiRequest(`/api/modifier-groups/${groupId}/options`, {
    method: "POST",
    body: JSON.stringify(option)
  });
}

export function updateModifierOption(optionId, option) {
  return apiRequest(`/api/modifier-options/${optionId}`, {
    method: "PATCH",
    body: JSON.stringify(option)
  });
}

export function deleteModifierOption(optionId) {
  return apiRequest(`/api/modifier-options/${optionId}`, {
    method: "DELETE"
  });
}

export function getMenuItemModifierGroups(menuItemId) {
  return apiRequest(`/api/menu-items/${menuItemId}/modifier-groups`);
}

export function setMenuItemModifierGroups(menuItemId, modifierGroupIds) {
  return apiRequest(`/api/menu-items/${menuItemId}/modifier-groups`, {
    method: "PUT",
    body: JSON.stringify({ modifierGroupIds })
  });
}
