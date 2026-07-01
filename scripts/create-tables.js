require("dotenv").config();

const {
  CreateTableCommand,
  ListTablesCommand,
  ResourceInUseException
} = require("@aws-sdk/client-dynamodb");
const { baseClient } = require("../server/db/client");
const { TABLE_DEFINITIONS, toCreateTableInput } = require("../server/db/tables");

// Waits for DynamoDB to accept connections. DynamoDB Local takes a moment to
// start inside Docker, so retry ListTables a few times before giving up.
async function waitForDynamo(attempts = 30, delayMs = 1000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await baseClient.send(new ListTablesCommand({}));
      return;
    } catch (err) {
      if (attempt === attempts) {
        throw err;
      }
      console.log(`[create-tables] DynamoDB not ready yet (attempt ${attempt}/${attempts}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  await waitForDynamo();

  for (const definition of TABLE_DEFINITIONS) {
    try {
      await baseClient.send(new CreateTableCommand(toCreateTableInput(definition)));
      console.log(`[create-tables] Created ${definition.TableName}`);
    } catch (err) {
      if (err instanceof ResourceInUseException || err.name === "ResourceInUseException") {
        console.log(`[create-tables] ${definition.TableName} already exists, skipping`);
      } else {
        throw err;
      }
    }
  }

  console.log("[create-tables] Done.");
}

main().catch((err) => {
  console.error("[create-tables] Failed:", err);
  process.exit(1);
});
