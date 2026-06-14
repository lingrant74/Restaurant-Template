const express = require("express");
const prisma = require("../prismaClient");
const { requireOrderAccess, requirePlatformAdmin, requireRestaurantAccess } = require("../auth");
const { getStripeClient, isStripeConfigured } = require("../stripe");
const { applySessionToOrder, captureOrderPayment, voidOrderPayment, calculatePlatformFeeCents } = require("../payments");

const router = express.Router();

const defaultCategoryNames = [
  "Appetizers",
  "Soup & Salads",
  "Yaki Soba",
  "Appetizers From Sushi Bar",
  "Hibachi Dinner",
  "Bento Dinner",
  "Regular Roll",
  "Special Roll",
  "Sushi / Sashimi",
  "Sushi & Sashimi Entree",
  "Side Order",
  "Beverages",
  "Desserts",
  "Side Sauce"
];
const orderStatuses = ["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"];
const restaurantUserRoles = ["OWNER", "STAFF"];
const restaurantUserStatuses = ["PENDING", "APPROVED", "REJECTED"];

function createDefaultCategories() {
  return defaultCategoryNames.map((name, index) => ({
    name,
    sortOrder: index + 1
  }));
}

function createSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function sendOrder(res, statusCode, order) {
  res.status(statusCode).json({
    ...order,
    // Keep this alias for any older frontend code that still reads subtotal.
    subtotal: order.total
  });
}

function orderInclude() {
  return {
    items: {
      orderBy: {
        id: "asc"
      }
    }
  };
}

function modifierGroupInclude() {
  return {
    options: {
      orderBy: [
        {
          sort: "asc"
        },
        {
          name: "asc"
        }
      ]
    }
  };
}

function publicMenuItemInclude() {
  return {
    menuCategory: true,
    modifierGroupLinks: {
      include: {
        modifierGroup: {
          include: {
            options: {
              where: {
                available: true
              },
              orderBy: [
                {
                  sort: "asc"
                },
                {
                  name: "asc"
                }
              ]
            }
          }
        }
      }
    }
  };
}

function normalizeModifierSelections(selectedModifiers = []) {
  if (!Array.isArray(selectedModifiers)) {
    return [];
  }

  return selectedModifiers
    .map((selection) => ({
      groupId: Number(selection.groupId),
      optionId: Number(selection.optionId)
    }))
    .filter((selection) => Number.isInteger(selection.groupId) && Number.isInteger(selection.optionId));
}

function buildOrderItemSnapshot(menuItem, orderItem) {
  const selectedModifiers = normalizeModifierSelections(orderItem.selectedModifiers);
  const selectedOptionKeys = new Set();
  const selectedGroupIds = new Set(selectedModifiers.map((selection) => selection.groupId));
  const allowedGroupIds = new Set(menuItem.modifierGroupLinks.map((link) => link.modifierGroupId));
  const modifierSnapshots = [];
  let modifierTotal = 0;

  for (const groupId of selectedGroupIds) {
    if (!allowedGroupIds.has(groupId)) {
      throw new Error("Order includes modifiers that do not belong to this menu item");
    }
  }

  for (const link of menuItem.modifierGroupLinks) {
    const group = link.modifierGroup;
    const groupSelections = selectedModifiers.filter((selection) => selection.groupId === group.id);
    const requiredMinimum = group.required ? Math.max(group.minSelections, 1) : group.minSelections;

    if (groupSelections.length < requiredMinimum) {
      throw new Error(`${group.name} requires at least ${requiredMinimum} selection${requiredMinimum === 1 ? "" : "s"}`);
    }

    if (!group.allowMultiple && groupSelections.length > 1) {
      throw new Error(`${group.name} only allows one selection`);
    }

    if (group.maxSelections !== null && groupSelections.length > group.maxSelections) {
      throw new Error(`${group.name} allows at most ${group.maxSelections} selection${group.maxSelections === 1 ? "" : "s"}`);
    }

    const optionsById = new Map(group.options.map((option) => [option.id, option]));

    for (const selection of groupSelections) {
      const selectionKey = `${selection.groupId}:${selection.optionId}`;

      if (selectedOptionKeys.has(selectionKey)) {
        throw new Error("Order includes the same modifier option more than once");
      }

      selectedOptionKeys.add(selectionKey);

      const option = optionsById.get(selection.optionId);

      if (!option || !option.available) {
        throw new Error("Order includes an unavailable modifier option");
      }

      const priceDelta = Number(option.priceDelta);
      modifierTotal += priceDelta;

      modifierSnapshots.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDelta: priceDelta.toFixed(2)
      });
    }
  }

  const basePrice = Number(menuItem.price);
  const finalPrice = basePrice + modifierTotal;

  return {
    menuItemId: menuItem.id,
    name: menuItem.name,
    price: finalPrice.toFixed(2),
    basePrice: basePrice.toFixed(2),
    finalPrice: finalPrice.toFixed(2),
    customerComment: orderItem.customerComment || null,
    selectedModifiers: modifierSnapshots,
    quantity: Number(orderItem.quantity)
  };
}

