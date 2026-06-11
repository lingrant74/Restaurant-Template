# Restaurant Platform Backend

Simple Node.js, Express, Prisma, and PostgreSQL backend for restaurants and menu items.

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start PostgreSQL with Docker:

   ```bash
   docker compose up -d
   ```

3. Check `.env` and update `DATABASE_URL` if your PostgreSQL username or password is different.

4. Create the database tables:

   ```bash
   npm run prisma:migrate -- --name init
   ```

5. Start the API server:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000` to check that the API is running.

## Run the React frontend

Start the API and React app together:

```bash
npm run dev:all
```

Then open a public restaurant page:

```text
http://localhost:5173/joes-pizza
```

The React page reads the slug from the URL, calls the API route at `/public/restaurants/:slug`, and displays the restaurant details plus available menu items.

## Test requests

Create a restaurant:

```bash
curl -X POST http://localhost:3000/restaurants \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Joe's Pizza\",\"slug\":\"joes-pizza\",\"address\":\"123 Main St\"}"
```

List restaurants:

```bash
curl http://localhost:3000/restaurants
```

Add a menu item to restaurant `1`:

```bash
curl -X POST http://localhost:3000/restaurants/1/menu-items \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Cheese Pizza\",\"description\":\"Classic cheese pizza\",\"price\":\"12.99\"}"
```

View the public restaurant page data:

```bash
curl http://localhost:3000/public/restaurants/joes-pizza
```
