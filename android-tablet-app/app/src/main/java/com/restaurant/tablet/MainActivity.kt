package com.restaurant.tablet

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContent {
            MaterialTheme {
                RestaurantTabletApp()
            }
        }
    }
}

private enum class Screen {
    Setup,
    Dashboard,
    Printer
}

private data class AppSettings(
    val apiUrl: String = "",
    val restaurantId: String = "",
    val agentToken: String = "",
    val mockMode: Boolean = true,
    val printerIp: String = "",
    val printerPort: String = "9100"
) {
    fun canOpenDashboard(): Boolean {
        return mockMode || (apiUrl.isNotBlank() && restaurantId.isNotBlank() && agentToken.isNotBlank())
    }
}

private data class Order(
    val id: String,
    val customerName: String,
    val customerPhone: String,
    val orderType: String,
    val fulfillmentType: String,
    val notes: String,
    val status: String,
    val total: Double,
    val createdAt: String,
    val items: List<OrderItem>
)

private data class OrderItem(
    val name: String,
    val quantity: Int,
    val price: Double,
    val modifiers: List<String>,
    val notes: String
)

@Composable
private fun RestaurantTabletApp() {
    val context = LocalContext.current
    val settingsStore = remember { SettingsStore(context) }
    val toneGenerator = remember { ToneGenerator(AudioManager.STREAM_ALARM, 100) }
    val scope = rememberCoroutineScope()

    var settings by remember { mutableStateOf(settingsStore.load()) }
    var screen by remember { mutableStateOf(if (settings.canOpenDashboard()) Screen.Dashboard else Screen.Setup) }
    var orders by remember { mutableStateOf(if (settings.mockMode) sampleOrders() else emptyList()) }
    var selectedOrder by remember { mutableStateOf<Order?>(null) }
    var alertOrder by remember { mutableStateOf<Order?>(null) }
    var viewedPendingIds by remember { mutableStateOf(setOf<String>()) }
    var statusMessage by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf("") }

    DisposableEffect(Unit) {
        onDispose {
            toneGenerator.release()
        }
    }

    suspend fun refreshOrders(quiet: Boolean = false) {
        try {
            if (!quiet) {
                statusMessage = "Refreshing orders..."
            }

            val freshOrders = if (settings.mockMode) {
                mergeOrders(sampleOrders(), orders)
            } else {
                mergeOrders(ApiClient(settings).fetchPendingOrders(), orders)
            }

            orders = freshOrders.sortedByDescending { it.createdAt }
            statusMessage = if (quiet) statusMessage else "Orders updated."
            errorMessage = ""
        } catch (err: Exception) {
            errorMessage = "Could not load orders: ${err.message}"
        }
    }

    LaunchedEffect(screen, settings) {
        if (screen != Screen.Dashboard || !settings.canOpenDashboard()) {
            return@LaunchedEffect
        }

        refreshOrders()

        while (true) {
            delay(3_000)
            refreshOrders(quiet = true)
        }
    }

    LaunchedEffect(orders, selectedOrder, viewedPendingIds) {
        if (selectedOrder != null || alertOrder != null) {
            return@LaunchedEffect
        }

        val nextPending = orders
            .filter { it.status == "PENDING" && !viewedPendingIds.contains(it.id) }
            .minByOrNull { it.createdAt }

        if (nextPending != null) {
            alertOrder = nextPending
        }
    }

    LaunchedEffect(alertOrder?.id) {
        if (alertOrder == null) {
            return@LaunchedEffect
        }

        while (true) {
            toneGenerator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 700)
            delay(1_250)
        }
    }

    fun saveSettings(newSettings: AppSettings) {
        settingsStore.save(newSettings)
        settings = newSettings
        orders = if (newSettings.mockMode) sampleOrders() else emptyList()
        selectedOrder = null
        alertOrder = null
        viewedPendingIds = emptySet()
        statusMessage = "Settings saved."
        screen = if (newSettings.canOpenDashboard()) Screen.Dashboard else Screen.Setup
    }

    fun acceptOrder(order: Order) {
        scope.launch {
            try {
                statusMessage = "Accepting order #${order.id}..."

                val acceptedOrder = if (settings.mockMode) {
                    order.copy(status = "ACCEPTED")
                } else {
                    ApiClient(settings).acceptOrder(order.id)
                }

                orders = updateOrderInList(orders, acceptedOrder)
                selectedOrder = null
                alertOrder = null
                viewedPendingIds = viewedPendingIds + order.id
                statusMessage = "Accepted order #${order.id}."

                if (settings.printerIp.isNotBlank()) {
                    try {
                        EscPosPrinter.printKitchenTicket(settings, acceptedOrder)
                        if (!settings.mockMode) {
                            ApiClient(settings).markPrinted(order.id)
                        }
                        statusMessage = "Accepted and printed order #${order.id}."
                    } catch (printerError: Exception) {
                        statusMessage = "Accepted order #${order.id}, but printing failed: ${printerError.message}"
                    }
                }
            } catch (err: Exception) {
                errorMessage = "Could not accept order: ${err.message}"
            }
        }
    }

    fun declineOrder(order: Order) {
        scope.launch {
            try {
                statusMessage = "Declining order #${order.id}..."

                val declinedOrder = if (settings.mockMode) {
                    order.copy(status = "CANCELLED")
                } else {
                    ApiClient(settings).declineOrder(order.id)
                }

                orders = updateOrderInList(orders, declinedOrder)
                selectedOrder = null
                alertOrder = null
                viewedPendingIds = viewedPendingIds + order.id
                statusMessage = "Declined order #${order.id}."
            } catch (err: Exception) {
                errorMessage = "Could not decline order: ${err.message}"
            }
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFFF3F6F8)) {
        when (screen) {
            Screen.Setup -> SetupScreen(
                settings = settings,
                statusMessage = statusMessage,
                errorMessage = errorMessage,
                onSave = ::saveSettings,
                onOpenDashboard = {
                    if (settings.canOpenDashboard()) {
                        screen = Screen.Dashboard
                    } else {
                        errorMessage = "Add API settings or turn on mock mode first."
                    }
                },
                onOpenPrinter = { screen = Screen.Printer }
            )

            Screen.Printer -> PrinterSettingsScreen(
                settings = settings,
                statusMessage = statusMessage,
                errorMessage = errorMessage,
                onSave = ::saveSettings,
                onBack = { screen = Screen.Dashboard },
                onTestPrint = {
                    scope.launch {
                        try {
                            EscPosPrinter.testPrint(settings)
                            statusMessage = "Test print sent."
                            errorMessage = ""
                        } catch (err: Exception) {
                            errorMessage = "Printer test failed: ${err.message}"
                        }
                    }
                }
            )

            Screen.Dashboard -> DashboardScreen(
                settings = settings,
                orders = orders,
                selectedOrder = selectedOrder,
                statusMessage = statusMessage,
                errorMessage = errorMessage,
                onRefresh = { scope.launch { refreshOrders() } },
                onOpenSetup = { screen = Screen.Setup },
                onOpenPrinter = { screen = Screen.Printer },
                onOpenOrder = {
                    viewedPendingIds = viewedPendingIds + it.id
                    selectedOrder = it
                    alertOrder = null
                },
                onBackFromOrder = { selectedOrder = null },
                onAccept = ::acceptOrder,
                onDecline = ::declineOrder,
                onAddMockOrder = {
                    orders = listOf(newMockOrder(orders.size + 1)) + orders
                }
            )
        }

        val currentAlertOrder = alertOrder
        if (currentAlertOrder != null) {
            NewOrderOverlay(
                pendingCount = orders.count { it.status == "PENDING" && !viewedPendingIds.contains(it.id) },
                onTap = {
                    viewedPendingIds = viewedPendingIds + currentAlertOrder.id
                    selectedOrder = currentAlertOrder
                    alertOrder = null
                }
            )
        }
    }
}