// Validates a cart against the database and returns the priced order items plus
// the authoritative server-computed total. Throws validation Errors (handled as
// 400 by the order/checkout routes). Shared by the direct-order and Stripe flows.
async function buildOrderDraft(restaurantId, items) {
  const menuItemIds = items.map((item) => Number(item.menuItemId));
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: {
        in: menuItemIds
      },
      restaurantId,
      isAvailable: true
    },
    include: {
      modifierGroupLinks: {
        include: {
          modifierGroup: {
            include: {
              options: true
            }
          }
        }
      }
    }
  });

  const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
  const orderItems = [];
  let total = 0;

  for (const item of items) {
    const menuItemId = Number(item.menuItemId);
    const quantity = Number(item.quantity);
    const menuItem = menuItemsById.get(menuItemId);

    if (!menuItem || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Order includes an invalid or unavailable menu item");
    }

    const orderItemSnapshot = buildOrderItemSnapshot(menuItem, item);
    total += Number(orderItemSnapshot.finalPrice) * quantity;
    orderItems.push(orderItemSnapshot);
  }

  return { orderItems, total: Number(total.toFixed(2)) };
}

// POST /restaurants
// Creates a restaurant. The slug is public and should be URL-friendly, like "pasta-house".
router.post("/restaurants", requirePlatformAdmin, async (req, res, next) => {
  try {
    const { name, slug, description, address, phone, websiteUrl, themeColor } = req.body;
    const ownerEmail = String(req.body.ownerEmail || "").trim().toLowerCase();

    if (!name) {
      return res.status(400).json({
        error: "Name is required"
      });
    }

    if (!ownerEmail) {
      return res.status(400).json({
        error: "Restaurant owner/staff email is required"
      });
    }

    const restaurant = await prisma.$transaction(async (tx) => {
      const createdRestaurant = await tx.restaurant.create({
        data: {
          name,
          slug: slug || createSlug(name),
          description,
          address,
          phone,
          websiteUrl,
          themeColor,
          categories: {
            create: createDefaultCategories()
          }
        },
        include: {
          categories: {
            orderBy: {
              sortOrder: "asc"
            }
          }
        }
      });

      await tx.restaurantUser.create({
        data: {
          restaurantId: createdRestaurant.id,
          email: ownerEmail,
          role: "OWNER",
          status: "APPROVED"
        }
      });

      return createdRestaurant;
    });

    res.status(201).json(restaurant);
  } catch (err) {
    if (err.code === "P2002") {
      if (Array.isArray(err.meta?.target) && err.meta.target.includes("email")) {
        return res.status(409).json({
          error: "That email is already assigned to a restaurant"
        });
      }

      return res.status(409).json({
        error: "A restaurant with that slug already exists"
      });
    }

    next(err);
  }
});

// GET /restaurants
// Lists restaurants with a simple menu item count.
router.get("/restaurants", requirePlatformAdmin, async (req, res, next) => {
  try {
    const restaurants = await prisma.restaurant.findMany({
      orderBy: {
        createdAt: "desc"
      },
      include: {
        categories: {
          orderBy: {
            sortOrder: "asc"
          }
        },
        menuItems: {
          include: {
            menuCategory: true
          },
          orderBy: {
            name: "asc"
          }
        },
        _count: {
          select: {
            menuItems: true
          }
        }
      }
    });

    res.json(restaurants);
  } catch (err) {
    next(err);
  }
});

// GET /restaurants/:id
// Returns one restaurant with categories and menu items for the admin pages.
router.get("/restaurants/:id", requirePlatformAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id
      },
      include: {
        categories: {
          orderBy: {
            sortOrder: "asc"
          }
        },
        menuItems: {
          include: {
            menuCategory: true
          },
          orderBy: {
            name: "asc"
          }
        }
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    res.json(restaurant);
  } catch (err) {
    next(err);
  }
});

// POST /restaurants/:restaurantId/menu-items
// Adds one menu item to a restaurant.
router.post("/restaurants/:restaurantId/menu-items", requirePlatformAdmin, async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const { name, description, imageUrl, category, categoryId, price, isAvailable } = req.body;

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    if (!name || price === undefined) {
      return res.status(400).json({
        error: "Name and price are required"
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: restaurantId
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    const selectedCategoryId = categoryId ? Number(categoryId) : null;

    if (selectedCategoryId) {
      const menuCategory = await prisma.menuCategory.findFirst({
        where: {
          id: selectedCategoryId,
          restaurantId
        }
      });

      if (!menuCategory) {
        return res.status(400).json({
          error: "Category does not belong to this restaurant"
        });
      }
    }

    const menuItem = await prisma.menuItem.create({
      data: {
        name,
        description,
        imageUrl,
        category,
        categoryId: selectedCategoryId,
        price,
        isAvailable,
        restaurantId
      },
      include: {
        menuCategory: true
      }
    });

    res.status(201).json(menuItem);
  } catch (err) {
    next(err);
  }
});

// POST /restaurants/:restaurantId/categories
// Adds a category to one restaurant.
router.post("/restaurants/:restaurantId/categories", requirePlatformAdmin, async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const { name, sortOrder } = req.body;

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "Category name is required"
      });
    }

    const category = await prisma.menuCategory.create({
      data: {
        name,
        sortOrder: sortOrder === undefined ? 0 : Number(sortOrder),
        restaurantId
      }
    });

    res.status(201).json(category);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "That category already exists for this restaurant"
      });
    }

    next(err);
  }
});

