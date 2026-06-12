# Restaurant Android Tablet App

Native Android tablet app for restaurant staff. It polls for online orders, shows a full-screen `NEW ORDER` alert, lets staff accept or decline orders, and prints accepted orders to a Wi-Fi/Ethernet ESC/POS kitchen printer over raw TCP.

This is a separate app. It does not replace or rewrite the existing website.

## What It Does

- Saves tablet setup locally with SharedPreferences.
- Supports mock mode so the UI and printer can be tested before backend routes are ready.
- Polls the backend every 3 seconds for pending orders.
- Shows a loud, flashing full-screen `NEW ORDER` overlay.
- Tapping the overlay opens that order detail screen.
- Accepting an order calls the backend and prints a kitchen ticket if printer settings are saved.
- Declining an order calls the backend and removes it from the pending flow.
- Sends ESC/POS bytes to `printerIp:printerPort`, default port `9100`.
- Keeps the tablet screen awake while the app is open.

## Open In Android Studio

1. Open Android Studio.
2. Choose `Open`.
3. Select this folder:

```text
/Users/newowner/PROJECTS/restaurant/android-tablet-app
```

4. Let Android Studio sync Gradle.
5. Connect an Android tablet or start an emulator.
6. Press `Run`.

Android Studio will download the Android Gradle plugin, Kotlin plugin, and Compose libraries on first sync.

## First Run

On the setup screen:

- Backend API URL: example `http://192.168.1.20:3000`
- Restaurant ID: example `1`
- Agent Token: temporary token used for `Authorization: Bearer ...`
- Mock mode: leave on if the backend routes are not built yet
- Printer IP: example `192.168.1.45`
- Printer Port: `9100`

Tap `Save Settings`.

## Test Without Backend

Leave `Use mock mode` checked.

The dashboard will show sample pending and accepted orders. You can:

- See the `NEW ORDER` alert
- Tap into order detail
- Accept or decline a mock order
- Add another mock order from the dashboard
- Open printer settings and send a test print

## Printer Test

Use a network ESC/POS printer.

Common settings:

```text
Printer IP: 192.168.1.45
Printer Port: 9100
```

The tablet and printer must be on the same network. If printing fails, verify:

- The printer IP address is correct
- Port `9100` is open
- The printer supports raw ESC/POS over TCP
- The Android tablet is on the same Wi-Fi/LAN

## Backend Routes To Implement Next

The app is currently wired to these routes:

```text
GET  /api/restaurant/:restaurantId/orders/pending
POST /api/orders/:orderId/accept
POST /api/orders/:orderId/decline
POST /api/orders/:orderId/printed
```

All requests send:

```text
Authorization: Bearer {agentToken}
```

Suggested response for `GET /api/restaurant/:restaurantId/orders/pending`:

```json
[
  {
    "id": 1001,
    "customerName": "Maya Chen",
    "customerPhone": "555-0101",
    "orderType": "Online",
    "fulfillmentType": "Pickup",
    "notes": "Please include extra napkins.",
    "status": "PENDING",
    "total": 32.75,
    "createdAt": "2026-06-12T12:05:00Z",
    "items": [
      {
        "name": "Spicy Tuna Roll",
        "quantity": 2,
        "price": 8.5,
        "finalPrice": 8.5,
        "selectedModifiers": [
          {
            "groupName": "Sauce",
            "optionName": "Spicy mayo"
          }
        ],
        "customerComment": ""
      }
    ]
  }
]
```

Suggested response for accept/decline routes:

Return the updated order object with the new status.

```json
{
  "id": 1001,
  "status": "ACCEPTED",
  "customerName": "Maya Chen",
  "customerPhone": "555-0101",
  "orderType": "Online",
  "fulfillmentType": "Pickup",
  "notes": "",
  "total": 32.75,
  "createdAt": "2026-06-12T12:05:00Z",
  "items": []
}
```

## Important Files

```text
settings.gradle.kts
build.gradle.kts
app/build.gradle.kts
app/src/main/AndroidManifest.xml
app/src/main/java/com/restaurant/tablet/MainActivity.kt
```