@Composable
private fun SetupScreen(
    settings: AppSettings,
    statusMessage: String,
    errorMessage: String,
    onSave: (AppSettings) -> Unit,
    onOpenDashboard: () -> Unit,
    onOpenPrinter: () -> Unit
) {
    var apiUrl by remember(settings) { mutableStateOf(settings.apiUrl) }
    var restaurantId by remember(settings) { mutableStateOf(settings.restaurantId) }
    var agentToken by remember(settings) { mutableStateOf(settings.agentToken) }
    var mockMode by remember(settings) { mutableStateOf(settings.mockMode) }
    var printerIp by remember(settings) { mutableStateOf(settings.printerIp) }
    var printerPort by remember(settings) { mutableStateOf(settings.printerPort) }

    PageShell(scroll = false) {
        Text("Restaurant Tablet Setup", fontSize = 34.sp, fontWeight = FontWeight.Black)
        Text("Save the backend and restaurant settings for this tablet.", color = Color(0xFF526173), fontWeight = FontWeight.Bold)
        MessageBlock(statusMessage, errorMessage)

        CardPanel {
            OutlinedTextField(value = apiUrl, onValueChange = { apiUrl = it }, label = { Text("Backend API URL") }, placeholder = { Text("http://192.168.1.20:3000") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = restaurantId, onValueChange = { restaurantId = it }, label = { Text("Restaurant ID") }, placeholder = { Text("1") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = agentToken, onValueChange = { agentToken = it }, label = { Text("Agent Token") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = printerIp, onValueChange = { printerIp = it }, label = { Text("Printer IP Address") }, placeholder = { Text("192.168.1.45") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = printerPort, onValueChange = { printerPort = it }, label = { Text("Printer Port") }, placeholder = { Text("9100") }, modifier = Modifier.fillMaxWidth())

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = mockMode, onCheckedChange = { mockMode = it })
                Text("Use mock mode while backend routes are not ready", fontWeight = FontWeight.Bold)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PrimaryButton("Save Settings") {
                    onSave(AppSettings(apiUrl, restaurantId, agentToken, mockMode, printerIp, printerPort.ifBlank { "9100" }))
                }
                SecondaryButton("Open Dashboard", onOpenDashboard)
                SecondaryButton("Printer Settings", onOpenPrinter)
            }
        }
    }
}

@Composable
private fun DashboardScreen(
    settings: AppSettings,
    orders: List<Order>,
    selectedOrder: Order?,
    statusMessage: String,
    errorMessage: String,
    onRefresh: () -> Unit,
    onOpenSetup: () -> Unit,
    onOpenPrinter: () -> Unit,
    onOpenOrder: (Order) -> Unit,
    onBackFromOrder: () -> Unit,
    onAccept: (Order) -> Unit,
    onDecline: (Order) -> Unit,
    onAddMockOrder: () -> Unit
) {
    val pendingOrders = orders.filter { it.status == "PENDING" }
    val acceptedOrders = orders.filter { it.status == "ACCEPTED" }

    if (selectedOrder != null) {
        OrderDetailScreen(
            order = selectedOrder,
            onBack = onBackFromOrder,
            onAccept = { onAccept(selectedOrder) },
            onDecline = { onDecline(selectedOrder) }
        )
        return
    }

    PageShell(scroll = false) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Live Orders", fontSize = 38.sp, fontWeight = FontWeight.Black)
                Text("Restaurant ${settings.restaurantId.ifBlank { "mock" }} - refreshes every 3 seconds", color = Color(0xFF526173), fontWeight = FontWeight.Bold)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (settings.mockMode) {
                    SecondaryButton("Add Mock Order", onAddMockOrder)
                }
                SecondaryButton("Refresh", onRefresh)
                SecondaryButton("Printer", onOpenPrinter)
                SecondaryButton("Setup", onOpenSetup)
            }
        }

        MessageBlock(statusMessage, errorMessage)

        Row(modifier = Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            OrderColumn(
                title = "Pending",
                orders = pendingOrders,
                modifier = Modifier.weight(1f),
                accentColor = Color(0xFFF59E0B),
                onOpenOrder = onOpenOrder
            )

            OrderColumn(
                title = "Accepted / Ready",
                orders = acceptedOrders,
                modifier = Modifier.weight(1f),
                accentColor = Color(0xFF0F766E),
                onOpenOrder = onOpenOrder
            )
        }
    }
}

