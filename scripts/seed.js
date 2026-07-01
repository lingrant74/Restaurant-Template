require("dotenv").config();

const db = require("../server/db/repositories");

// Seeds the sample "Joe's Pizza" restaurant used for local development and the
// Twilio voice demo. Idempotent: if the restaurant already exists we leave the
// existing data alone, so this is safe to run on every container start.
const sampleCategories = ["Appetizers", "Entrees", "Drinks", "Desserts", "Sides", "Specials"];

async function main() {
  const existing = await db.getRestaurantBySlugWithPublicMenu("joes-pizza");
  if (existing) {
    console.log("Seed skipped: Joe's Pizza already exists.");
    return;
  }

  const restaurant = await db.createRestaurant({
    name: "Joe's Pizza",
    slug: "joes-pizza",
    description: "Neighborhood pizza, fresh from the oven.",
    address: "123 Main St",
    phone: "555-123-4567",
    themeColor: "#d62828",
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || "+19313399781",
    aiHandoffMode: "WHEN_CUSTOMER_ASKS",
    maxFailedAttempts: 3,
    allowCustomerRequestHandoff: true,
    handoffPhoneNumber: process.env.HANDOFF_PHONE_NUMBER || null
  });

  const categoryByName = new Map();
  for (const [index, name] of sampleCategories.entries()) {
    const category = await db.createCategory({
      restaurantId: restaurant.id,
      name,
      sortOrder: index + 1
    });
    categoryByName.set(name, category);
  }

  const menuItemsData = [
    {
      name: "Cheese Pizza",
      description: "Classic cheese pizza with tomato sauce and mozzarella.",
      category: "Pizza",
      categoryId: categoryByName.get("Entrees").id,
      price: "12.99"
    },
    {
      name: "Pepperoni Pizza",
      description: "Mozzarella, tomato sauce, and crispy pepperoni.",
      category: "Pizza",
      categoryId: categoryByName.get("Entrees").id,
      price: "14.99"
    },
    {
      name: "Garlic Knots",
      description: "Warm knots brushed with garlic butter.",
      category: "Sides",
      categoryId: categoryByName.get("Sides").id,
      price: "5.99"
    },
    {
      name: "House Salad",
      description: "Mixed greens, tomatoes, cucumber, and house dressing.",
      category: "Salads",
      categoryId: categoryByName.get("Appetizers").id,
      price: "8.5"
    }
  ];

  const itemByName = new Map();
  for (const data of menuItemsData) {
    const menuItem = await db.createMenuItem({ ...data, isAvailable: true, restaurantId: restaurant.id });
    itemByName.set(data.name, menuItem);
  }

  // Modifier groups (mirrors prisma/seed.js) so the voice flow can be tested.
  const sizeGroup = await createGroupWithOptions(restaurant.id, {
    name: "Size",
    required: true,
    allowMultiple: false,
    minSelections: 1,
    maxSelections: 1,
    sort: 0,
    options: [
      { name: "Small", priceDelta: 0, sort: 0 },
      { name: "Medium", priceDelta: 2, sort: 1 },
      { name: "Large", priceDelta: 4, sort: 2 }
    ]
  });

  const toppingsGroup = await createGroupWithOptions(restaurant.id, {
    name: "Extra Toppings",
    required: false,
    allowMultiple: true,
    minSelections: 0,
    maxSelections: 5,
    sort: 1,
    options: [
      { name: "Extra Cheese", priceDelta: 1.5, sort: 0 },
      { name: "Mushrooms", priceDelta: 1, sort: 1 },
      { name: "Bacon", priceDelta: 2, sort: 2 },
      { name: "Onions", priceDelta: 0.75, sort: 3 },
      { name: "Peppers", priceDelta: 0.75, sort: 4 }
    ]
  });

  const dressingGroup = await createGroupWithOptions(restaurant.id, {
    name: "Dressing",
    required: true,
    allowMultiple: false,
    minSelections: 1,
    maxSelections: 1,
    sort: 0,
    options: [
      { name: "Ranch", priceDelta: 0, sort: 0 },
      { name: "Italian", priceDelta: 0, sort: 1 },
      { name: "Balsamic", priceDelta: 0, sort: 2 }
    ]
  });

  const pepperoni = itemByName.get("Pepperoni Pizza");
  const salad = itemByName.get("House Salad");

  if (pepperoni) {
    await db.setMenuItemModifierGroups(pepperoni.id, [sizeGroup.id, toppingsGroup.id]);
  }
  if (salad) {
    await db.setMenuItemModifierGroups(salad.id, [dressingGroup.id]);
  }

  console.log("Seeded Joe's Pizza with sample menu items and modifier groups.");
}

async function createGroupWithOptions(restaurantId, { options, ...groupData }) {
  const group = await db.createModifierGroup({ restaurantId, ...groupData });
  for (const option of options) {
    await db.createModifierOption({ modifierGroupId: group.id, ...option });
  }
  return group;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
