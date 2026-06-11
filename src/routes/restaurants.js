const express = require("express");
const prisma = require("../prismaClient");

const router = express.Router();

const defaultCategoryNames = ["Appetizers", "Entrees", "Drinks", "Desserts", "Sides", "Specials"];
const orderStatuses = ["PENDING", "ACCEPTED", "READY", "COMPLETED", "CANCELLED"];

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

// POST /restaurants
// Creates a restaurant. The slug is public and should be URL-friendly, like "pasta-house".
router.post("/restaurants", async (req, res, next) => {
  try {
    const { name, slug, description, address, phone, themeColor } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "Name is required"
      });
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        slug: slug || createSlug(name),
        description,
        address,
        phone,
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

    res.status(201).json(restaurant);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "A restaurant with that slug already exists"
      });
    }

    next(err);
  }
});

// GET /restaurants
// Lists restaurants with a simple menu item count.
router.get("/restaurants", async (req, res, next) => {
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
router.get("/restaurants/:id", async (req, res, next) => {
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
router.post("/restaurants/:restaurantId/menu-items", async (req, res, next) => {
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
router.post("/restaurants/:restaurantId/categories", async (req, res, next) => {
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

// POST /api/restaurants/:restaurantId/orders
// Creates an order from cart items for one restaurant.
router.post(["/api/restaurants/:restaurantId/orders", "/restaurants/:restaurantId/orders"], async (req, res, next) => {
  try {
    const restaurantId = Number(req.params.restaurantId);
    const { customerName, customerPhone, customerEmail, notes, items } = req.body;

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

    const menuItemIds = items.map((item) => Number(item.menuItemId));
    const menuItems = await prisma.menuItem.findMany({
      where: {
        id: {
          in: menuItemIds
        },
        restaurantId,
        isAvailable: true
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
        return res.status(400).json({
          error: "Order includes an invalid or unavailable menu item"
        });
      }

      const price = Number(menuItem.price);
      total += price * quantity;

      orderItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity
      });
    }

    const order = await prisma.order.create({
      data: {
        customerName,
        customerPhone,
        customerEmail,
        notes,
        total: total.toFixed(2),
        restaurantId,
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
    next(err);
  }
});

// GET /api/restaurants/:restaurantId/orders
// Lists orders for one restaurant so the admin page can manage them.
router.get("/api/restaurants/:restaurantId/orders", async (req, res, next) => {
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
        restaurantId
      },
      include: {
        items: {
          orderBy: {
            id: "asc"
          }
        }
      },
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

// PATCH /api/orders/:orderId/status
// Updates an order status from the admin page.
router.patch("/api/orders/:orderId/status", async (req, res, next) => {
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
        error: "Status must be PENDING, ACCEPTED, READY, COMPLETED, or CANCELLED"
      });
    }

    const order = await prisma.order.update({
      where: {
        id: orderId
      },
      data: {
        status
      },
      include: {
        items: true
      }
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

// GET /restaurants/:restaurantId/categories/:categoryId/menu-items
// Returns one category and only the menu items that belong to it.
router.get("/restaurants/:restaurantId/categories/:categoryId/menu-items", async (req, res, next) => {
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
        menuCategory: true
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
router.patch("/menu-items/:id", async (req, res, next) => {
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
router.patch("/menu-categories/:id", async (req, res, next) => {
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
router.delete("/menu-categories/:id", async (req, res, next) => {
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
router.delete("/menu-items/:id", async (req, res, next) => {
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
          include: {
            menuCategory: true
          }
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