@Composable
private fun OrderColumn(
    title: String,
    orders: List<Order>,
    modifier: Modifier,
    accentColor: Color,
    onOpenOrder: (Order) -> Unit
) {
    Card(
        modifier = modifier.fillMaxHeight(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(14.dp).background(accentColor, RoundedCornerShape(20.dp)))
                Spacer(Modifier.width(10.dp))
                Text("$title (${orders.size})", fontSize = 24.sp, fontWeight = FontWeight.Black)
            }

            if (orders.isEmpty()) {
                Text("No orders here.", color = Color(0xFF6B7280), fontWeight = FontWeight.Bold)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(orders) { order ->
                        OrderListCard(order = order, onClick = { onOpenOrder(order) })
                    }
                }
            }
        }
    }
}

@Composable
private fun OrderListCard(order: Order, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Order #${order.id}", fontWeight = FontWeight.Black)
                Text(order.status, fontWeight = FontWeight.Black, color = statusColor(order.status))
            }
            Text(order.customerName, fontSize = 22.sp, fontWeight = FontWeight.Black)
            Text(order.customerPhone, color = Color(0xFF526173), fontWeight = FontWeight.Bold)
            Text("${order.fulfillmentType} - ${money(order.total)}", fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun OrderDetailScreen(order: Order, onBack: () -> Unit, onAccept: () -> Unit, onDecline: () -> Unit) {
    PageShell {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Order #${order.id}", fontSize = 34.sp, fontWeight = FontWeight.Black)
                Text(order.status, color = statusColor(order.status), fontWeight = FontWeight.Black)
            }
            SecondaryButton("Back", onBack)
        }

        CardPanel {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(order.customerName, fontSize = 30.sp, fontWeight = FontWeight.Black)
                    Text(order.customerPhone, fontSize = 20.sp, color = Color(0xFF526173), fontWeight = FontWeight.Bold)
                    Text("${order.orderType} - ${order.fulfillmentType}", fontWeight = FontWeight.Black)
                    Text("Placed: ${formatOrderTime(order.createdAt)}", color = Color(0xFF526173), fontWeight = FontWeight.Bold)
                }
                Text(money(order.total), fontSize = 34.sp, fontWeight = FontWeight.Black)
            }

            if (order.notes.isNotBlank()) {
                Box(modifier = Modifier.fillMaxWidth().background(Color(0xFFFFF7ED), RoundedCornerShape(8.dp)).padding(14.dp)) {
                    Text("Notes: ${order.notes}", fontWeight = FontWeight.Bold)
                }
            }

            LazyColumn(modifier = Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(order.items) { item ->
                    Column(modifier = Modifier.fillMaxWidth().background(Color(0xFFF8FAFC), RoundedCornerShape(8.dp)).padding(14.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${item.quantity} x ${item.name}", fontSize = 21.sp, fontWeight = FontWeight.Black)
                            Text(money(item.price * item.quantity), fontWeight = FontWeight.Black)
                        }
                        item.modifiers.forEach { modifier ->
                            Text("  - $modifier", color = Color(0xFF526173), fontWeight = FontWeight.Bold)
                        }
                        if (item.notes.isNotBlank()) {
                            Text("Item note: ${item.notes}", color = Color(0xFF92400E), fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            if (order.status == "PENDING") {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(
                        onClick = onAccept,
                        modifier = Modifier.weight(1f).height(74.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F766E))
                    ) {
                        Text("Accept Order", fontSize = 22.sp, fontWeight = FontWeight.Black)
                    }
                    Button(
                        onClick = onDecline,
                        modifier = Modifier.weight(1f).height(74.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB42318))
                    ) {
                        Text("Decline Order", fontSize = 22.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }
}

@Composable
private fun PrinterSettingsScreen(
    settings: AppSettings,
    statusMessage: String,
    errorMessage: String,
    onSave: (AppSettings) -> Unit,
    onBack: () -> Unit,
    onTestPrint: () -> Unit
) {
    var printerIp by remember(settings) { mutableStateOf(settings.printerIp.ifBlank { "192.168.1.45" }) }
    var printerPort by remember(settings) { mutableStateOf(settings.printerPort.ifBlank { "9100" }) }

    PageShell {
        Text("Printer Settings", fontSize = 34.sp, fontWeight = FontWeight.Black)
        Text("Use a Wi-Fi or Ethernet ESC/POS printer on your local network.", color = Color(0xFF526173), fontWeight = FontWeight.Bold)
        MessageBlock(statusMessage, errorMessage)

        CardPanel {
            OutlinedTextField(value = printerIp, onValueChange = { printerIp = it }, label = { Text("Printer IP Address") }, placeholder = { Text("192.168.1.45") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = printerPort, onValueChange = { printerPort = it }, label = { Text("Printer Port") }, placeholder = { Text("9100") }, modifier = Modifier.fillMaxWidth())

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PrimaryButton("Save Printer") {
                    onSave(settings.copy(printerIp = printerIp, printerPort = printerPort.ifBlank { "9100" }))
                }
                SecondaryButton("Test Print", onTestPrint)
                SecondaryButton("Back", onBack)
            }
        }
    }
}

@Composable
private fun NewOrderOverlay(pendingCount: Int, onTap: () -> Unit) {
    val transition = rememberInfiniteTransition(label = "new-order-flash")
    val flash by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(650), repeatMode = RepeatMode.Reverse),
        label = "flash"
    )
    val background = if (flash > 0.5f) Color(0xFFFFA000) else Color(0xFFB42318)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(background)
            .clickable(onClick = onTap)
            .padding(28.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text(
                "$pendingCount new order${if (pendingCount == 1) "" else "s"}",
                color = Color.White,
                fontSize = 30.sp,
                fontWeight = FontWeight.Black
            )
            Text(
                "NEW ORDER",
                color = Color.White,
                fontSize = 86.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                lineHeight = 84.sp
            )
            Text("Tap anywhere to view", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun PageShell(scroll: Boolean = true, content: @Composable Column.() -> Unit) {
    val scrollModifier = if (scroll) {
        Modifier.verticalScroll(rememberScrollState())
    } else {
        Modifier
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(22.dp)
            .then(scrollModifier),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        content = content
    )
}

@Composable
private fun CardPanel(content: @Composable Column.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
    }
}

@Composable
private fun PrimaryButton(text: String, onClick: () -> Unit) {
    Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F766E))) {
        Text(text, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun SecondaryButton(text: String, onClick: () -> Unit) {
    Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF17202A))) {
        Text(text, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun MessageBlock(statusMessage: String, errorMessage: String) {
    if (statusMessage.isNotBlank()) {
        Text(statusMessage, color = Color(0xFF14532D), fontWeight = FontWeight.Bold)
    }
    if (errorMessage.isNotBlank()) {
        Text(errorMessage, color = Color(0xFFB42318), fontWeight = FontWeight.Bold)
    }
}

private class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("restaurant_tablet_settings", Context.MODE_PRIVATE)

    fun load(): AppSettings {
        return AppSettings(
            apiUrl = prefs.getString("apiUrl", "") ?: "",
            restaurantId = prefs.getString("restaurantId", "") ?: "",
            agentToken = prefs.getString("agentToken", "") ?: "",
            mockMode = prefs.getBoolean("mockMode", true),
            printerIp = prefs.getString("printerIp", "") ?: "",
            printerPort = prefs.getString("printerPort", "9100") ?: "9100"
        )
    }

    fun save(settings: AppSettings) {
        prefs.edit()
            .putString("apiUrl", settings.apiUrl)
            .putString("restaurantId", settings.restaurantId)
            .putString("agentToken", settings.agentToken)
            .putBoolean("mockMode", settings.mockMode)
            .putString("printerIp", settings.printerIp)
            .putString("printerPort", settings.printerPort)
            .apply()
    }
}

private class ApiClient(private val settings: AppSettings) {
    suspend fun fetchPendingOrders(): List<Order> {
        val body = request("/api/restaurant/${settings.restaurantId}/orders/pending", "GET")
        return parseOrders(body)
    }

    suspend fun acceptOrder(orderId: String): Order {
        val body = request("/api/orders/$orderId/accept", "POST")
        return parseOrder(JSONObject(body))
    }

    suspend fun declineOrder(orderId: String): Order {
        val body = request("/api/orders/$orderId/decline", "POST")
        return parseOrder(JSONObject(body))
    }

    suspend fun markPrinted(orderId: String) {
        request("/api/orders/$orderId/printed", "POST")
    }

    private suspend fun request(path: String, method: String): String = withContext(Dispatchers.IO) {
        val baseUrl = settings.apiUrl.trimEnd('/')
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("Authorization", "Bearer ${settings.agentToken}")
            setRequestProperty("Accept", "application/json")
            if (method == "POST") {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.use { it.write(ByteArray(0)) }
            }
        }

        val responseCode = connection.responseCode
        val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
        val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()

        if (responseCode !in 200..299) {
            throw IllegalStateException("HTTP $responseCode ${responseBody.ifBlank { "Request failed" }}")
        }

        responseBody
    }
}

private object EscPosPrinter {
    suspend fun testPrint(settings: AppSettings) = withContext(Dispatchers.IO) {
        send(settings, buildString {
            appendLine("RESTAURANT TABLET TEST")
            appendLine("----------------------")
            appendLine("Printer connected.")
            appendLine(SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date()))
            appendLine("\n\n")
        }.toByteArray(Charsets.UTF_8) + byteArrayOf(0x1D, 0x56, 0x00))
    }

    suspend fun printKitchenTicket(settings: AppSettings, order: Order) = withContext(Dispatchers.IO) {
        val ticketText = buildString {
            appendLine("KITCHEN ORDER")
            appendLine("Order #${order.id}")
            appendLine(formatOrderTime(order.createdAt))
            appendLine("------------------------------")
            appendLine(order.customerName)
            appendLine(order.customerPhone)
            appendLine("${order.orderType} - ${order.fulfillmentType}")
            if (order.notes.isNotBlank()) {
                appendLine("NOTES: ${order.notes}")
            }
            appendLine("------------------------------")
            order.items.forEach { item ->
                appendLine("${item.quantity} x ${item.name}")
                item.modifiers.forEach { modifier ->
                    appendLine("  - $modifier")
                }
                if (item.notes.isNotBlank()) {
                    appendLine("  Note: ${item.notes}")
                }
            }
            appendLine("------------------------------")
            appendLine("TOTAL ${money(order.total)}")
            appendLine("\n\n")
        }

        val bytes = byteArrayOf(0x1B, 0x40) +
            ticketText.toByteArray(Charsets.UTF_8) +
            byteArrayOf(0x1D, 0x56, 0x00)

        send(settings, bytes)
    }

    private fun send(settings: AppSettings, bytes: ByteArray) {
        val port = settings.printerPort.toIntOrNull() ?: 9100
        Socket().use { socket ->
            socket.connect(InetSocketAddress(settings.printerIp, port), 5_000)
            BufferedOutputStream(socket.getOutputStream()).use { output ->
                output.write(bytes)
                output.flush()
            }
        }
    }
}

private fun parseOrders(body: String): List<Order> {
    val trimmed = body.trim()
    val array = when {
        trimmed.startsWith("[") -> JSONArray(trimmed)
        trimmed.startsWith("{") -> {
            val root = JSONObject(trimmed)
            root.optJSONArray("orders") ?: root.optJSONArray("data") ?: JSONArray()
        }
        else -> JSONArray()
    }

    return List(array.length()) { index -> parseOrder(array.getJSONObject(index)) }
}

private fun parseOrder(json: JSONObject): Order {
    val itemsJson = json.optJSONArray("items") ?: JSONArray()
    return Order(
        id = json.opt("id").toString(),
        customerName = json.optString("customerName", "Guest"),
        customerPhone = json.optString("customerPhone", ""),
        orderType = json.optString("orderType", "Online"),
        fulfillmentType = json.optString("fulfillmentType", json.optString("type", "Pickup")),
        notes = json.optString("notes", ""),
        status = json.optString("status", "PENDING"),
        total = json.optDouble("total", json.optDouble("subtotal", 0.0)),
        createdAt = json.optString("createdAt", Date().time.toString()),
        items = List(itemsJson.length()) { index -> parseOrderItem(itemsJson.getJSONObject(index)) }
    )
}

private fun parseOrderItem(json: JSONObject): OrderItem {
    val modifiersJson = json.optJSONArray("selectedModifiers") ?: json.optJSONArray("modifiers") ?: JSONArray()
    val modifiers = List(modifiersJson.length()) { index ->
        val modifier = modifiersJson.get(index)
        if (modifier is JSONObject) {
            val groupName = modifier.optString("groupName", modifier.optString("name", "Modifier"))
            val optionName = modifier.optString("optionName", modifier.optString("value", ""))
            "$groupName: $optionName".trimEnd(':', ' ')
        } else {
            modifier.toString()
        }
    }

    return OrderItem(
        name = json.optString("name", "Item"),
        quantity = json.optInt("quantity", 1),
        price = json.optDouble("finalPrice", json.optDouble("price", 0.0)),
        modifiers = modifiers,
        notes = json.optString("customerComment", json.optString("notes", ""))
    )
}

private fun mergeOrders(freshOrders: List<Order>, currentOrders: List<Order>): List<Order> {
    val freshIds = freshOrders.map { it.id }.toSet()
    val currentById = currentOrders.associateBy { it.id }
    val mergedFreshOrders = freshOrders.map { freshOrder ->
        currentById[freshOrder.id]?.takeIf { it.status != "PENDING" } ?: freshOrder
    }
    val localOnlyOrders = currentOrders.filter { it.id !in freshIds }
    return mergedFreshOrders + localOnlyOrders
}

private fun updateOrderInList(orders: List<Order>, updatedOrder: Order): List<Order> {
    return orders.map { if (it.id == updatedOrder.id) updatedOrder else it }
}

private fun sampleOrders(): List<Order> {
    return listOf(
        Order(
            id = "1001",
            customerName = "Maya Chen",
            customerPhone = "555-0101",
            orderType = "Online",
            fulfillmentType = "Pickup",
            notes = "Please include extra napkins.",
            status = "PENDING",
            total = 32.75,
            createdAt = "2026-06-12T12:05:00Z",
            items = listOf(
                OrderItem("Spicy Tuna Roll", 2, 8.50, listOf("Sauce: Spicy mayo"), ""),
                OrderItem("Chicken Bento", 1, 15.75, listOf("Side: Miso soup"), "No onions")
            )
        ),
        Order(
            id = "1000",
            customerName = "Jordan Lee",
            customerPhone = "555-0144",
            orderType = "Online",
            fulfillmentType = "Delivery",
            notes = "Call when arriving.",
            status = "ACCEPTED",
            total = 18.25,
            createdAt = "2026-06-12T11:55:00Z",
            items = listOf(
                OrderItem("California Roll", 1, 7.25, emptyList(), ""),
                OrderItem("Miso Soup", 2, 5.50, emptyList(), "")
            )
        )
    )
}

private fun newMockOrder(number: Int): Order {
    val id = (1100 + number).toString()
    return Order(
        id = id,
        customerName = "Mock Customer $number",
        customerPhone = "555-${1000 + number}",
        orderType = "Online",
        fulfillmentType = if (number % 2 == 0) "Delivery" else "Pickup",
        notes = "Mock order for tablet testing.",
        status = "PENDING",
        total = 24.50 + number,
        createdAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date()),
        items = listOf(
            OrderItem("Salmon Avocado Roll", 2, 9.50, listOf("Wasabi: On side"), ""),
            OrderItem("Green Tea", 1, 3.50, listOf("Size: Large"), "")
        )
    )
}

private fun statusColor(status: String): Color {
    return when (status) {
        "PENDING" -> Color(0xFFD97706)
        "ACCEPTED" -> Color(0xFF0F766E)
        "CANCELLED" -> Color(0xFFB42318)
        else -> Color(0xFF526173)
    }
}

private fun money(value: Double): String {
    return NumberFormat.getCurrencyInstance(Locale.US).format(value)
}

private fun formatOrderTime(value: String): String {
    return value.ifBlank {
        SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date())
    }
}
