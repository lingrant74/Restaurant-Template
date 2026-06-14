export const emptyRestaurantForm = {
  name: "",
  slug: "",
  ownerEmail: "",
  description: "",
  address: "",
  phone: "",
  websiteUrl: "",
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
  isAvailable: true,
  modifierGroupIds: []
};

export function createSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function createAnchorId(value) {
  return `category-${createSlug(value || "menu")}`;
}

const japaneseCategoryAliases = {
  Entrees: "Hibachi Dinner",
  Drinks: "Beverages",
  Sides: "Side Order",
  Specials: "Special Roll"
};

export function getJapaneseCategoryLabel(categoryName) {
  return japaneseCategoryAliases[categoryName] || categoryName;
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

export function getItemModifierGroups(item) {
  return (item.modifierGroupLinks || [])
    .map((link) => link.modifierGroup)
    .filter(Boolean)
    .sort((firstGroup, secondGroup) => {
      if (firstGroup.sort !== secondGroup.sort) {
        return firstGroup.sort - secondGroup.sort;
      }

      return firstGroup.name.localeCompare(secondGroup.name);
    });
}
