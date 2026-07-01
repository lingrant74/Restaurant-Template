require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { authRouter } = require("./auth");
const { stripeWebhookHandler } = require("./payments");
const restaurantRoutes = require("./routes/restaurants");
const voiceRoutes = require("./routes/voice");
const vapiRoutes = require("./routes/vapi");
const printerRoutes = require("./routes/printers");

const app = express();
const port = process.env.PORT || 3000;

// The Stripe webhook must read the raw request body to verify the signature, so
// it is registered with express.raw BEFORE express.json parses bodies globally.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({
    message: "Restaurant platform API is running",
    routes: [
      "POST /restaurants",
      "GET /restaurants",
      "GET /restaurants/:id",
      "POST /api/auth/google",
      "GET /api/auth/me",
      "POST /api/auth/logout",
      "POST /restaurants/:restaurantId/menu-items",
      "POST /restaurants/:restaurantId/categories",
      "GET /api/restaurants/:restaurantId/users",
      "POST /api/restaurants/:restaurantId/users",
      "PATCH /api/restaurant-users/:userId",
      "DELETE /api/restaurant-users/:userId",
      "POST /api/restaurants/:restaurantId/orders",
      "POST /api/restaurants/:restaurantId/checkout-session",
      "GET /api/checkout-session/:sessionId/status",
      "POST /api/stripe/webhook",
      "GET /api/restaurants/:restaurantId/orders",
      "GET /api/restaurants/:restaurantId/live-orders-info",
      "PATCH /api/orders/:orderId/status",
      "PATCH /api/orders/:orderId/accept",
      "PATCH /api/orders/:orderId/decline",
      "PATCH /api/orders/:orderId/printed",
      "GET /api/print-agent/restaurants/:restaurantId/orders",
      "GET /api/restaurants/:restaurantId/modifier-groups",
      "POST /api/restaurants/:restaurantId/modifier-groups",
      "PATCH /api/modifier-groups/:groupId",
      "DELETE /api/modifier-groups/:groupId",
      "POST /api/modifier-groups/:groupId/options",
      "PATCH /api/modifier-options/:optionId",
      "DELETE /api/modifier-options/:optionId",
      "GET /api/menu-items/:menuItemId/modifier-groups",
      "PUT /api/menu-items/:menuItemId/modifier-groups",
      "GET /restaurants/:restaurantId/categories/:categoryId/menu-items",
      "PATCH /menu-items/:id",
      "DELETE /menu-items/:id",
      "PATCH /menu-categories/:id",
      "DELETE /menu-categories/:id",
      "GET /public/restaurants/:slug",
      "GET /health",
      "POST /api/voice/incoming",
      "POST /api/voice/process"
    ]
  });
});

app.use(authRouter);
app.use(restaurantRoutes);
app.use(voiceRoutes);
app.use(vapiRoutes);
app.use(printerRoutes);

// Keep errors readable while this project is still small.
app.use((err, req, res, next) => {
  console.error(err);

  // DynamoDB connectivity problems surface as networking errors from the SDK.
  if (err.name === "TimeoutError" || err.code === "ECONNREFUSED" || err.name === "UnrecognizedClientException") {
    return res.status(500).json({
      error: "Database connection failed. Make sure DynamoDB is reachable and the AWS settings in .env are correct."
    });
  }

  if (err.name === "ResourceNotFoundException") {
    return res.status(500).json({
      error: "Database tables are missing. Run: npm run db:create-tables"
    });
  }

  res.status(500).json({
    error: "Something went wrong"
  });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