// GET /api/restaurants/:restaurantId/users
// Lets platform admins view staff/tablet accounts assigned to one restaurant.
router.get("/api/restaurants/:restaurantId/users", requirePlatformAdmin, async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    const users = await prisma.restaurantUser.findMany({
      where: {
        restaurantId
      },
      orderBy: [
        {
          createdAt: "desc"
        }
      ]
    });

    res.json(users);
  } catch (err) {
    next(err);
  }
});

// POST /api/restaurants/:restaurantId/users
// Creates or invites a restaurant tablet user for an existing restaurant.
router.post("/api/restaurants/:restaurantId/users", requirePlatformAdmin, async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const email = String(req.body.email || "").trim().toLowerCase();
    const { name, role, status } = req.body;
    const selectedRole = role ? String(role).toUpperCase() : "OWNER";
    const selectedStatus = status ? String(status).toUpperCase() : "APPROVED";

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    if (!email) {
      return res.status(400).json({
        error: "Email is required"
      });
    }

    if (!restaurantUserRoles.includes(selectedRole)) {
      return res.status(400).json({
        error: "Role must be OWNER or STAFF"
      });
    }

    if (!restaurantUserStatuses.includes(selectedStatus)) {
      return res.status(400).json({
        error: "Status must be PENDING, APPROVED, or REJECTED"
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: restaurantId
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    const user = await prisma.restaurantUser.create({
      data: {
        restaurantId,
        email,
        name,
        role: selectedRole,
        status: selectedStatus
      }
    });

    res.status(201).json(user);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "That email is already assigned to a restaurant"
      });
    }

    next(err);
  }
});

// PATCH /api/restaurant-users/:userId
// Updates approval status or basic details for one restaurant user.
router.patch("/api/restaurant-users/:userId", requirePlatformAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { name, role, status } = req.body;
    const selectedRole = role ? String(role).toUpperCase() : undefined;
    const selectedStatus = status ? String(status).toUpperCase() : undefined;

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        error: "Restaurant user id must be a number"
      });
    }

    if (selectedStatus && !restaurantUserStatuses.includes(selectedStatus)) {
      return res.status(400).json({
        error: "Status must be PENDING, APPROVED, or REJECTED"
      });
    }

    if (selectedRole && !restaurantUserRoles.includes(selectedRole)) {
      return res.status(400).json({
        error: "Role must be OWNER or STAFF"
      });
    }

    const user = await prisma.restaurantUser.update({
      where: {
        id: userId
      },
      data: {
        name,
        role: selectedRole,
        status: selectedStatus
      }
    });

    res.json(user);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Restaurant user not found"
      });
    }

    next(err);
  }
});

// DELETE /api/restaurant-users/:userId
// Removes one restaurant tablet user.
router.delete("/api/restaurant-users/:userId", requirePlatformAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        error: "Restaurant user id must be a number"
      });
    }

    const user = await prisma.restaurantUser.delete({
      where: {
        id: userId
      }
    });

    res.json({
      message: "Restaurant user removed",
      user
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Restaurant user not found"
      });
    }

    next(err);
  }
});

// GET /api/restaurants/:restaurantId/modifier-groups
// Lists all modifier groups and options for one restaurant.
router.get("/api/restaurants/:restaurantId/modifier-groups", requirePlatformAdmin, async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    const modifierGroups = await prisma.modifierGroup.findMany({
      where: {
        restaurantId
      },
      include: modifierGroupInclude(),
      orderBy: [
        {
          sort: "asc"
        },
        {
          name: "asc"
        }
      ]
    });

    res.json(modifierGroups);
  } catch (err) {
    next(err);
  }
});

