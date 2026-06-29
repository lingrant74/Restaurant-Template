const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const defaultCategories = ["Appetizers", "Entrees", "Drinks", "Desserts", "Sides", "Specials"];

async function main() {
  const restaurant = await prisma.restaurant.upsert({
    where: {
      slug: "joes-pizza"
    },
    update: {
      name: "Joe's Pizza",
      description: "Neighborhood pizza, fresh from the oven.",
      address: "123 Main St",
      phone: "555-123-4567",
      themeColor: "#d62828"
    },
    create: {
      name: "Joe's Pizza",
      slug: "joes-pizza",
      description: "Neighborhood pizza, fresh from the oven.",
      address: "123 Main St",
      phone: "555-123-4567",
      themeColor: "#d62828",
      categories: {
        create: defaultCategories.map((name, index) => ({
          name,
          sortOrder: index + 1
        }))
      }
    }
  });

  for (const [index, name] of defaultCategories.entries()) {
    await prisma.menuCategory.upsert({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name
        }
      },
      update: {
        sortOrder: index + 1
      },
      create: {
        restaurantId: restaurant.id,
        name,
        sortOrder: index + 1
      }
    });
  }

  const categories = await prisma.menuCategory.findMany({
    where: {
      restaurantId: restaurant.id
    }
  });
  const categoryByName = new Map(categories.map((category) => [category.name, category]));

  // Keep this sample seed repeatable by replacing Joe's menu with the known sample items.
  await prisma.menuItem.deleteMany({
    where: {
      restaurantId: restaurant.id
    }
  });

  await prisma.menuItem.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        name: "Cheese Pizza",
        description: "Classic cheese pizza with tomato sauce and mozzarella.",
        category: "Pizza",
        categoryId: categoryByName.get("Entrees").id,
        price: "12.99",
        isAvailable: true
      },
      {
        restaurantId: restaurant.id,
        name: "Pepperoni Pizza",
        description: "Mozzarella, tomato sauce, and crispy pepperoni.",
        category: "Pizza",
        categoryId: categoryByName.get("Entrees").id,
        price: "14.99",
        isAvailable: true
      },
      {
        restaurantId: restaurant.id,
        name: "Garlic Knots",
        description: "Warm knots brushed with garlic butter.",
        category: "Sides",
        categoryId: categoryByName.get("Sides").id,
        price: "5.99",
        isAvailable: true
      },
      {
        restaurantId: restaurant.id,
        name: "House Salad",
        description: "Mixed greens, tomatoes, cucumber, and house dressing.",
        category: "Salads",
        categoryId: categoryByName.get("Appetizers").id,
        price: "8.5",
        isAvailable: true
      }
    ]
  });

  // Create modifier groups for testing voice ordering with modifiers.
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id },
  });
  const itemByName = new Map(menuItems.map((item) => [item.name, item]));

  // Size modifier group (required for Pepperoni Pizza)
  const sizeGroup = await prisma.modifierGroup.upsert({
    where: { restaurantId_name: { restaurantId: restaurant.id, name: "Size" } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: "Size",
      required: true,
      allowMultiple: false,
      minSelections: 1,
      maxSelections: 1,
      sort: 0,
      options: {
        create: [
          { name: "Small", priceDelta: 0, sort: 0 },
          { name: "Medium", priceDelta: 2, sort: 1 },
          { name: "Large", priceDelta: 4, sort: 2 },
        ],
      },
    },
  });

  // Toppings modifier group (optional for Pepperoni Pizza)
  const toppingsGroup = await prisma.modifierGroup.upsert({
    where: { restaurantId_name: { restaurantId: restaurant.id, name: "Extra Toppings" } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: "Extra Toppings",
      required: false,
      allowMultiple: true,
      minSelections: 0,
      maxSelections: 5,
      sort: 1,
      options: {
        create: [
          { name: "Extra Cheese", priceDelta: 1.5, sort: 0 },
          { name: "Mushrooms", priceDelta: 1, sort: 1 },
          { name: "Bacon", priceDelta: 2, sort: 2 },
          { name: "Onions", priceDelta: 0.75, sort: 3 },
          { name: "Peppers", priceDelta: 0.75, sort: 4 },
        ],
      },
    },
  });

  // Dressing modifier group (required for House Salad)
  const dressingGroup = await prisma.modifierGroup.upsert({
    where: { restaurantId_name: { restaurantId: restaurant.id, name: "Dressing" } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: "Dressing",
      required: true,
      allowMultiple: false,
      minSelections: 1,
      maxSelections: 1,
      sort: 0,
      options: {
        create: [
          { name: "Ranch", priceDelta: 0, sort: 0 },
          { name: "Italian", priceDelta: 0, sort: 1 },
          { name: "Balsamic", priceDelta: 0, sort: 2 },
        ],
      },
    },
  });

  // Link modifier groups to menu items.
  const pepperoni = itemByName.get("Pepperoni Pizza");
  const salad = itemByName.get("House Salad");

  if (pepperoni) {
    await prisma.menuItemModifierGroup.upsert({
      where: { menuItemId_modifierGroupId: { menuItemId: pepperoni.id, modifierGroupId: sizeGroup.id } },
      update: {},
      create: { menuItemId: pepperoni.id, modifierGroupId: sizeGroup.id },
    });
    await prisma.menuItemModifierGroup.upsert({
      where: { menuItemId_modifierGroupId: { menuItemId: pepperoni.id, modifierGroupId: toppingsGroup.id } },
      update: {},
      create: { menuItemId: pepperoni.id, modifierGroupId: toppingsGroup.id },
    });
  }

  if (salad) {
    await prisma.menuItemModifierGroup.upsert({
      where: { menuItemId_modifierGroupId: { menuItemId: salad.id, modifierGroupId: dressingGroup.id } },
      update: {},
      create: { menuItemId: salad.id, modifierGroupId: dressingGroup.id },
    });
  }

  console.log("Seeded Joe's Pizza with sample menu items and modifier groups.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
