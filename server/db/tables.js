const { TABLES } = require("./client");

// Table + index definitions used by scripts/create-tables.js.
//
// Design notes (multi-table, one table per entity):
//   - Primary key is the integer `id` for every entity except the
//     MenuItemModifierGroup join table, whose key is a deterministic
//     "menuItemId#modifierGroupId" string. That makes the link unique and its
//     creation idempotent (re-linking just overwrites), replacing Prisma's
//     @@unique([menuItemId, modifierGroupId]) + skipDuplicates.
//   - GSIs cover the "list children by parent" and unique-lookup access
//     patterns (slug, twilioPhoneNumber, email). Uniqueness on those secondary
//     keys is enforced in the repository layer with a read-before-write check.
//   - Billing is on-demand (PAY_PER_REQUEST), which DynamoDB Local accepts and
//     which needs no capacity planning in real AWS for this workload.

function gsi(indexName, keyName, keyType = "N") {
  return {
    indexName,
    keyName,
    keyType
  };
}

const TABLE_DEFINITIONS = [
  {
    TableName: TABLES.restaurant,
    hashKey: { name: "id", type: "N" },
    indexes: [gsi("slug-index", "slug", "S"), gsi("twilioPhoneNumber-index", "twilioPhoneNumber", "S")]
  },
  {
    TableName: TABLES.restaurantUser,
    hashKey: { name: "id", type: "N" },
    indexes: [gsi("email-index", "email", "S"), gsi("restaurantId-index", "restaurantId", "N")]
  },
  {
    TableName: TABLES.menuCategory,
    hashKey: { name: "id", type: "N" },
    indexes: [gsi("restaurantId-index", "restaurantId", "N")]
  },
  {
    TableName: TABLES.menuItem,
    hashKey: { name: "id", type: "N" },
    indexes: [gsi("restaurantId-index", "restaurantId", "N")]
  },
  {
    TableName: TABLES.modifierGroup,
    hashKey: { name: "id", type: "N" },
    indexes: [gsi("restaurantId-index", "restaurantId", "N")]
  },
  {
    TableName: TABLES.modifierOption,
    hashKey: { name: "id", type: "N" },
    indexes: [gsi("modifierGroupId-index", "modifierGroupId", "N")]
  },
  {
    TableName: TABLES.menuItemModifierGroup,
    hashKey: { name: "linkKey", type: "S" },
    indexes: [gsi("menuItemId-index", "menuItemId", "N"), gsi("modifierGroupId-index", "modifierGroupId", "N")]
  },
  {
    TableName: TABLES.order,
    hashKey: { name: "id", type: "N" },
    indexes: [gsi("restaurantId-index", "restaurantId", "N")]
  },
  {
    TableName: TABLES.counters,
    hashKey: { name: "name", type: "S" },
    indexes: []
  }
];

// Expands the compact definition above into a CreateTable command input.
function toCreateTableInput(def) {
  const attributeDefinitions = [{ AttributeName: def.hashKey.name, AttributeType: def.hashKey.type }];

  for (const index of def.indexes) {
    if (!attributeDefinitions.some((a) => a.AttributeName === index.keyName)) {
      attributeDefinitions.push({ AttributeName: index.keyName, AttributeType: index.keyType });
    }
  }

  const input = {
    TableName: def.TableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: attributeDefinitions,
    KeySchema: [{ AttributeName: def.hashKey.name, KeyType: "HASH" }]
  };

  if (def.indexes.length > 0) {
    input.GlobalSecondaryIndexes = def.indexes.map((index) => ({
      IndexName: index.indexName,
      KeySchema: [{ AttributeName: index.keyName, KeyType: "HASH" }],
      Projection: { ProjectionType: "ALL" }
    }));
  }

  return input;
}

module.exports = { TABLE_DEFINITIONS, toCreateTableInput };