// POST /api/restaurants/:restaurantId/modifier-groups
// Creates one modifier group for a restaurant.
router.post("/api/restaurants/:restaurantId/modifier-groups", requirePlatformAdmin, async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const { name, required, allowMultiple, minSelections, maxSelections, sort } = req.body;

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "Modifier group name is required"
      });
    }

    const modifierGroup = await prisma.modifierGroup.create({
      data: {
        restaurantId,
        name,
        required: Boolean(required),
        allowMultiple: Boolean(allowMultiple),
        minSelections: minSelections === undefined || minSelections === "" ? 0 : Number(minSelections),
        maxSelections: maxSelections === undefined || maxSelections === "" ? null : Number(maxSelections),
        sort: sort === undefined || sort === "" ? 0 : Number(sort)
      },
      include: modifierGroupInclude()
    });

    res.status(201).json(modifierGroup);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "That modifier group already exists for this restaurant"
      });
    }

    next(err);
  }
});

// PATCH /api/modifier-groups/:groupId
// Updates one modifier group.
router.patch("/api/modifier-groups/:groupId", requirePlatformAdmin, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const { name, required, allowMultiple, minSelections, maxSelections, sort } = req.body;

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({
        error: "Modifier group id must be a number"
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "Modifier group name is required"
      });
    }

    const modifierGroup = await prisma.modifierGroup.update({
      where: {
        id: groupId
      },
      data: {
        name,
        required: Boolean(required),
        allowMultiple: Boolean(allowMultiple),
        minSelections: minSelections === undefined || minSelections === "" ? 0 : Number(minSelections),
        maxSelections: maxSelections === undefined || maxSelections === "" ? null : Number(maxSelections),
        sort: sort === undefined || sort === "" ? 0 : Number(sort)
      },
      include: modifierGroupInclude()
    });

    res.json(modifierGroup);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Modifier group not found"
      });
    }

    if (err.code === "P2002") {
      return res.status(409).json({
        error: "That modifier group already exists for this restaurant"
      });
    }

    next(err);
  }
});

// DELETE /api/modifier-groups/:groupId
// Deletes one modifier group and its options/assignments.
router.delete("/api/modifier-groups/:groupId", requirePlatformAdmin, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({
        error: "Modifier group id must be a number"
      });
    }

    const modifierGroup = await prisma.modifierGroup.delete({
      where: {
        id: groupId
      }
    });

    res.json({
      message: "Modifier group deleted",
      modifierGroup
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Modifier group not found"
      });
    }

    next(err);
  }
});

// POST /api/modifier-groups/:groupId/options
// Adds an option to one modifier group.
router.post("/api/modifier-groups/:groupId/options", requirePlatformAdmin, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const { name, priceDelta, sort, available } = req.body;

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({
        error: "Modifier group id must be a number"
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "Modifier option name is required"
      });
    }

    const option = await prisma.modifierOption.create({
      data: {
        modifierGroupId: groupId,
        name,
        priceDelta: priceDelta === undefined || priceDelta === "" ? 0 : priceDelta,
        sort: sort === undefined || sort === "" ? 0 : Number(sort),
        available: available === undefined ? true : Boolean(available)
      }
    });

    res.status(201).json(option);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/modifier-options/:optionId
// Updates one modifier option.
router.patch("/api/modifier-options/:optionId", requirePlatformAdmin, async (req, res, next) => {
  try {
    const optionId = Number(req.params.optionId);
    const { name, priceDelta, sort, available } = req.body;

    if (!Number.isInteger(optionId)) {
      return res.status(400).json({
        error: "Modifier option id must be a number"
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "Modifier option name is required"
      });
    }

    const option = await prisma.modifierOption.update({
      where: {
        id: optionId
      },
      data: {
        name,
        priceDelta: priceDelta === undefined || priceDelta === "" ? 0 : priceDelta,
        sort: sort === undefined || sort === "" ? 0 : Number(sort),
        available: available === undefined ? true : Boolean(available)
      }
    });

    res.json(option);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Modifier option not found"
      });
    }

    next(err);
  }
});

// DELETE /api/modifier-options/:optionId
// Deletes one modifier option.
router.delete("/api/modifier-options/:optionId", requirePlatformAdmin, async (req, res, next) => {
  try {
    const optionId = Number(req.params.optionId);

    if (!Number.isInteger(optionId)) {
      return res.status(400).json({
        error: "Modifier option id must be a number"
      });
    }

    const option = await prisma.modifierOption.delete({
      where: {
        id: optionId
      }
    });

    res.json({
      message: "Modifier option deleted",
      option
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Modifier option not found"
      });
    }

    next(err);
  }
});

// GET /api/menu-items/:menuItemId/modifier-groups
// Returns the modifier groups assigned to one menu item.
router.get("/api/menu-items/:menuItemId/modifier-groups", requirePlatformAdmin, async (req, res, next) => {
  try {
    const menuItemId = Number(req.params.menuItemId);

    if (!Number.isInteger(menuItemId)) {
      return res.status(400).json({
        error: "Menu item id must be a number"
      });
    }

    const menuItem = await prisma.menuItem.findUnique({
      where: {
        id: menuItemId
      },
      include: {
        modifierGroupLinks: {
          include: {
            modifierGroup: {
              include: modifierGroupInclude()
            }
          }
        }
      }
    });

    if (!menuItem) {
      return res.status(404).json({
        error: "Menu item not found"
      });
    }

    res.json(menuItem.modifierGroupLinks.map((link) => link.modifierGroup));
  } catch (err) {
    next(err);
  }
});

