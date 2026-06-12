require("dotenv").config();

const express = require("express");
const { Prisma } = require("@prisma/client");
const cookieParser = require("cookie-parser");
const { authRouter } = require("./auth");
const restaurantRoutes = require("./routes/restaurants");

const app = express();
const port = process.env.PORT || 3000;

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
      "GET /public/restaurants/:slug"
    ]
  });
});

app.use(authRouter);
app.use(restaurantRoutes);

// Keep errors readable while this project is still small.
app.use((err, req, res, next) => {
  console.error(err);

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return res.status(500).json({
      error: "Database connection failed. Make sure PostgreSQL is running and DATABASE_URL in .env is correct."
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2021") {
      return res.status(500).json({
        error: "Database tables are missing. Run: npm run prisma:migrate -- --name init"
      });
    }
  }

  res.status(500).json({
    error: "Something went wrong"
  });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
