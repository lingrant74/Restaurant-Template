const {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand
} = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("./client");
const { NotFoundError } = require("./errors");
const { nowIso, toIsoIfDate } = require("./util");

// ── Generic single-item helpers ──────────────────────────────────────────────

async function getItem(TableName, Key) {
  const result = await docClient.send(new GetCommand({ TableName, Key }));
  return result.Item || null;
}

async function putItem(TableName, Item, options = {}) {
  await docClient.send(new PutCommand({ TableName, Item, ...options }));
  return Item;
}

// Deletes by key and returns the previous item (or null). When `requireExists`
// is set, a missing item throws NotFoundError so routes can return 404.
async function deleteItem(TableName, Key, { requireExists = false } = {}) {
  if (requireExists) {
    const pkName = Object.keys(Key)[0];
    try {
      const result = await docClient.send(
        new DeleteCommand({
          TableName,
          Key,
          ConditionExpression: "attribute_exists(#pk)",
          ExpressionAttributeNames: { "#pk": pkName },
          ReturnValues: "ALL_OLD"
        })
      );
      return result.Attributes || null;
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        throw new NotFoundError();
      }
      throw err;
    }
  }

  const result = await docClient.send(
    new DeleteCommand({ TableName, Key, ReturnValues: "ALL_OLD" })
  );
  return result.Attributes || null;
}

// Applies a partial update. Keys with `undefined` values are skipped (matching
// how Prisma ignored undefined), Date values become ISO strings, and updatedAt
// is refreshed automatically. Throws NotFoundError if the row does not exist.
async function updateItem(TableName, Key, data) {
  const pkName = Object.keys(Key)[0];
  const patch = { ...data, updatedAt: nowIso() };

  const names = { "#pk": pkName };
  const values = {};
  const sets = [];
  let index = 0;

  for (const [field, rawValue] of Object.entries(patch)) {
    if (rawValue === undefined) {
      continue;
    }
    const nameKey = `#f${index}`;
    const valueKey = `:v${index}`;
    names[nameKey] = field;
    values[valueKey] = toIsoIfDate(rawValue);
    sets.push(`${nameKey} = ${valueKey}`);
    index += 1;
  }

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName,
        Key,
        UpdateExpression: `SET ${sets.join(", ")}`,
        ConditionExpression: "attribute_exists(#pk)",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW"
      })
    );
    return result.Attributes;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      throw new NotFoundError();
    }
    throw err;
  }
}

// ── Collection helpers ───────────────────────────────────────────────────────

// Queries all items matching a single-attribute partition key on a GSI,
// following pagination to completion.
async function queryByIndex(TableName, IndexName, keyName, keyValue) {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName,
        IndexName,
        KeyConditionExpression: "#k = :v",
        ExpressionAttributeNames: { "#k": keyName },
        ExpressionAttributeValues: { ":v": keyValue },
        ExclusiveStartKey
      })
    );
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

// Scans an entire (small) table. The admin/menu tables here are tiny, so a full
// scan for "list all" operations is acceptable; sorting/filtering happens in JS.
async function scanAll(TableName) {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await docClient.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

module.exports = {
  getItem,
  putItem,
  deleteItem,
  updateItem,
  queryByIndex,
  scanAll
};