// PUT /api/menu-items/:menuItemId/modifier-groups
// Replaces the modifier group assignments for one menu item.
router.put("/api/menu-items/:menuItemId/modifier-groups", requirePlatformAdmin, async (req, res, next) => {
  try {
    const menuItemId = Number(req.params.menuItemId);
    const modifierGroupIds = Array.isArray(req.body.modifierGroupIds) ? req.body.modifierGroupIds.map(Number) : [];

    if (!Number.isInteger(menuItemId)) {
      return res.status(400).json({
        error: "Menu item id must be a number"
      });
    }

    const menuItem = await prisma.menuItem.findUnique({
      where: {
        id: menuItemId
      }
    });

    if (!menuItem) {
      return res.status(404).json({
        error: "Menu item not found"
      });
    }

    const uniqueGroupIds = [...new Set(modifierGroupIds)].filter((id) => Number.isInteger(id));
    const modifierGroups = await prisma.modifierGroup.findMany({
      where: {
        id: {
          in: uniqueGroupIds
        },
        restaurantId: menuItem.restaurantId
      }
    });

    if (modifierGroups.length !== uniqueGroupIds.length) {
      return res.status(400).json({
        error: "All modifier groups must belong to the same restaurant as the menu item"
      });
    }

    await prisma.menuItemModifierGroup.deleteMany({
      where: {
        menuItemId
      }
    });

    if (uniqueGroupIds.length > 0) {
      await prisma.menuItemModifierGroup.createMany({
        data: uniqueGroupIds.map((modifierGroupId) => ({
          menuItemId,
          modifierGroupId
        })),
        skipDuplicates: true
      });
    }

    const updatedMenuItem = await prisma.menuItem.findUnique({
      where: {
        id: menuItemId
      },
      include: {
        modifierGroupLinks: {
          include: {
            modifierGroup: {
              include: modifierGroupInclude()
            }
          }
        }
      }
    });

    res.json(updatedMenuItem.modifierGroupLinks.map((link) => link.modifierGroup));
  } catch (err) {
    next(err);
  }
});

// POST /api/restaurants/:restaurantId/orders
// Creates an order from cart items for one restaurant.
router.post(["/api/restaurants/:restaurantId/orders", "/restaurants/:restaurantId/orders"], async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const { customerName, customerPhone, customerEmail, notes, items } = req.body;
    const normalizedCustomerPhone = String(customerPhone || "").replace(/\D/g, "");

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    if (!customerName || !customerPhone) {
      return res.status(400).json({
        error: "Customer name and phone number are required"
      });
    }

    if (!/^\d{10}$/.test(normalizedCustomerPhone)) {
      return res.status(400).json({
        error: "Customer phone number must be exactly 10 numbers"
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Order must include at least one item"
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: restaurantId
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    const { orderItems, total } = await buildOrderDraft(restaurantId, items);

    const order = await prisma.order.create({
      data: {
        customerName,
        customerPhone: normalizedCustomerPhone,
        customerEmail,
        notes,
        total: total.toFixed(2),
        restaurantId,
        // Direct orders (no online checkout) are treated as paid in-store so
        // they still surface to the kitchen alongside Stripe-paid orders.
        paymentStatus: "PAID",
        items: {
          create: orderItems
        }
      },
      include: {
        items: true
      }
    });

    sendOrder(res, 201, order);
  } catch (err) {
    if (
      err.message &&
      (err.message.startsWith("Order includes") || err.message.includes("requires") || err.message.includes("allows"))
    ) {
      return res.status(400).json({
        error: err.message
      });
    }

    next(err);
  }
});

// POST /api/restaurants/:restaurantId/connect/onboarding-link
// Creates the restaurant's connected account (if needed) and returns a Stripe
// hosted onboarding link. Connected accounts use destination charges so the
// restaurant receives funds minus the platform application fee.
router.post(
  "/api/restaurants/:restaurantId/connect/onboarding-link",
  requireRestaurantAccess("restaurantId"),
  async (req, res, next) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ error: "Online payments are not configured." });
      }

      const restaurantId = Number(req.params.restaurantId);

      if (!Number.isInteger(restaurantId)) {
        return res.status(400).json({ error: "Restaurant id must be a number" });
      }

      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

      if (!restaurant) {
        return res.status(404).json({ error: "Restaurant not found" });
      }

      let accountId = restaurant.stripeAccountId;

      if (!accountId) {
        // Controller-based connected account (not the legacy `type` param):
        // platform is liable for losses (required for destination charges),
        // Stripe hosts onboarding, and the connected account gets a dashboard.
        const account = await getStripeClient().accounts.create({
          controller: {
            stripe_dashboard: { type: "express" },
            fees: { payer: "application" },
            losses: { payments: "application" },
            requirement_collection: "stripe"
          },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true }
          },
          metadata: { restaurantId: String(restaurantId) }
        });

        accountId = account.id;
        await prisma.restaurant.update({
          where: { id: restaurantId },
          data: { stripeAccountId: accountId }
        });
      }

      const clientBaseUrl = process.env.CLIENT_BASE_URL || "http://localhost:5173";
      const paymentsUrl = `${clientBaseUrl}/admin/restaurants/${restaurantId}/payments`;

      const accountLink = await getStripeClient().accountLinks.create({
        account: accountId,
        refresh_url: `${paymentsUrl}?refresh=1`,
        return_url: `${paymentsUrl}?return=1`,
        type: "account_onboarding"
      });

      res.json({ url: accountLink.url });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/restaurants/:restaurantId/connect/status
