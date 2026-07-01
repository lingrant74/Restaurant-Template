const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

// A single DynamoDB client/document client is shared across the app.
//
// - For local development we point at DynamoDB Local via DYNAMODB_ENDPOINT
//   (e.g. http://dynamodb-local:8000) and use throwaway credentials.
// - In real AWS, leave DYNAMODB_ENDPOINT unset and let the SDK resolve the
//   region and credentials from the environment / instance role.
const region = process.env.AWS_REGION || "us-east-1";
const endpoint = process.env.DYNAMODB_ENDPOINT || undefined;

const baseClient = new DynamoDBClient({
  region,
  ...(endpoint ? { endpoint } : {})
});

// The document client maps plain JS objects to DynamoDB attribute values.
const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    // Treat `undefined` as "do not write this attribute" instead of erroring.
    removeUndefinedValues: true,
    convertClassInstanceToMap: true
  }
});

// Optional prefix so several environments can share one AWS account.
const prefix = process.env.DYNAMODB_TABLE_PREFIX || "";

const TABLES = {
  restaurant: `${prefix}Restaurant`,
  restaurantUser: `${prefix}RestaurantUser`,
  menuCategory: `${prefix}MenuCategory`,
  menuItem: `${prefix}MenuItem`,
  modifierGroup: `${prefix}ModifierGroup`,
  modifierOption: `${prefix}ModifierOption`,
  menuItemModifierGroup: `${prefix}MenuItemModifierGroup`,
  order: `${prefix}Order`,
  printer: `${prefix}Printer`,
  printerCategory: `${prefix}PrinterCategory`,
  counters: `${prefix}Counters`
};

module.exports = { baseClient, docClient, TABLES };
