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

  console.log("Seeded Joe's Pizza with sample menu items.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
