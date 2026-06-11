export const emptyRestaurantForm = {
  name: "",
  slug: "",
  description: "",
  address: "",
  phone: "",
  themeColor: "#d62828"
};

export const emptyCategoryForm = {
  name: "",
  sortOrder: ""
};

export const emptyMenuItemForm = {
  name: "",
  description: "",
  imageUrl: "",
  price: "",
  isAvailable: true
};

export function createSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatPrice(price) {
  return Number(price).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}

export function groupMenuItems(menuItems) {
  return menuItems.reduce((groups, item) => {
    const categoryName = item.menuCategory?.name || item.category || "Menu";

    if (!groups[categoryName]) {
      groups[categoryName] = [];
    }

    groups[categoryName].push(item);
    return groups;
  }, {});
}
