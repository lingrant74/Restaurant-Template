# Restaurant Android Tablet App

Native Android tablet app for restaurant staff. The dashboard is designed to match the website live-orders UI: large `LIVE ORDERS` header, hamburger button, sound alert button, status filters, online menu link card, and horizontal kitchen-ticket style order cards.

This app is separate from the website. It lives in `android` and does not replace the React/Vite frontend.

## Local Backend URL

Do not use `localhost` inside the Android emulator.

If the backend is running on your Mac on port `3000`, use:

```text
http://10.0.2.2:3000
```

For restaurant `1`, the local dev token is:

```text
dev-tablet-token
```

That token is configured in the root `.env` as:

```text
TABLET_AGENT_TOKENS=1:dev-tablet-token
```

Restart the backend after changing `.env`.

## Backend Routes Used

The app now uses the same live-order route names as the website backend:

```text
GET   /api/restaurants/:restaurantId/live-orders-info
GET   /api/restaurants/:restaurantId/orders
PATCH /api/orders/:orderId/accept
PATCH /api/orders/:orderId/decline
PATCH /api/orders/:orderId/printed
```

Every request sends:

```text
Authorization: Bearer {agentToken}
```

## What It Does

- Saves tablet setup locally with SharedPreferences.
- Defaults API URL to `http://10.0.2.2:3000`.
- Polls backend orders every 3 seconds.
- Shows all orders from the backend and filters locally:
  - All
  - Pending
  - In Progress
  - Completed
  - Cancelled
- Shows the website-style full-screen `NEW ORDER` alert for unseen pending orders.
- Tapping the alert opens that order detail view.
- Accept/Decline calls the backend status routes.
- Accepted orders can print through the ESC/POS TCP printer flow.
- Keeps the tablet screen awake while open.
- Keeps `Add Mock Order` only when debug mock mode is enabled.

## Open In Android Studio

1. Open Android Studio.
2. Choose `Open`.
3. Select:

```text
/Users/newowner/PROJECTS/restaurant/android
```

4. Let Android Studio sync Gradle.
5. Run the app on an Android tablet or emulator.

## First Run Settings

Use:

```text
Backend API URL: http://10.0.2.2:3000
Restaurant ID: 1
Agent Token: dev-tablet-token
Mock mode: off
Printer IP: 192.168.1.45
Printer Port: 9100
```

If the backend is not running yet, turn on `Debug mock mode`.

## Printer Test

Use a network ESC/POS printer:

```text
Printer IP: 192.168.1.45
Printer Port: 9100
```

The tablet and printer must be on the same network. The app sends raw ESC/POS bytes over TCP and includes a paper cut command.

## Build From Terminal

```bash
cd /Users/newowner/PROJECTS/restaurant/android
./gradlew :app:assembleDebug
```

The debug APK is created at:

```text
app/build/outputs/apk/debug/app-debug.apk
```
