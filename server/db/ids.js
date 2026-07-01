const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient, TABLES } = require("./client");

// Preserves Prisma's integer auto-increment ids. Each entity has one counter
// row in the Counters table; an atomic ADD hands out the next id. Integer ids
// are part of the public API contract (e.g. /restaurants/1, the Android tablet
// config, VOICE_RESTAURANT_ID, and "restaurantId:token" tablet tokens), so we
// keep them rather than switching to UUIDs.
async function nextId(counterName) {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.counters,
      Key: { name: counterName },
      UpdateExpression: "ADD #value :one",
      ExpressionAttributeNames: { "#value": "value" },
      ExpressionAttributeValues: { ":one": 1 },
      ReturnValues: "UPDATED_NEW"
    })
  );

  return result.Attributes.value;
}

module.exports = { nextId };
