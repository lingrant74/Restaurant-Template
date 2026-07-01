const { TABLES } = require("./client");
const { nextId } = require("./ids");
const { getItem, putItem, deleteItem, updateItem, queryByIndex, scanAll } = require("./dao");
const { NotFoundError, UniqueConstraintError } = require("./errors");
const { nowIso, toMoneyString } = require("./util");

// This module replaces Prisma. Each section exposes purpose-built functions
// that return the SAME object shapes Prisma produced (including nested
// "include" relations and null-filled optional fields) so the route handlers
// only need their data calls swapped, not their response shaping.

// ── Sorting helpers ──────────────────────────────────────────────────────────

const byNameAsc = (a, b) => String(a.name).localeCompare(String(b.name));
const bySortThenName = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || byNameAsc(a, b);
const bySortOrderThenName = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || byNameAsc(a, b);
const byCreatedAtDesc = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

// ── Mappers (stored item -> API shape with defaults/nulls) ───────────────────

function mapRestaurant(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: item.description ?? null,
    address: item.address ?? null,
    phone: item.phone ?? null,
    websiteUrl: item.websiteUrl ?? null,
    themeColor: item.themeColor ?? "#d62828",
    stripeAccountId: item.stripeAccountId ?? null,
    twilioPhoneNumber: item.twilioPhoneNumber ?? null,
    aiHandoffMode: item.aiHandoffMode ?? "WHEN_CUSTOMER_ASKS",
    maxFailedAttempts: item.maxFailedAttempts ?? 3,
    allowCustomerRequestHandoff: item.allowCustomerRequestHandoff ?? true,
    handoffPhoneNumber: item.handoffPhoneNumber ?? null,
    autoPrint: item.autoPrint ?? false,
    taxRate: item.taxRate ?? 0,
    estimatedMinutes: item.estimatedMinutes ?? 20,
    operatingHours: item.operatingHours ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapRestaurantUser(item) {
  if (!item) return null;
  return {
    id: item.id,
    restaurantId: item.restaurantId,
    email: item.email,
    name: item.name ?? null,
    picture: item.picture ?? null,
    role: item.role ?? "OWNER",
    status: item.status ?? "APPROVED",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapCategory(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    sortOrder: item.sortOrder ?? 0,
    restaurantId: item.restaurantId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapMenuItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    imageUrl: item.imageUrl ?? null,
    category: item.category ?? null,
    categoryId: item.categoryId ?? null,
    price: toMoneyString(item.price),
    isAvailable: item.isAvailable ?? true,
    restaurantId: item.restaurantId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapModifierGroup(item) {
  if (!item) return null;
  return {
    id: item.id,
    restaurantId: item.restaurantId,
    name: item.name,
    required: item.required ?? false,
    allowMultiple: item.allowMultiple ?? false,
    minSelections: item.minSelections ?? 0,
    maxSelections: item.maxSelections ?? null,
    sort: item.sort ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapModifierOption(item) {
  if (!item) return null;
  return {
    id: item.id,
    modifierGroupId: item.modifierGroupId,
    name: item.name,
    priceDelta: toMoneyString(item.priceDelta),
    sort: item.sort ?? 0,
    available: item.available ?? true,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapOrderItem(item) {
  return {
    id: item.id,
    name: item.name,
    price: toMoneyString(item.price),
    basePrice: toMoneyString(item.basePrice),
    finalPrice: toMoneyString(item.finalPrice),
    quantity: item.quantity,
    customerComment: item.customerComment ?? null,
    selectedModifiers: Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [],
    orderId: item.orderId,
    menuItemId: item.menuItemId ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapOrder(item) {
  if (!item) return null;
  const items = Array.isArray(item.items) ? item.items.map(mapOrderItem) : [];
  items.sort((a, b) => a.id - b.id);
  return {
    id: item.id,
    orderNumber: item.orderNumber ?? null,
    customerName: item.customerName,
    customerPhone: item.customerPhone,
    customerEmail: item.customerEmail ?? null,
    notes: item.notes ?? null,
    source: item.source ?? null,
    status: item.status ?? "PENDING",
    paymentStatus: item.paymentStatus ?? "UNPAID",
    stripeSessionId: item.stripeSessionId ?? null,
    stripePaymentIntentId: item.stripePaymentIntentId ?? null,
    total: toMoneyString(item.total),
    acceptedAt: item.acceptedAt ?? null,
    printedAt: item.printedAt ?? null,
    cancelledAt: item.cancelledAt ?? null,
    restaurantId: item.restaurantId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    items
  };
}

// ── Restaurant ───────────────────────────────────────────────────────────────

async function findRestaurantBySlug(slug) {
  const [item] = await queryByIndex(TABLES.restaurant, "slug-index", "slug", slug);
  return item || null;
}

async function getRestaurantById(id) {
  return mapRestaurant(await getItem(TABLES.restaurant, { id }));
}

async function getRestaurantByTwilioNumber(twilioPhoneNumber) {
  const [item] = await queryByIndex(
    TABLES.restaurant,
    "twilioPhoneNumber-index",
    "twilioPhoneNumber",
    twilioPhoneNumber
  );
  return mapRestaurant(item || null);
}

// Creates a restaurant plus its default categories and owner user. Not a true
// transaction (DynamoDB counters can't be batched with the writes), but the
// slug/email uniqueness checks happen up front so the common conflict cases
// fail before anything is written.
async function createRestaurantWithDefaults({ restaurant, categories, ownerEmail }) {
  if (await findRestaurantBySlug(restaurant.slug)) {
    throw new UniqueConstraintError(["slug"]);
  }
  if (await findRestaurantUserRaw(ownerEmail)) {
    throw new UniqueConstraintError(["email"]);
  }

  const timestamp = nowIso();
  const id = await nextId("Restaurant");

  const stored = {
    id,
    name: restaurant.name,
    slug: restaurant.slug,
    description: restaurant.description ?? null,
    address: restaurant.address ?? null,
    phone: restaurant.phone ?? null,
    websiteUrl: restaurant.websiteUrl ?? null,
    themeColor: restaurant.themeColor || "#d62828",
    stripeAccountId: null,
    // Omit (sparse GSI) rather than store null — see createRestaurant.
    twilioPhoneNumber: restaurant.twilioPhoneNumber || undefined,
    aiHandoffMode: "WHEN_CUSTOMER_ASKS",
    maxFailedAttempts: 3,
    allowCustomerRequestHandoff: true,
    handoffPhoneNumber: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putItem(TABLES.restaurant, stored);

  const createdCategories = [];
  for (const category of categories) {
    createdCategories.push(await createCategory({ restaurantId: id, name: category.name, sortOrder: category.sortOrder }));
  }

  await createRestaurantUser({ restaurantId: id, email: ownerEmail, role: "OWNER", status: "APPROVED" });

  return { ...mapRestaurant(stored), categories: createdCategories.sort(bySortOrderThenName) };
}

// Creates a single restaurant row (no default categories or owner user).
// Used by the seed script; the admin "create restaurant" flow uses
// createRestaurantWithDefaults instead.
async function createRestaurant(data) {
  if (await findRestaurantBySlug(data.slug)) {
    throw new UniqueConstraintError(["slug"]);
  }

  const timestamp = nowIso();
  const stored = {
    id: await nextId("Restaurant"),
    name: data.name,
    slug: data.slug,
    description: data.description ?? null,
    address: data.address ?? null,
    phone: data.phone ?? null,
    websiteUrl: data.websiteUrl ?? null,
    themeColor: data.themeColor || "#d62828",
    stripeAccountId: data.stripeAccountId ?? null,
    // twilioPhoneNumber backs a GSI, so it must be omitted (sparse) rather than
    // stored as null when absent — DynamoDB rejects NULL on an index key.
    twilioPhoneNumber: data.twilioPhoneNumber || undefined,
    aiHandoffMode: data.aiHandoffMode ?? "WHEN_CUSTOMER_ASKS",
    maxFailedAttempts: data.maxFailedAttempts ?? 3,
    allowCustomerRequestHandoff: data.allowCustomerRequestHandoff ?? true,
    handoffPhoneNumber: data.handoffPhoneNumber ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putItem(TABLES.restaurant, stored);
  return mapRestaurant(stored);
}

async function listRestaurants() {
  const restaurants = (await scanAll(TABLES.restaurant)).map(mapRestaurant).sort(byCreatedAtDesc);

  return Promise.all(
    restaurants.map(async (restaurant) => {
      const [categories, menuItems] = await Promise.all([
        listCategories(restaurant.id),
        listMenuItemsWithCategory(restaurant.id)
      ]);
      return {
        ...restaurant,
        categories,
        menuItems,
        _count: { menuItems: menuItems.length }
      };
    })
  );
}

async function getRestaurantWithMenu(id) {
  const restaurant = await getRestaurantById(id);
  if (!restaurant) return null;

  const [categories, menuItems] = await Promise.all([listCategories(id), listMenuItemsWithCategory(id)]);
  return { ...restaurant, categories, menuItems };
}

// Attaches sorted categories and available menu items (each with its category
// and modifier groups, available options only) to a restaurant. Shared by the
// public page (by slug) and the Vapi menu endpoint (by id).
async function attachPublicMenu(restaurant) {
  const [categories, availableItems] = await Promise.all([
    listCategories(restaurant.id),
    listMenuItemsForRestaurant(restaurant.id, { isAvailable: true })
  ]);

  const menuItems = await Promise.all(
    availableItems.map(async (menuItem) => ({
      ...menuItem,
      menuCategory: await getCategoryRef(menuItem.categoryId),
      modifierGroupLinks: await assembleModifierLinks(menuItem.id, { availableOptionsOnly: true })
    }))
  );

  return { ...restaurant, categories, menuItems };
}

async function getRestaurantBySlugWithPublicMenu(slug) {
  const raw = await findRestaurantBySlug(slug);
  if (!raw) return null;
  return attachPublicMenu(mapRestaurant(raw));
}

async function getRestaurantByIdWithPublicMenu(id) {
  const restaurant = await getRestaurantById(id);
  if (!restaurant) return null;
  return attachPublicMenu(restaurant);
}

async function getLiveOrdersInfo(id) {
  const restaurant = await getRestaurantById(id);
  if (!restaurant) return null;
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    phone: restaurant.phone,
    address: restaurant.address,
    websiteUrl: restaurant.websiteUrl,
    themeColor: restaurant.themeColor
  };
}

async function updateRestaurant(id, data) {
  return mapRestaurant(await updateItem(TABLES.restaurant, { id }, data));
}

// ── RestaurantUser ───────────────────────────────────────────────────────────

async function findRestaurantUserRaw(email) {
  const [item] = await queryByIndex(TABLES.restaurantUser, "email-index", "email", email);
  return item || null;
}

async function getRestaurantUserByEmail(email) {
  return mapRestaurantUser(await findRestaurantUserRaw(email));
}

async function listRestaurantUsers(restaurantId) {
  const users = await queryByIndex(TABLES.restaurantUser, "restaurantId-index", "restaurantId", restaurantId);
  return users.map(mapRestaurantUser).sort(byCreatedAtDesc);
}

async function createRestaurantUser({ restaurantId, email, name, role = "OWNER", status = "APPROVED" }) {
  if (await findRestaurantUserRaw(email)) {
    throw new UniqueConstraintError(["email"]);
  }

  const timestamp = nowIso();
  const stored = {
    id: await nextId("RestaurantUser"),
    restaurantId,
    email,
    name: name ?? null,
    picture: null,
    role,
    status,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putItem(TABLES.restaurantUser, stored);
  return mapRestaurantUser(stored);
}

async function updateRestaurantUser(id, data) {
  return mapRestaurantUser(await updateItem(TABLES.restaurantUser, { id }, data));
}

async function deleteRestaurantUser(id) {
  return mapRestaurantUser(await deleteItem(TABLES.restaurantUser, { id }, { requireExists: true }));
}

// ── MenuCategory ─────────────────────────────────────────────────────────────

async function findCategoryByRestaurantAndName(restaurantId, name) {
  const categories = await queryByIndex(TABLES.menuCategory, "restaurantId-index", "restaurantId", restaurantId);
  return categories.find((category) => category.name === name) || null;
}

async function listCategories(restaurantId) {
  const categories = await queryByIndex(TABLES.menuCategory, "restaurantId-index", "restaurantId", restaurantId);
  return categories.map(mapCategory).sort(bySortOrderThenName);
}

async function getCategory(id) {
  return mapCategory(await getItem(TABLES.menuCategory, { id }));
}

// Lightweight category reference for a menu item's `menuCategory` relation.
async function getCategoryRef(categoryId) {
  if (categoryId === null || categoryId === undefined) return null;
  return getCategory(categoryId);
}

async function getCategoryForRestaurant(id, restaurantId) {
  const category = await getCategory(id);
  if (!category || category.restaurantId !== restaurantId) return null;
  return category;
}

async function createCategory({ restaurantId, name, sortOrder = 0 }) {
  if (await findCategoryByRestaurantAndName(restaurantId, name)) {
    throw new UniqueConstraintError(["restaurantId", "name"]);
  }

  const timestamp = nowIso();
  const stored = {
    id: await nextId("MenuCategory"),
    name,
    sortOrder,
    restaurantId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putItem(TABLES.menuCategory, stored);
  return mapCategory(stored);
}

async function updateCategory(id, data) {
  const existing = await getCategory(id);
  if (!existing) throw new NotFoundError();

  if (data.name !== undefined && data.name !== existing.name) {
    const clash = await findCategoryByRestaurantAndName(existing.restaurantId, data.name);
    if (clash && clash.id !== id) {
      throw new UniqueConstraintError(["restaurantId", "name"]);
    }
  }

  return mapCategory(await updateItem(TABLES.menuCategory, { id }, data));
}

// Deletes a category and, like Prisma's onDelete: SetNull, clears categoryId on
// any menu items that referenced it.
async function deleteCategory(id) {
  const removed = await deleteItem(TABLES.menuCategory, { id }, { requireExists: true });

  const menuItems = await queryByIndex(TABLES.menuItem, "restaurantId-index", "restaurantId", removed.restaurantId);
  await Promise.all(
    menuItems
      .filter((menuItem) => menuItem.categoryId === id)
      .map((menuItem) => updateItem(TABLES.menuItem, { id: menuItem.id }, { categoryId: null }))
  );

  return mapCategory(removed);
}

// ── MenuItem ─────────────────────────────────────────────────────────────────

async function getMenuItem(id) {
  return mapMenuItem(await getItem(TABLES.menuItem, { id }));
}

async function listMenuItemsForRestaurant(restaurantId, { categoryId, isAvailable } = {}) {
  let items = (await queryByIndex(TABLES.menuItem, "restaurantId-index", "restaurantId", restaurantId)).map(mapMenuItem);

  if (categoryId !== undefined) {
    items = items.filter((item) => item.categoryId === categoryId);
  }
  if (isAvailable !== undefined) {
    items = items.filter((item) => item.isAvailable === isAvailable);
  }

  return items.sort(byNameAsc);
}

async function listMenuItemsWithCategory(restaurantId) {
  const items = await listMenuItemsForRestaurant(restaurantId);
  return Promise.all(items.map(async (item) => ({ ...item, menuCategory: await getCategoryRef(item.categoryId) })));
}

async function createMenuItem(data) {
  const timestamp = nowIso();
  const stored = {
    id: await nextId("MenuItem"),
    name: data.name,
    description: data.description ?? null,
    imageUrl: data.imageUrl ?? null,
    category: data.category ?? null,
    categoryId: data.categoryId ?? null,
    price: toMoneyString(data.price),
    isAvailable: data.isAvailable ?? true,
    restaurantId: data.restaurantId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putItem(TABLES.menuItem, stored);
  return { ...mapMenuItem(stored), menuCategory: await getCategoryRef(stored.categoryId) };
}

async function updateMenuItem(id, data) {
  const patch = { ...data };
  if (patch.price !== undefined) {
    patch.price = toMoneyString(patch.price);
  }
  const updated = mapMenuItem(await updateItem(TABLES.menuItem, { id }, patch));
  return { ...updated, menuCategory: await getCategoryRef(updated.categoryId) };
}

// Deletes a menu item and its modifier-group links (Prisma onDelete: Cascade).
async function deleteMenuItem(id) {
  const removed = await deleteItem(TABLES.menuItem, { id }, { requireExists: true });
  await deleteLinksByMenuItem(id);
  return mapMenuItem(removed);
}

// Menu items eligible to be ordered, with their full modifier definitions
// attached (all options, not just available ones) for server-side validation.
async function getOrderableMenuItems(restaurantId, menuItemIds) {
  const idSet = new Set(menuItemIds);
  const items = (await queryByIndex(TABLES.menuItem, "restaurantId-index", "restaurantId", restaurantId))
    .map(mapMenuItem)
    .filter((item) => item.isAvailable && idSet.has(item.id));

  return Promise.all(
    items.map(async (item) => ({
      ...item,
      modifierGroupLinks: await assembleModifierLinks(item.id, { availableOptionsOnly: false })
    }))
  );
}

// ── ModifierGroup / ModifierOption ───────────────────────────────────────────

async function findModifierGroupByRestaurantAndName(restaurantId, name) {
  const groups = await queryByIndex(TABLES.modifierGroup, "restaurantId-index", "restaurantId", restaurantId);
  return groups.find((group) => group.name === name) || null;
}

async function getModifierGroupRaw(id) {
  return getItem(TABLES.modifierGroup, { id });
}

async function getModifierGroupWithOptions(id, { availableOptionsOnly = false } = {}) {
  const group = mapModifierGroup(await getModifierGroupRaw(id));
  if (!group) return null;
  return { ...group, options: await listOptions(id, { availableOnly: availableOptionsOnly }) };
}

async function listModifierGroups(restaurantId) {
  const groups = (await queryByIndex(TABLES.modifierGroup, "restaurantId-index", "restaurantId", restaurantId))
    .map(mapModifierGroup)
    .sort(bySortThenName);

  return Promise.all(groups.map(async (group) => ({ ...group, options: await listOptions(group.id) })));
}

async function listModifierGroupsByIds(restaurantId, ids) {
  const idSet = new Set(ids);
  const groups = await queryByIndex(TABLES.modifierGroup, "restaurantId-index", "restaurantId", restaurantId);
  return groups.map(mapModifierGroup).filter((group) => idSet.has(group.id));
}

async function createModifierGroup(data) {
  if (await findModifierGroupByRestaurantAndName(data.restaurantId, data.name)) {
    throw new UniqueConstraintError(["restaurantId", "name"]);
  }

  const timestamp = nowIso();
  const stored = {
    id: await nextId("ModifierGroup"),
    restaurantId: data.restaurantId,
    name: data.name,
    required: Boolean(data.required),
    allowMultiple: Boolean(data.allowMultiple),
    minSelections: data.minSelections ?? 0,
    maxSelections: data.maxSelections ?? null,
    sort: data.sort ?? 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putItem(TABLES.modifierGroup, stored);
  return { ...mapModifierGroup(stored), options: [] };
}

async function updateModifierGroup(id, data) {
  const existing = mapModifierGroup(await getModifierGroupRaw(id));
  if (!existing) throw new NotFoundError();

  if (data.name !== undefined && data.name !== existing.name) {
    const clash = await findModifierGroupByRestaurantAndName(existing.restaurantId, data.name);
    if (clash && clash.id !== id) {
      throw new UniqueConstraintError(["restaurantId", "name"]);
    }
  }

  const updated = mapModifierGroup(await updateItem(TABLES.modifierGroup, { id }, data));
  return { ...updated, options: await listOptions(id) };
}

// Deletes a modifier group plus its options and menu-item links (cascade).
async function deleteModifierGroup(id) {
  const removed = await deleteItem(TABLES.modifierGroup, { id }, { requireExists: true });

  const [options, links] = await Promise.all([
    queryByIndex(TABLES.modifierOption, "modifierGroupId-index", "modifierGroupId", id),
    queryByIndex(TABLES.menuItemModifierGroup, "modifierGroupId-index", "modifierGroupId", id)
  ]);

  await Promise.all([
    ...options.map((option) => deleteItem(TABLES.modifierOption, { id: option.id })),
    ...links.map((link) => deleteItem(TABLES.menuItemModifierGroup, { linkKey: link.linkKey }))
  ]);

  return mapModifierGroup(removed);
}

async function listOptions(modifierGroupId, { availableOnly = false } = {}) {
  let options = (await queryByIndex(TABLES.modifierOption, "modifierGroupId-index", "modifierGroupId", modifierGroupId))
    .map(mapModifierOption);

  if (availableOnly) {
    options = options.filter((option) => option.available);
  }

  return options.sort(bySortThenName);
}

async function createModifierOption(data) {
  const timestamp = nowIso();
  const stored = {
    id: await nextId("ModifierOption"),
    modifierGroupId: data.modifierGroupId,
    name: data.name,
    priceDelta: toMoneyString(data.priceDelta),
    sort: data.sort ?? 0,
    available: data.available ?? true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putItem(TABLES.modifierOption, stored);
  return mapModifierOption(stored);
}

async function updateModifierOption(id, data) {
  const patch = { ...data };
  if (patch.priceDelta !== undefined) {
    patch.priceDelta = toMoneyString(patch.priceDelta);
  }
  return mapModifierOption(await updateItem(TABLES.modifierOption, { id }, patch));
}

async function deleteModifierOption(id) {
  return mapModifierOption(await deleteItem(TABLES.modifierOption, { id }, { requireExists: true }));
}

// ── MenuItemModifierGroup (join) ─────────────────────────────────────────────

function linkKeyFor(menuItemId, modifierGroupId) {
  return `${menuItemId}#${modifierGroupId}`;
}

// Returns the modifier-group links for a menu item, each shaped like Prisma's
// include: { menuItemId, modifierGroupId, modifierGroup: { ...group, options } }.
// Sorted by the group's `sort` to match modifierGroup ordering.
async function assembleModifierLinks(menuItemId, { availableOptionsOnly = false } = {}) {
  const links = await queryByIndex(TABLES.menuItemModifierGroup, "menuItemId-index", "menuItemId", menuItemId);

  const assembled = await Promise.all(
    links.map(async (link) => ({
      menuItemId: link.menuItemId,
      modifierGroupId: link.modifierGroupId,
      modifierGroup: await getModifierGroupWithOptions(link.modifierGroupId, { availableOptionsOnly })
    }))
  );

  return assembled
    .filter((link) => link.modifierGroup)
    .sort((a, b) => (a.modifierGroup.sort ?? 0) - (b.modifierGroup.sort ?? 0));
}

async function deleteLinksByMenuItem(menuItemId) {
  const links = await queryByIndex(TABLES.menuItemModifierGroup, "menuItemId-index", "menuItemId", menuItemId);
  await Promise.all(links.map((link) => deleteItem(TABLES.menuItemModifierGroup, { linkKey: link.linkKey })));
}

// Replaces a menu item's links with the given groups. The deterministic linkKey
// makes this idempotent (Prisma's skipDuplicates).
async function setMenuItemModifierGroups(menuItemId, modifierGroupIds) {
  await deleteLinksByMenuItem(menuItemId);
  const timestamp = nowIso();
  await Promise.all(
    modifierGroupIds.map((modifierGroupId) =>
      putItem(TABLES.menuItemModifierGroup, {
        linkKey: linkKeyFor(menuItemId, modifierGroupId),
        menuItemId,
        modifierGroupId,
        createdAt: timestamp
      })
    )
  );
}

// ── Order ────────────────────────────────────────────────────────────────────

async function createOrder(data) {
  const timestamp = nowIso();
  const orderId = await nextId("Order");

  const items = [];
  for (const item of data.items || []) {
    items.push({
      id: await nextId("OrderItem"),
      name: item.name,
      price: toMoneyString(item.price),
      basePrice: toMoneyString(item.basePrice ?? item.price),
      finalPrice: toMoneyString(item.finalPrice ?? item.price),
      quantity: item.quantity,
      customerComment: item.customerComment ?? null,
      selectedModifiers: Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [],
      orderId,
      menuItemId: item.menuItemId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  const stored = {
    id: orderId,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    customerEmail: data.customerEmail ?? null,
    notes: data.notes ?? null,
    source: data.source ?? null,
    status: data.status ?? "PENDING",
    paymentStatus: data.paymentStatus ?? "UNPAID",
    stripeSessionId: data.stripeSessionId ?? null,
    stripePaymentIntentId: data.stripePaymentIntentId ?? null,
    total: toMoneyString(data.total),
    acceptedAt: null,
    printedAt: null,
    cancelledAt: null,
    restaurantId: data.restaurantId,
    createdAt: timestamp,
    updatedAt: timestamp,
    items
  };
  await putItem(TABLES.order, stored);
  return mapOrder(stored);
}

async function getOrder(id) {
  return mapOrder(await getItem(TABLES.order, { id }));
}

async function listOrdersForRestaurant(restaurantId) {
  const orders = await queryByIndex(TABLES.order, "restaurantId-index", "restaurantId", restaurantId);
  return orders.map(mapOrder).sort(byCreatedAtDesc);
}

// Accepted, paid, not-yet-printed orders for the print agent, oldest accepted
// first (Prisma orderBy acceptedAt asc).
async function listPrintableOrders(restaurantId) {
  const orders = await queryByIndex(TABLES.order, "restaurantId-index", "restaurantId", restaurantId);
  return orders
    .map(mapOrder)
    .filter((order) => order.status === "ACCEPTED" && order.printedAt === null && order.paymentStatus === "PAID")
    .sort((a, b) => String(a.acceptedAt).localeCompare(String(b.acceptedAt)));
}

async function updateOrder(id, data) {
  return mapOrder(await updateItem(TABLES.order, { id }, data));
}

// ── Printer / PrinterCategory ────────────────────────────────────────────────

function mapPrinter(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    ipAddress: item.ipAddress,
    port: item.port ?? 9100,
    type: item.type ?? "ESCPOS",
    isDefault: item.isDefault ?? false,
    isOnline: item.isOnline ?? true,
    restaurantId: item.restaurantId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function printerLinkKey(printerId, categoryId) {
  return `${printerId}#${categoryId}`;
}

// Category assignments for a printer, shaped like Prisma's
// include: { categories: { include: { category: true } } }.
async function assemblePrinterCategories(printerId) {
  const links = await queryByIndex(TABLES.printerCategory, "printerId-index", "printerId", printerId);
  return Promise.all(
    links.map(async (link) => ({
      printerId: link.printerId,
      categoryId: link.categoryId,
      category: await getCategory(link.categoryId)
    }))
  );
}

async function getPrinterRaw(id) {
  return getItem(TABLES.printer, { id });
}

async function attachPrinterCategories(printer) {
  return { ...printer, categories: await assemblePrinterCategories(printer.id) };
}

async function getPrinter(id) {
  const printer = mapPrinter(await getPrinterRaw(id));
  if (!printer) return null;
  return attachPrinterCategories(printer);
}

async function listPrintersForRestaurant(restaurantId) {
  const printers = (await queryByIndex(TABLES.printer, "restaurantId-index", "restaurantId", restaurantId))
    .map(mapPrinter)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return Promise.all(printers.map(attachPrinterCategories));
}

async function listOnlinePrinters(restaurantId) {
  const printers = await listPrintersForRestaurant(restaurantId);
  return printers.filter((printer) => printer.isOnline);
}

// Clears isDefault on a restaurant's printers, optionally excluding one id.
async function unsetDefaultPrinters(restaurantId, exceptId) {
  const printers = await queryByIndex(TABLES.printer, "restaurantId-index", "restaurantId", restaurantId);
  await Promise.all(
    printers
      .filter((printer) => printer.isDefault && printer.id !== exceptId)
      .map((printer) => updateItem(TABLES.printer, { id: printer.id }, { isDefault: false }))
  );
}

async function createPrinter(data) {
  if (data.isDefault) {
    await unsetDefaultPrinters(data.restaurantId);
  }

  const timestamp = nowIso();
  const stored = {
    id: await nextId("Printer"),
    name: data.name,
    ipAddress: data.ipAddress,
    port: data.port ?? 9100,
    type: data.type ?? "ESCPOS",
    isDefault: Boolean(data.isDefault),
    isOnline: data.isOnline ?? true,
    restaurantId: data.restaurantId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putItem(TABLES.printer, stored);
  return { ...mapPrinter(stored), categories: [] };
}

async function updatePrinter(id, data) {
  // When promoting to default, demote the restaurant's other printers first.
  if (data.isDefault === true) {
    const existing = await getPrinterRaw(id);
    if (existing) {
      await unsetDefaultPrinters(existing.restaurantId, id);
    }
  }

  const updated = mapPrinter(await updateItem(TABLES.printer, { id }, data));
  return attachPrinterCategories(updated);
}

async function deletePrinter(id) {
  const removed = await deleteItem(TABLES.printer, { id }, { requireExists: true });
  const links = await queryByIndex(TABLES.printerCategory, "printerId-index", "printerId", id);
  await Promise.all(links.map((link) => deleteItem(TABLES.printerCategory, { linkKey: link.linkKey })));
  return mapPrinter(removed);
}

// Replaces a printer's category assignments (idempotent via the linkKey).
async function setPrinterCategories(printerId, categoryIds) {
  const existing = await queryByIndex(TABLES.printerCategory, "printerId-index", "printerId", printerId);
  await Promise.all(existing.map((link) => deleteItem(TABLES.printerCategory, { linkKey: link.linkKey })));

  const timestamp = nowIso();
  await Promise.all(
    categoryIds.map((categoryId) =>
      putItem(TABLES.printerCategory, {
        linkKey: printerLinkKey(printerId, categoryId),
        printerId,
        categoryId,
        createdAt: timestamp
      })
    )
  );
}

module.exports = {
  // Restaurant
  getRestaurantById,
  getRestaurantByTwilioNumber,
  createRestaurant,
  createRestaurantWithDefaults,
  listRestaurants,
  getRestaurantWithMenu,
  getRestaurantBySlugWithPublicMenu,
  getRestaurantByIdWithPublicMenu,
  getLiveOrdersInfo,
  updateRestaurant,
  // RestaurantUser
  getRestaurantUserByEmail,
  listRestaurantUsers,
  createRestaurantUser,
  updateRestaurantUser,
  deleteRestaurantUser,
  // MenuCategory
  listCategories,
  getCategory,
  getCategoryForRestaurant,
  createCategory,
  updateCategory,
  deleteCategory,
  // MenuItem
  getMenuItem,
  listMenuItemsForRestaurant,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getOrderableMenuItems,
  // ModifierGroup / ModifierOption
  getModifierGroupWithOptions,
  listModifierGroups,
  listModifierGroupsByIds,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
  listOptions,
  createModifierOption,
  updateModifierOption,
  deleteModifierOption,
  // MenuItemModifierGroup
  assembleModifierLinks,
  setMenuItemModifierGroups,
  // Order
  createOrder,
  getOrder,
  listOrdersForRestaurant,
  listPrintableOrders,
  updateOrder,
  // Printer / PrinterCategory
  createPrinter,
  getPrinter,
  listPrintersForRestaurant,
  listOnlinePrinters,
  updatePrinter,
  deletePrinter,
  setPrinterCategories
};
