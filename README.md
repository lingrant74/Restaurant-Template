# Restaurant Platform

A full-stack restaurant ordering platform with a Node.js/Express backend, React frontend, and Android tablet app for staff.

---

## Backend

Node.js, Express, Prisma, and PostgreSQL API server.

**Location:** `server/`

### Setup

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

### Test Requests

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

### Twilio Voice Test Setup

This lets you call a Twilio phone number and hear a restaurant AI greeting. The backend listens to the caller's speech and logs what they said.

#### 1. Run the backend locally

```bash
npm run dev
```

The server starts at `http://localhost:3000`.

#### 2. Expose your local server with ngrok

In a separate terminal:

```bash
ngrok http 3000
```

ngrok will give you a public URL like:

```
https://abc123.ngrok-free.app
```

#### 3. Configure Twilio

1. Go to the [Twilio Console](https://console.twilio.com/).
2. Navigate to: **Phone Numbers → Manage → Active Numbers**.
3. Click your phone number.
4. Scroll to **Voice Configuration**.
5. Set:
   - **A call comes in:** Webhook
   - **URL:** `https://YOUR-NGROK-URL.ngrok-free.app/api/voice/incoming`
   - **Method:** POST
6. Click **Save configuration**.

#### 4. Test it

Call your Twilio phone number from any phone.

**Expected result:**
- You hear: *"Hello. Welcome to the restaurant AI assistant. What would you like to order?"*
- Say something (e.g., "I'd like a large pepperoni pizza").
- The phone repeats back what you said and asks "What else would you like?"
- Your backend terminal logs the caller's phone number, what they said, and the confidence score.

#### 5. Troubleshooting

- Make sure ngrok is running and the URL in Twilio matches the one ngrok shows.
- Check that the backend is running (`npm run dev`) before calling.
- Look at the Twilio Console **Debugger** for error details if the call fails.

---

## Frontend

React + Vite single-page app for customers and restaurant owners.

**Location:** `client/`

### Setup

Start the API and React app together:

```bash
npm run dev:all
```

Or run the frontend on its own:

```bash
cd client
npm install
npm run dev
```

Then open a public restaurant page:

```
http://localhost:5173/joes-pizza
```

The React page reads the slug from the URL, calls the API route at `/public/restaurants/:slug`, and displays the restaurant details plus available menu items.

---

## Android Tablet App

Native Android tablet app for restaurant staff. Shows live orders, accepts/declines them, and prints receipts via ESC/POS over TCP.

**Location:** `android/`

### Setup

1. Open Android Studio.
2. Choose **Open**.
3. Select the `android` folder.
4. Let Android Studio sync Gradle.
5. Run the app on an Android tablet or emulator.

### Local Backend URL

Do not use `localhost` inside the Android emulator. If the backend is running on your Mac on port `3000`, use:

```
http://10.0.2.2:3000
```

### First Run Settings

```
Backend API URL: http://10.0.2.2:3000
Restaurant ID: 1
Agent Token: dev-tablet-token
Mock mode: off
Printer IP: 192.168.1.45
Printer Port: 9100
```

The dev token is configured in the root `.env` as:

```
TABLET_AGENT_TOKENS=1:dev-tablet-token
```

Restart the backend after changing `.env`. If the backend is not running yet, turn on **Debug mock mode**.

### Backend Routes Used

```
GET   /api/restaurants/:restaurantId/live-orders-info
GET   /api/restaurants/:restaurantId/orders
PATCH /api/orders/:orderId/accept
PATCH /api/orders/:orderId/decline
PATCH /api/orders/:orderId/printed
```

Every request sends: `Authorization: Bearer {agentToken}`

### Build From Terminal

```bash
cd android-tablet-app
./gradlew :app:assembleDebug
```

The debug APK is created at:

```
app/build/outputs/apk/debug/app-debug.apk
```

### Printer

Use a network ESC/POS printer. The tablet and printer must be on the same network. The app sends raw ESC/POS bytes over TCP and includes a paper cut command.