// Reports whether the restaurant's connected account can accept charges.
router.get(
  "/api/restaurants/:restaurantId/connect/status",
  requireRestaurantAccess("restaurantId"),
  async (req, res, next) => {
    try {
      if (!isStripeConfigured()) {
        return res.status(503).json({ error: "Online payments are not configured." });
      }

      const restaurantId = Number(req.params.restaurantId);
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

      if (!restaurant) {
        return res.status(404).json({ error: "Restaurant not found" });
      }

      if (!restaurant.stripeAccountId) {
        return res.json({
          connected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false
        });
      }

      const account = await getStripeClient().accounts.retrieve(restaurant.stripeAccountId);

      res.json({
        connected: true,
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/restaurants/:restaurantId/checkout-session
// Creates an UNPAID order and an embedded Stripe Checkout Session for the
// server-computed total. The order is marked PAID later via webhook / status check.
router.post("/api/restaurants/:restaurantId/checkout-session", async (req, res, next) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({
        error: "Online payments are not configured."
      });
    }

    const restaurantId = Number(req.params.restaurantId);
    const { customerName, customerPhone, customerEmail, notes, items } = req.body;

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({ error: "Restaurant id must be a number" });
    }

    if (!customerName || !customerPhone) {
      return res.status(400).json({ error: "Customer name and phone number are required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Order must include at least one item" });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    if (!restaurant.stripeAccountId) {
      return res.status(409).json({
        error: "This restaurant isn't set up to accept online payments yet."
      });
    }

    const connectedAccount = await getStripeClient().accounts.retrieve(restaurant.stripeAccountId);

    if (!connectedAccount.charges_enabled) {
      return res.status(409).json({
        error: "This restaurant hasn't finished its payment setup yet."
      });
    }

    const { orderItems, total } = await buildOrderDraft(restaurantId, items);

    if (total <= 0) {
      return res.status(400).json({ error: "Order total must be greater than zero" });
    }

    const order = await prisma.order.create({
      data: {
        customerName,
        customerPhone,
        customerEmail,
        notes,
        total: total.toFixed(2),
        restaurantId,
        paymentStatus: "UNPAID",
        items: {
          create: orderItems
        }
      },
      include: orderInclude()
    });

    const clientBaseUrl = process.env.CLIENT_BASE_URL || "http://localhost:5173";
    const returnUrl = `${clientBaseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;

    // One Stripe line item per order item, priced from the DB-computed finalPrice.
    const lineItems = order.items.map((item) => {
      const modifiers = Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [];
      const description = modifiers
        .map((modifier) => `${modifier.groupName}: ${modifier.optionName}`)
        .join(", ");

      return {
        quantity: item.quantity,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(item.finalPrice) * 100),
          product_data: {
            name: item.name,
            ...(description ? { description: description.slice(0, 500) } : {})
          }
        }
      };
    });

    // NOTE: payment_method_types is intentionally omitted to enable Stripe's
    // dynamic payment methods (configured from the Dashboard).
    // Platform fee: larger of $0.20/item-unit or 3.5% of the order total.
    const applicationFeeAmount = calculatePlatformFeeCents(order.items, total);

    const session = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded_page",
      line_items: lineItems,
      return_url: returnUrl,
      // Authorize the card now but capture only when the restaurant accepts the
      // order. Declined orders are voided, so the customer is never charged.
      // Funds (minus the platform fee) are transferred to the restaurant's
      // connected account via a destination charge.
      payment_intent_data: {
        capture_method: "manual",
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: restaurant.stripeAccountId
        }
      },
      client_reference_id: String(order.id),
      metadata: {
        orderId: String(order.id),
        restaurantId: String(restaurantId)
      },
      ...(customerEmail ? { customer_email: customerEmail } : {})
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id }
    });

    res.status(201).json({
      clientSecret: session.client_secret,
      orderId: order.id
    });
  } catch (err) {
    if (
      err.message &&
      (err.message.startsWith("Order includes") || err.message.includes("requires") || err.message.includes("allows"))
    ) {
      return res.status(400).json({ error: err.message });
    }

    next(err);
  }
});

// GET /api/checkout-session/:sessionId/status
// Confirms payment after the embedded checkout returns. Marks the order PAID
// if Stripe reports the session as paid (fallback for when no webhook is set up).
router.get("/api/checkout-session/:sessionId/status", async (req, res, next) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: "Online payments are not configured." });
    }

    const session = await getStripeClient().checkout.sessions.retrieve(req.params.sessionId, {
      expand: ["payment_intent"]
    });

    let order = await applySessionToOrder(session);

    const orderId = session.metadata?.orderId ? Number(session.metadata.orderId) : null;

    if (!order && orderId) {
      order = await prisma.order.findUnique({ where: { id: orderId } });
    }

    res.json({
      status: session.status,
      paymentStatus: order?.paymentStatus || "UNPAID",
      orderId: order?.id || orderId,
      customerName: order?.customerName || null,
      total: order?.total || null
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/restaurants/:restaurantId/orders
// Lists orders for one restaurant so the admin page can manage them.
router.get("/api/restaurants/:restaurantId/orders", requireRestaurantAccess("restaurantId"), async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: restaurantId
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        // Hide only abandoned checkouts (never authorized). Authorized, paid,
        // and declined/refunded orders all remain visible to the kitchen/admin.
        paymentStatus: {
          not: "UNPAID"
        }
      },
      include: orderInclude(),
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json(orders.map((order) => ({
      ...order,
      subtotal: order.total
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/restaurants/:restaurantId/live-orders-info
// Returns only the restaurant details needed by the live orders tablet screen.
router.get("/api/restaurants/:restaurantId/live-orders-info", requireRestaurantAccess("restaurantId"), async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: restaurantId
      },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        address: true,
        websiteUrl: true,
        themeColor: true
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    res.json(restaurant);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:orderId/status
// Updates an order status from the admin page.
router.patch("/api/orders/:orderId/status", requireOrderAccess(), async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    const status = String(req.body.status || "").toUpperCase();

    if (!Number.isInteger(orderId)) {
      return res.status(400).json({
        error: "Order id must be a number"
      });
    }

    if (!orderStatuses.includes(status)) {
      return res.status(400).json({
        error: "Status must be PENDING, ACCEPTED, COMPLETED, or CANCELLED"
      });
    }

    const order = await prisma.order.update({
      where: {
        id: orderId
      },
      data: {
        status,
        cancelledAt: status === "CANCELLED" ? new Date() : undefined,
        acceptedAt: status === "ACCEPTED" ? new Date() : undefined,
        printedAt: status === "ACCEPTED" ? null : undefined
      },
      include: orderInclude()
    });

    sendOrder(res, 200, order);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    next(err);
  }
});

// PATCH /api/orders/:orderId/accept
// Accepts a pending order and leaves printedAt empty for receipt printing.
router.patch("/api/orders/:orderId/accept", requireOrderAccess(), async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!Number.isInteger(orderId)) {
      return res.status(400).json({
        error: "Order id must be a number"
      });
    }

    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });

    if (!existingOrder) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    // Capture the held authorization so the customer is charged on acceptance.
    const paymentStatus = await captureOrderPayment(existingOrder);

    const order = await prisma.order.update({
      where: {
        id: orderId
      },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        printedAt: null,
        cancelledAt: null,
        paymentStatus
      },
      include: orderInclude()
    });

    sendOrder(res, 200, order);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    next(err);
  }
});

// PATCH /api/orders/:orderId/decline
// Declines a pending order and records the cancellation time.
router.patch("/api/orders/:orderId/decline", requireOrderAccess(), async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!Number.isInteger(orderId)) {
      return res.status(400).json({
        error: "Order id must be a number"
      });
    }

    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });

    if (!existingOrder) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    // Void the held authorization so the customer is never charged.
    const paymentStatus = await voidOrderPayment(existingOrder);

    const order = await prisma.order.update({
      where: {
        id: orderId
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        paymentStatus
      },
      include: orderInclude()
    });

    sendOrder(res, 200, order);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    next(err);
  }
});

// PATCH /api/orders/:orderId/printed
// Marks an accepted order as printed after browser or external printing.
router.patch("/api/orders/:orderId/printed", requireOrderAccess(), async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!Number.isInteger(orderId)) {
      return res.status(400).json({
        error: "Order id must be a number"
      });
    }

    const order = await prisma.order.update({
      where: {
        id: orderId
      },
      data: {
        printedAt: new Date()
      },
      include: orderInclude()
    });

    sendOrder(res, 200, order);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    next(err);
  }
});

// GET /api/print-agent/restaurants/:restaurantId/orders
// Gives a future print agent the accepted orders that have not printed yet.
router.get("/api/print-agent/restaurants/:restaurantId/orders", requireRestaurantAccess("restaurantId"), async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);

    if (!Number.isInteger(restaurantId)) {
      return res.status(400).json({
        error: "Restaurant id must be a number"
      });
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: "ACCEPTED",
        printedAt: null,
        paymentStatus: "PAID"
      },
      include: orderInclude(),
      orderBy: {
        acceptedAt: "asc"
      }
    });

    res.json(orders.map((order) => ({
      ...order,
      subtotal: order.total
    })));
  } catch (err) {
    next(err);
  }
});

// GET /restaurants/:restaurantId/categories/:categoryId/menu-items
// Returns one category and only the menu items that belong to it.
router.get("/restaurants/:restaurantId/categories/:categoryId/menu-items", requirePlatformAdmin, async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const categoryId = Number(req.params.categoryId);

    if (!Number.isInteger(restaurantId) || !Number.isInteger(categoryId)) {
      return res.status(400).json({
        error: "Restaurant id and category id must be numbers"
      });
    }

    const category = await prisma.menuCategory.findFirst({
      where: {
        id: categoryId,
        restaurantId
      }
    });

    if (!category) {
      return res.status(404).json({
        error: "Category not found"
      });
    }

    const menuItems = await prisma.menuItem.findMany({
      where: {
        restaurantId,
        categoryId
      },
      include: {
        menuCategory: true,
        modifierGroupLinks: {
          include: {
            modifierGroup: {
              include: modifierGroupInclude()
            }
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    });

    res.json({
      category,
      menuItems
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /menu-items/:id
// Updates one menu item.
router.patch("/menu-items/:id", requirePlatformAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, description, imageUrl, category, categoryId, price, isAvailable } = req.body;

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Menu item id must be a number"
      });
    }

    if (!name || price === undefined) {
      return res.status(400).json({
        error: "Name and price are required"
      });
    }

    const existingMenuItem = await prisma.menuItem.findUnique({
      where: {
        id
      }
    });

    if (!existingMenuItem) {
      return res.status(404).json({
        error: "Menu item not found"
      });
    }

    const selectedCategoryId = categoryId ? Number(categoryId) : null;

    if (selectedCategoryId) {
      const menuCategory = await prisma.menuCategory.findFirst({
        where: {
          id: selectedCategoryId,
          restaurantId: existingMenuItem.restaurantId
        }
      });

      if (!menuCategory) {
        return res.status(400).json({
          error: "Category does not belong to this restaurant"
        });
      }
    }

    const menuItem = await prisma.menuItem.update({
      where: {
        id
      },
      data: {
        name,
        description,
        imageUrl,
        category,
        categoryId: selectedCategoryId,
        price,
        isAvailable
      },
      include: {
        menuCategory: true
      }
    });

    res.json(menuItem);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Menu item not found"
      });
    }

    next(err);
  }
});

// PATCH /menu-categories/:id
// Updates one menu category.
router.patch("/menu-categories/:id", requirePlatformAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, sortOrder } = req.body;

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Category id must be a number"
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "Category name is required"
      });
    }

    const category = await prisma.menuCategory.update({
      where: {
        id
      },
      data: {
        name,
        sortOrder: sortOrder === undefined ? 0 : Number(sortOrder)
      }
    });

    res.json(category);
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Category not found"
      });
    }

    if (err.code === "P2002") {
      return res.status(409).json({
        error: "That category already exists for this restaurant"
      });
    }

    next(err);
  }
});

// DELETE /menu-categories/:id
// Deletes one menu category and keeps its menu items uncategorized.
router.delete("/menu-categories/:id", requirePlatformAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Category id must be a number"
      });
    }

    const category = await prisma.menuCategory.delete({
      where: {
        id
      }
    });

    res.json({
      message: "Category deleted",
      category
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Category not found"
      });
    }

    next(err);
  }
});

// DELETE /menu-items/:id
// Deletes one menu item.
router.delete("/menu-items/:id", requirePlatformAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "Menu item id must be a number"
      });
    }

    const menuItem = await prisma.menuItem.delete({
      where: {
        id
      }
    });

    res.json({
      message: "Menu item deleted",
      menuItem
    });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Menu item not found"
      });
    }

    next(err);
  }
});

// GET /public/restaurants/:slug
// Returns one public restaurant and only menu items that are currently available.
router.get("/public/restaurants/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        slug
      },
      include: {
        categories: {
          orderBy: {
            sortOrder: "asc"
          }
        },
        menuItems: {
          where: {
            isAvailable: true
          },
          include: publicMenuItemInclude()
        }
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    restaurant.menuItems.sort((firstItem, secondItem) => {
      const firstOrder = firstItem.menuCategory?.sortOrder ?? 9999;
      const secondOrder = secondItem.menuCategory?.sortOrder ?? 9999;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      return firstItem.name.localeCompare(secondItem.name);
    });

    res.json(restaurant);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
