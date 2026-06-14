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
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

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

private enum class OrderFilter(val label: String, val status: String?) {
    All("All", null),
    Pending("Pending", "PENDING"),
    InProgress("In Progress", "ACCEPTED"),
    Completed("Completed", "COMPLETED"),
    Cancelled("Cancelled", "CANCELLED")
}

private data class AppSettings(
    val apiUrl: String = "http://10.0.2.2:3000",
    val restaurantId: String = "1",
    val agentToken: String = "",
    val mockMode: Boolean = false,
    val printerIp: String = "",
    val printerPort: String = "9100"
) {
    fun canOpenDashboard(): Boolean {
        return mockMode || (apiUrl.isNotBlank() && restaurantId.isNotBlank() && agentToken.isNotBlank())
    }
}

private data class RestaurantInfo(
    val id: String = "",
    val name: String = "Restaurant",
    val slug: String = "",
    val phone: String = "",
    val address: String = "",
    val websiteUrl: String = "",
    val themeColor: String = "#0f766e"
)

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
    val printedAt: String?,
    val items: List<OrderItem>,
    val subtotal: Double = 0.0,
    val tax: Double = 0.0,
    val paymentReceived: Double = 0.0,
    val paymentStatus: String = "Paid"
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
    var restaurant by remember { mutableStateOf(RestaurantInfo(name = "Restaurant ${settings.restaurantId.ifBlank { "1" }}")) }
    var orders by remember { mutableStateOf(if (settings.mockMode) sampleOrders() else emptyList()) }
    var selectedOrder by remember { mutableStateOf<Order?>(null) }
    var alertOrder by remember { mutableStateOf<Order?>(null) }
    var viewedPendingIds by remember { mutableStateOf(setOf<String>()) }
    var selectedFilter by remember { mutableStateOf(OrderFilter.All) }
    var soundEnabled by remember { mutableStateOf(false) }
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

            if (settings.mockMode) {
                restaurant = RestaurantInfo(id = settings.restaurantId, name = "Joe's Pizza", slug = "joes-pizza")
                orders = mergeOrders(sampleOrders(), orders).sortedByDescending { it.createdAt }
            } else {
                val api = ApiClient(settings)
                restaurant = api.fetchRestaurantInfo()
                orders = mergeOrders(api.fetchOrders(), orders).sortedByDescending { it.createdAt }
            }

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

    LaunchedEffect(alertOrder?.id, soundEnabled) {
        if (alertOrder == null || !soundEnabled) {
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
        restaurant = RestaurantInfo(id = newSettings.restaurantId, name = "Restaurant ${newSettings.restaurantId}")
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
                selectedFilter = OrderFilter.InProgress
                statusMessage = "Accepted order #${order.id}."

                if (settings.printerIp.isNotBlank()) {
                    try {
                        EscPosPrinter.printKitchenTicket(settings, restaurant, acceptedOrder)
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
                selectedFilter = OrderFilter.Cancelled
                statusMessage = "Declined order #${order.id}."
            } catch (err: Exception) {
                errorMessage = "Could not decline order: ${err.message}"
            }
        }
    }

    fun printOrder(order: Order) {
        scope.launch {
            if (settings.printerIp.isBlank()) {
                errorMessage = "Add a printer IP address before printing."
                screen = Screen.Printer
                return@launch
            }

            try {
                statusMessage = "Printing order #${order.id}..."
                EscPosPrinter.printKitchenTicket(settings, restaurant, order)

                if (!settings.mockMode) {
                    ApiClient(settings).markPrinted(order.id)
                    refreshOrders(quiet = true)
                } else {
                    orders = updateOrderInList(
                        orders,
                        order.copy(printedAt = SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date()))
                    )
                }

                statusMessage = "Printed order #${order.id}."
                errorMessage = ""
            } catch (err: Exception) {
                errorMessage = "Could not print order #${order.id}: ${err.message}"
            }
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFFEEF2F4)) {
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
                        errorMessage = "Add API URL, restaurant ID, and agent token, or turn on debug mock mode."
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
                restaurant = restaurant,
                orders = orders,
                selectedOrder = selectedOrder,
                selectedFilter = selectedFilter,
                soundEnabled = soundEnabled,
                statusMessage = statusMessage,
                errorMessage = errorMessage,
                onSelectFilter = { selectedFilter = it },
                onEnableSound = {
                    soundEnabled = true
                    toneGenerator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 250)
                    statusMessage = "Sound alerts are enabled."
                },
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
                onPrint = ::printOrder,
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
                    selectedFilter = OrderFilter.Pending
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
    var apiUrl by remember(settings) { mutableStateOf(settings.apiUrl.ifBlank { "http://10.0.2.2:3000" }) }
    var restaurantId by remember(settings) { mutableStateOf(settings.restaurantId.ifBlank { "1" }) }
    var agentToken by remember(settings) { mutableStateOf(settings.agentToken) }
    var mockMode by remember(settings) { mutableStateOf(settings.mockMode) }
    var printerIp by remember(settings) { mutableStateOf(settings.printerIp) }
    var printerPort by remember(settings) { mutableStateOf(settings.printerPort) }

    PageShell(scroll = true) {
        Text("Restaurant Tablet Setup", fontSize = 34.sp, fontWeight = FontWeight.Black, color = Ink)
        Text("Use http://10.0.2.2:3000 when the backend is running on your Mac and the app is in the Android emulator.", color = Muted, fontWeight = FontWeight.Bold)
        MessageBlock(statusMessage, errorMessage)

        CardPanel {
            OutlinedTextField(value = apiUrl, onValueChange = { apiUrl = it }, label = { Text("Backend API URL") }, placeholder = { Text("http://10.0.2.2:3000") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = restaurantId, onValueChange = { restaurantId = it }, label = { Text("Restaurant ID") }, placeholder = { Text("1") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = agentToken, onValueChange = { agentToken = it }, label = { Text("Agent Token") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = printerIp, onValueChange = { printerIp = it }, label = { Text("Printer IP Address") }, placeholder = { Text("192.168.1.45") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = printerPort, onValueChange = { printerPort = it }, label = { Text("Printer Port") }, placeholder = { Text("9100") }, modifier = Modifier.fillMaxWidth())

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = mockMode, onCheckedChange = { mockMode = it })
                Text("Debug mock mode only", fontWeight = FontWeight.Bold, color = Ink)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PrimaryButton("Save Settings") {
                    onSave(AppSettings(apiUrl, restaurantId, agentToken, mockMode, printerIp, printerPort.ifBlank { "9100" }))
                }
                DarkButton("Open Dashboard", onOpenDashboard)
                DarkButton("Printer Settings", onOpenPrinter)
            }
        }
    }
}

@Composable
private fun DashboardScreen(
    settings: AppSettings,
    restaurant: RestaurantInfo,
    orders: List<Order>,
    selectedOrder: Order?,
    selectedFilter: OrderFilter,
    soundEnabled: Boolean,
    statusMessage: String,
    errorMessage: String,
    onSelectFilter: (OrderFilter) -> Unit,
    onEnableSound: () -> Unit,
    onRefresh: () -> Unit,
    onOpenSetup: () -> Unit,
    onOpenPrinter: () -> Unit,
    onOpenOrder: (Order) -> Unit,
    onBackFromOrder: () -> Unit,
    onAccept: (Order) -> Unit,
    onDecline: (Order) -> Unit,
    onPrint: (Order) -> Unit,
    onAddMockOrder: () -> Unit
) {
    if (selectedOrder != null) {
        OrderDetailScreen(
            order = selectedOrder,
            onBack = onBackFromOrder,
            onAccept = { onAccept(selectedOrder) },
            onDecline = { onDecline(selectedOrder) },
            onPrint = { onPrint(selectedOrder) }
        )
        return
    }

    val activeCount = orders.count { it.status == "PENDING" || it.status == "ACCEPTED" }
    val filteredOrders = orders.filter { selectedFilter.status == null || it.status == selectedFilter.status }
    val menuUrl = publicMenuUrl(settings.apiUrl, restaurant.slug.ifBlank { "joes-pizza" })

    Column(modifier = Modifier.fillMaxSize().background(PageBackground)) {
        LiveHeader(
            restaurantName = restaurant.name,
            activeCount = activeCount,
            soundEnabled = soundEnabled,
            hasPending = orders.any { it.status == "PENDING" },
            onEnableSound = onEnableSound,
            onOpenSetup = onOpenSetup,
            onOpenPrinter = onOpenPrinter,
            onRefresh = onRefresh,
            onAddMockOrder = if (settings.mockMode) onAddMockOrder else null
        )

        FilterTabs(
            orders = orders,
            selectedFilter = selectedFilter,
            onSelectFilter = onSelectFilter
        )

        OnlineMenuCard(menuUrl = menuUrl)

        MessageBlock(statusMessage, errorMessage, modifier = Modifier.padding(horizontal = 18.dp))

        LazyRow(
            modifier = Modifier.fillMaxSize().padding(start = 18.dp, top = 12.dp, bottom = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            if (filteredOrders.isEmpty()) {
                item {
                    Box(modifier = Modifier.width(380.dp).fillMaxHeight().background(Color.White, RoundedCornerShape(8.dp)).padding(18.dp)) {
                        Text("No orders match this filter.", color = Muted, fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                items(filteredOrders) { order ->
                    WebsiteOrderCard(order = order, onClick = { onOpenOrder(order) }, onPrint = { onPrint(order) })
                }
            }
        }
    }
}

@Composable
private fun LiveHeader(
    restaurantName: String,
    activeCount: Int,
    soundEnabled: Boolean,
    hasPending: Boolean,
    onEnableSound: () -> Unit,
    onOpenSetup: () -> Unit,
    onOpenPrinter: () -> Unit,
    onRefresh: () -> Unit,
    onAddMockOrder: (() -> Unit)?
) {
    Row(
        modifier = Modifier.fillMaxWidth().background(Color.White).padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        HamburgerButton(onOpenSetup)
        Column(modifier = Modifier.weight(1f)) {
            Text("LIVE ORDERS", color = Muted, fontSize = 18.sp, fontWeight = FontWeight.Black)
            Text(restaurantName, color = Ink, fontSize = 56.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("$activeCount active orders", color = Muted, fontSize = 21.sp, fontWeight = FontWeight.Black)
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onAddMockOrder != null) {
                DarkButton("Add Mock Order", onAddMockOrder)
            }
            DarkButton("Refresh", onRefresh)
            DarkButton("Printer", onOpenPrinter)
            Button(
                onClick = onEnableSound,
                colors = ButtonDefaults.buttonColors(containerColor = if (soundEnabled) Muted else Orange),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.height(66.dp)
            ) {
                Text(if (soundEnabled) "Sound Alerts On" else "Enable Sound Alerts", fontSize = 20.sp, fontWeight = FontWeight.Black)
            }
            Text(if (hasPending) "Pending alert active" else "No pending alerts", color = Muted, fontSize = 18.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun HamburgerButton(onClick: () -> Unit) {
    Box(
        modifier = Modifier.size(78.dp).background(Dark, RoundedCornerShape(8.dp)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(3) {
                Box(modifier = Modifier.width(42.dp).height(5.dp).background(Color.White, RoundedCornerShape(999.dp)))
            }
        }
    }
}

@Composable
private fun FilterTabs(orders: List<Order>, selectedFilter: OrderFilter, onSelectFilter: (OrderFilter) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().background(PageBackground).horizontalScroll(rememberScrollState()).padding(18.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        OrderFilter.values().forEach { filter ->
            val count = orders.count { filter.status == null || it.status == filter.status }
            FilterButton(filter, count, filter == selectedFilter) { onSelectFilter(filter) }
        }
    }
}

@Composable
private fun FilterButton(filter: OrderFilter, count: Int, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .height(72.dp)
            .background(if (selected) Teal else Color.White, RoundedCornerShape(8.dp))
            .border(2.dp, if (selected) Teal else Border, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(filter.label, color = if (selected) Color.White else Ink, fontSize = 22.sp, fontWeight = FontWeight.Black)
        Box(
            modifier = Modifier.size(38.dp).background(if (selected) Color.White else BadgeBackground, RoundedCornerShape(999.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text("$count", color = if (selected) Teal else Muted, fontSize = 18.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun OnlineMenuCard(menuUrl: String) {
    Row(
        modifier = Modifier.fillMaxWidth().background(Color.White).border(1.dp, Border).padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("ONLINE MENU", color = Muted, fontSize = 16.sp, fontWeight = FontWeight.Black)
            Text(menuUrl, color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PrimaryButton("Copy Link") {}
            DarkButton("Open Public Menu") {}
        }
    }
}

@Composable
private fun WebsiteOrderCard(order: Order, onClick: () -> Unit, onPrint: () -> Unit) {
    Card(
        modifier = Modifier.width(380.dp).fillMaxHeight().clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize().border(2.dp, statusBorderColor(order.status), RoundedCornerShape(8.dp)).padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("ORDER #${order.id}", color = Muted, fontSize = 17.sp, fontWeight = FontWeight.Black)
                    Text(order.customerName, color = Ink, fontSize = 25.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(order.customerPhone, color = Muted, fontSize = 21.sp, fontWeight = FontWeight.Black)
                }
                Column(horizontalAlignment = Alignment.End) {
                    StatusBadge(order.status)
                    Text(formatOrderTime(order.createdAt), color = Muted, fontSize = 18.sp, fontWeight = FontWeight.Black)
                }
            }

            if (order.notes.isNotBlank()) {
                Box(modifier = Modifier.fillMaxWidth().padding(top = 18.dp).background(NoteBackground, RoundedCornerShape(7.dp)).padding(12.dp)) {
                    Text(order.notes, color = Muted, fontSize = 18.sp, fontWeight = FontWeight.Black, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            } else {
                Spacer(Modifier.height(18.dp))
            }

            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                order.items.forEach { item ->
                    TicketItem(item)
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().border(1.dp, Border.copy(alpha = 0.6f), RoundedCornerShape(0.dp)).padding(top = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Total", color = Ink, fontSize = 24.sp, fontWeight = FontWeight.Black)
                Text(money(order.total), color = Ink, fontSize = 24.sp, fontWeight = FontWeight.Black)
            }

            Button(
                onClick = onPrint,
                colors = ButtonDefaults.buttonColors(containerColor = Dark),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth().height(50.dp)
            ) {
                Text("Print Receipt", fontSize = 17.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

@Composable
private fun TicketItem(item: OrderItem) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 9.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${item.quantity} x ${item.name}", color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
            Text(money(item.price * item.quantity), color = Ink, fontSize = 17.sp)
        }
        item.modifiers.forEach { modifier ->
            Text("•  $modifier", color = Muted, fontSize = 17.sp, modifier = Modifier.padding(start = 4.dp, top = 2.dp))
        }
        if (item.notes.isNotBlank()) {
            Text("Comment: ${item.notes}", color = Muted, fontSize = 17.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 4.dp))
        }
        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Border).padding(top = 8.dp))
    }
}

@Composable
private fun StatusBadge(status: String) {
    val background = when (status) {
        "PENDING" -> Color(0xFFFFF3CD)
        "ACCEPTED" -> Color(0xFFDCFCE7)
        "COMPLETED" -> Color(0xFFDBEAFE)
        "CANCELLED" -> Color(0xFFFEE2E2)
        else -> BadgeBackground
    }
    Box(modifier = Modifier.background(background, RoundedCornerShape(999.dp)).padding(horizontal = 12.dp, vertical = 7.dp)) {
        Text(status, color = statusColor(status), fontSize = 15.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun OrderDetailScreen(order: Order, onBack: () -> Unit, onAccept: () -> Unit, onDecline: () -> Unit, onPrint: () -> Unit) {
    PageShell(scroll = false) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("ORDER #${order.id}", color = Muted, fontSize = 18.sp, fontWeight = FontWeight.Black)
                Text(order.customerName, fontSize = 44.sp, color = Ink, fontWeight = FontWeight.Black)
                Text(order.customerPhone, fontSize = 24.sp, color = Muted, fontWeight = FontWeight.Black)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                StatusBadge(order.status)
                DarkButton("Back to Dashboard", onBack)
            }
        }

        CardPanel(modifier = Modifier.weight(1f)) {
            if (order.notes.isNotBlank()) {
                Box(modifier = Modifier.fillMaxWidth().background(NoteBackground, RoundedCornerShape(8.dp)).padding(16.dp)) {
                    Text(order.notes, fontSize = 21.sp, color = Muted, fontWeight = FontWeight.Black)
                }
            }

            LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(order.items) { item ->
                    TicketItem(item)
                }
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Total", fontSize = 30.sp, color = Ink, fontWeight = FontWeight.Black)
                Text(money(order.total), fontSize = 30.sp, color = Ink, fontWeight = FontWeight.Black)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = onPrint,
                    modifier = Modifier.weight(1f).height(76.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Dark),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Print Receipt", fontSize = 22.sp, fontWeight = FontWeight.Black)
                }

                if (order.status == "PENDING") {
                    Button(
                        onClick = onAccept,
                        modifier = Modifier.weight(1f).height(76.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Teal),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Accept Order", fontSize = 22.sp, fontWeight = FontWeight.Black)
                    }
                    Button(
                        onClick = onDecline,
                        modifier = Modifier.weight(1f).height(76.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Danger),
                        shape = RoundedCornerShape(8.dp)
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
        Text("Printer Settings", fontSize = 34.sp, color = Ink, fontWeight = FontWeight.Black)
        Text("Use a Wi-Fi or Ethernet ESC/POS printer on your local network.", color = Muted, fontWeight = FontWeight.Bold)
        MessageBlock(statusMessage, errorMessage)

        CardPanel {
            OutlinedTextField(value = printerIp, onValueChange = { printerIp = it }, label = { Text("Printer IP Address") }, placeholder = { Text("192.168.1.45") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = printerPort, onValueChange = { printerPort = it }, label = { Text("Printer Port") }, placeholder = { Text("9100") }, modifier = Modifier.fillMaxWidth())

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PrimaryButton("Save Printer") {
                    onSave(settings.copy(printerIp = printerIp, printerPort = printerPort.ifBlank { "9100" }))
                }
                DarkButton("Test Print", onTestPrint)
                DarkButton("Back", onBack)
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
    val background = if (flash > 0.5f) Orange else Danger

    Box(
        modifier = Modifier.fillMaxSize().background(background).clickable(onClick = onTap).padding(28.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text("$pendingCount new order${if (pendingCount == 1) "" else "s"}", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Black)
            Text("NEW ORDER", color = Color.White, fontSize = 86.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center, lineHeight = 84.sp)
            Text("Tap anywhere to view", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun PageShell(scroll: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val scrollModifier = if (scroll) Modifier.verticalScroll(rememberScrollState()) else Modifier

    Column(
        modifier = Modifier.fillMaxSize().background(PageBackground).padding(22.dp).then(scrollModifier),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        content = content
    )
}

@Composable
private fun CardPanel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
    }
}

@Composable
private fun PrimaryButton(text: String, onClick: () -> Unit) {
    Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = Teal), shape = RoundedCornerShape(8.dp)) {
        Text(text, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun DarkButton(text: String, onClick: () -> Unit) {
    Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = Dark), shape = RoundedCornerShape(8.dp)) {
        Text(text, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun MessageBlock(statusMessage: String, errorMessage: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (statusMessage.isNotBlank()) {
            Text(statusMessage, color = Color(0xFF14532D), fontWeight = FontWeight.Bold)
        }
        if (errorMessage.isNotBlank()) {
            Text(errorMessage, color = Danger, fontWeight = FontWeight.Bold)
        }
    }
}

private class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("restaurant_tablet_settings", Context.MODE_PRIVATE)

    fun load(): AppSettings {
        return AppSettings(
            apiUrl = prefs.getString("apiUrl", "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000",
            restaurantId = prefs.getString("restaurantId", "1") ?: "1",
            agentToken = prefs.getString("agentToken", "") ?: "",
            mockMode = prefs.getBoolean("mockMode", false),
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
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    suspend fun fetchRestaurantInfo(): RestaurantInfo {
        val body = request("/api/restaurants/${settings.restaurantId}/live-orders-info", "GET")
        return parseRestaurant(JSONObject(body))
    }

    suspend fun fetchOrders(): List<Order> {
        val body = request("/api/restaurants/${settings.restaurantId}/orders", "GET")
        return parseOrders(body)
    }

    suspend fun acceptOrder(orderId: String): Order {
        val body = request("/api/orders/$orderId/accept", "PATCH")
        return parseOrder(JSONObject(body))
    }

    suspend fun declineOrder(orderId: String): Order {
        val body = request("/api/orders/$orderId/decline", "PATCH")
        return parseOrder(JSONObject(body))
    }

    suspend fun markPrinted(orderId: String) {
        request("/api/orders/$orderId/printed", "PATCH")
    }

    private suspend fun request(path: String, method: String): String = withContext(Dispatchers.IO) {
        val body = if (method == "PATCH" || method == "POST") {
            "{}".toRequestBody("application/json".toMediaType())
        } else {
            null
        }
        val request = Request.Builder()
            .url("${settings.apiUrl.trimEnd('/')}$path")
            .method(method, body)
            .header("Authorization", "Bearer ${settings.agentToken}")
            .header("Accept", "application/json")
            .build()

        client.newCall(request).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("HTTP ${response.code} ${responseBody.ifBlank { "Request failed" }}")
            }
            responseBody
        }
    }
}

private object EscPosPrinter {
    // 48 columns uses the full text width on many 80mm ESC/POS printers.
    // If a 58mm printer is used later, change this to 32.
    private const val TicketWidth = 48
    private val initialize = byteArrayOf(0x1B, 0x40)
    private val alignLeft = byteArrayOf(0x1B, 0x61, 0x00)
    private val alignCenter = byteArrayOf(0x1B, 0x61, 0x01)
    private val boldOn = byteArrayOf(0x1B, 0x45, 0x01)
    private val boldOff = byteArrayOf(0x1B, 0x45, 0x00)
    private val fontA = byteArrayOf(0x1B, 0x4D, 0x00)
    private val lineSpacingRoomy = byteArrayOf(0x1B, 0x33, 34)
    private val leftMarginZero = byteArrayOf(0x1D, 0x4C, 0x00, 0x00)
    private val fullPrintWidth = byteArrayOf(0x1D, 0x57, 0x40, 0x02)
    private val normalSize = byteArrayOf(0x1D, 0x21, 0x00)
    private val doubleHeight = byteArrayOf(0x1D, 0x21, 0x01)
    private val doubleWidthHeight = byteArrayOf(0x1D, 0x21, 0x11)
    private val cutPaper = byteArrayOf(0x1D, 0x56, 0x00)

    suspend fun testPrint(settings: AppSettings) = withContext(Dispatchers.IO) {
        val bytes = buildEscPosTicket {
            command(alignCenter)
            command(boldOn)
            command(doubleWidthHeight)
            text("TEST PRINT\n\n")
            command(normalSize)
            text("${line('-')}\n")
            command(alignLeft)
            command(boldOff)
            text("${centeredLine("Printer connected.")}\n")
            text("${centeredLine(SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date()))}\n")
            text("${line('-')}\n")
            feedBottom()
        }

        send(settings, bytes)
    }

    suspend fun printKitchenTicket(settings: AppSettings, restaurant: RestaurantInfo, order: Order) = withContext(Dispatchers.IO) {
        val websiteUrl = cleanOptional(restaurant.websiteUrl)
        val bytes = buildEscPosTicket {
            command(alignCenter)
            command(boldOn)
            command(doubleHeight)
            wrap(restaurant.name, 24).forEach { text("$it\n") }
            command(normalSize)
            command(boldOff)
            if (restaurant.address.isNotBlank()) {
                wrap(restaurant.address, TicketWidth).forEach { text("$it\n") }
            }
            if (restaurant.phone.isNotBlank()) {
                text("TEL: ${restaurant.phone}\n")
            }
            verticalSpace()

            command(boldOn)
            command(doubleHeight)
            text("${order.fulfillmentType.uppercase(Locale.US)}\n")
            command(doubleHeight)
            text("${order.orderType.uppercase(Locale.US)}\n")
            command(normalSize)
            command(boldOff)
            verticalSpace()
            command(alignCenter)
            text("${dateTimeOrderLine(order)}\n")
            majorDivider()
            verticalSpace()

            command(alignLeft)
            command(boldOn)
            text("${labelValueLine("Phone:", order.customerPhone)}\n")
            smallVerticalSpace()
            text("${labelValueLine("Name:", order.customerName)}\n")
            smallVerticalSpace()
            command(boldOff)
            val remarks = cleanOptional(order.notes) ?: ""
            text("${labelValueLine("Remarks:", remarks)}\n")
            wrapContinuation("Remarks:", remarks).forEach { text("$it\n") }
            smallVerticalSpace()

            majorDivider()
            verticalSpace()
            order.items.forEach { item ->
                command(boldOn)
                val itemName = if (item.quantity > 1) "${item.name} x${item.quantity}" else item.name
                itemLine(itemName, receiptMoney(item.price * item.quantity)).forEach { text("$it\n") }
                command(boldOff)
                item.modifiers.forEach { modifier ->
                    cleanOptional(modifier)?.let { cleanModifier ->
                        wrap("** $cleanModifier", TicketWidth - 4).forEach { text("  $it\n") }
                    }
                }
                cleanOptional(item.notes)?.let { comment ->
                    wrap("** Comment: $comment", TicketWidth - 4).forEach { text("  $it\n") }
                }
                itemDivider()
                verticalSpace()
            }

            val subtotal = if (order.subtotal > 0.0) order.subtotal else order.total
            val tax = order.tax.coerceAtLeast(0.0)
            val received = if (order.paymentReceived > 0.0) order.paymentReceived else order.total
            val paymentLabel = paymentLabel(order.paymentStatus)

            verticalSpace()
            text("${moneyLine("Amount:", receiptMoney(subtotal))}\n")
            text("${moneyLine("Tax:", receiptMoney(tax))}\n")
            command(boldOn)
            command(doubleHeight)
            text("${moneyLine("Total:", receiptMoney(order.total))}\n")
            command(normalSize)
            command(boldOff)
            text("${moneyLine("$paymentLabel Received:", receiptMoney(received))}\n")
            majorDivider()
            verticalSpace()
            printTipSuggestions(order.total)
            majorDivider()
            verticalSpace()
            command(alignCenter)
            command(boldOn)
            text("Thank you very much\n")
            command(boldOff)
            if (websiteUrl != null) {
                text("\n")
                qrCode(websiteUrl)
                text("$websiteUrl\n")
            }
            feedBottom()
        }

        send(settings, bytes)
    }

    private class EscPosTicketBuilder {
        private val bytes = mutableListOf<Byte>()

        fun command(commandBytes: ByteArray) {
            commandBytes.forEach { bytes.add(it) }
        }

        fun text(value: String) {
            value.toByteArray(Charsets.UTF_8).forEach { bytes.add(it) }
        }

        fun feedBottom() {
            text("\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n")
        }

        fun verticalSpace() {
            text("\n")
        }

        fun smallVerticalSpace() {
            command(byteArrayOf(0x1B, 0x4A, 12))
        }

        fun majorDivider() {
            command(boldOn)
            text("${line('=')}\n")
            command(boldOff)
        }

        fun itemDivider() {
            text("${centeredLine("-".repeat((TicketWidth - 8).coerceAtLeast(12)))}\n")
        }

        fun qrCode(value: String) {
            val qrData = value.toByteArray(Charsets.UTF_8)
            val storeLength = qrData.size + 3
            val pL = (storeLength % 256).toByte()
            val pH = (storeLength / 256).toByte()

            command(byteArrayOf(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00))
            command(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06))
            command(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31))
            command(byteArrayOf(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30) + qrData)
            command(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30))
        }

        fun build(): ByteArray {
            command(cutPaper)
            return bytes.toByteArray()
        }
    }

    private fun buildEscPosTicket(content: EscPosTicketBuilder.() -> Unit): ByteArray {
        return EscPosTicketBuilder().apply {
            command(initialize)
            command(fontA)
            command(leftMarginZero)
            command(fullPrintWidth)
            command(lineSpacingRoomy)
            command(alignLeft)
            command(normalSize)
            content()
        }.build()
    }

    private fun line(character: Char = '-'): String {
        return character.toString().repeat(TicketWidth)
    }

    private fun moneyLine(label: String, value: String): String {
        val spaceCount = (TicketWidth - label.length - value.length).coerceAtLeast(1)
        return label + " ".repeat(spaceCount) + value
    }

    private fun labelValueLine(label: String, value: String): String {
        return "$label  $value".take(TicketWidth)
    }

    private fun wrapContinuation(label: String, value: String): List<String> {
        val firstLineWidth = (TicketWidth - label.length - 2).coerceAtLeast(1)

        if (value.length <= firstLineWidth) {
            return emptyList()
        }

        return wrap(value.drop(firstLineWidth).trim(), TicketWidth - label.length - 2)
            .map { "${" ".repeat(label.length + 2)}$it" }
    }

    private fun centeredLine(value: String): String {
        val cleanValue = value.take(TicketWidth)
        val leftPadding = ((TicketWidth - cleanValue.length) / 2).coerceAtLeast(0)
        return " ".repeat(leftPadding) + cleanValue
    }

    private fun dateTimeOrderLine(order: Order): String {
        val left = "Date:${formatOrderDate(order.createdAt)}"
        val middle = "Time:${formatOrderTime(order.createdAt)}"
        val right = "#${order.id}"
        val firstGap = ((TicketWidth - left.length - middle.length - right.length) / 2).coerceAtLeast(1)
        val secondGap = (TicketWidth - left.length - firstGap - middle.length - right.length).coerceAtLeast(1)
        return left + " ".repeat(firstGap) + middle + " ".repeat(secondGap) + right
    }

    private fun itemLine(name: String, price: String): List<String> {
        val availableNameWidth = TicketWidth - price.length - 2
        val wrappedName = wrap(name, availableNameWidth)

        return wrappedName.mapIndexed { index, line ->
            if (index == 0) {
                val gap = (TicketWidth - line.length - price.length).coerceAtLeast(1)
                line + " ".repeat(gap) + price
            } else {
                "  $line"
            }
        }
    }

    private fun EscPosTicketBuilder.printTipSuggestions(total: Double) {
        command(alignCenter)
        command(boldOn)
        text("Tip Suggestions:\n")
        command(boldOff)
        smallVerticalSpace()
        listOf(18, 20, 25).forEach { percent ->
            val tip = total * percent / 100
            val newTotal = total + tip
            text("If $percent%, Tip:${receiptMoney(tip)}, Total ${receiptMoney(newTotal)}\n")
        }
        command(alignLeft)
    }

    private fun receiptMoney(value: Double): String {
        return String.format(Locale.US, "%.2f", value)
    }

    private fun paymentLabel(paymentStatus: String): String {
        val normalized = paymentStatus.trim()
        if (normalized.isBlank() || normalized.equals("PAID", ignoreCase = true)) {
            return "Paid"
        }

        return normalized.lowercase(Locale.US).replaceFirstChar { it.uppercase(Locale.US) }
    }

    private fun cleanOptional(value: String?): String? {
        val cleanValue = value?.trim().orEmpty()

        if (cleanValue.isBlank() || cleanValue.equals("null", ignoreCase = true)) {
            return null
        }

        return cleanValue
    }

    private fun wrap(value: String, width: Int = TicketWidth): List<String> {
        val cleanValue = value.trim()

        if (cleanValue.length <= width) {
            return listOf(cleanValue)
        }

        val lines = mutableListOf<String>()
        var currentLine = ""

        cleanValue.split(Regex("\\s+")).forEach { word ->
            if (currentLine.isBlank()) {
                currentLine = word
            } else if (currentLine.length + 1 + word.length <= width) {
                currentLine = "$currentLine $word"
            } else {
                lines.add(currentLine)
                currentLine = word
            }
        }

        if (currentLine.isNotBlank()) {
            lines.add(currentLine)
        }

        return lines
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

private fun parseRestaurant(json: JSONObject): RestaurantInfo {
    return RestaurantInfo(
        id = jsonId(json),
        name = json.optString("name", "Restaurant"),
        slug = json.optString("slug", ""),
        phone = json.optString("phone", ""),
        address = json.optString("address", ""),
        websiteUrl = json.optString("websiteUrl", ""),
        themeColor = json.optString("themeColor", "#0f766e")
    )
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
        id = jsonId(json),
        customerName = json.optString("customerName", "Guest"),
        customerPhone = json.optString("customerPhone", ""),
        orderType = json.optString("orderType", "Online"),
        fulfillmentType = json.optString("fulfillmentType", json.optString("type", "Pickup")),
        notes = json.optString("notes", ""),
        status = json.optString("status", "PENDING"),
        total = json.optDouble("total", json.optDouble("subtotal", 0.0)),
        subtotal = json.optDouble("subtotal", json.optDouble("amount", json.optDouble("total", 0.0))),
        tax = json.optDouble("tax", 0.0),
        paymentReceived = json.optDouble("paymentReceived", json.optDouble("received", json.optDouble("total", 0.0))),
        paymentStatus = json.optString("paymentStatus", "Paid"),
        createdAt = json.optString("createdAt", Date().time.toString()),
        printedAt = json.optString("printedAt").takeIf { it.isNotBlank() && it != "null" },
        items = List(itemsJson.length()) { index -> parseOrderItem(itemsJson.getJSONObject(index)) }
    )
}

private fun jsonId(json: JSONObject): String {
    return json.optString("id").ifBlank {
        val id = json.optLong("id", -1)
        if (id >= 0) id.toString() else ""
    }
}

private fun parseOrderItem(json: JSONObject): OrderItem {
    val modifiersJson = json.optJSONArray("selectedModifiers") ?: json.optJSONArray("modifiers") ?: JSONArray()
    val modifiers = List(modifiersJson.length()) { index ->
        val modifier = modifiersJson.get(index)
        if (modifier is JSONObject) {
            val groupName = modifier.optString("groupName", modifier.optString("name", "Modifier"))
            val optionName = modifier.optString("optionName", modifier.optString("value", ""))
            val priceDelta = modifier.optString("priceDelta", "")
            val priceText = priceDelta.takeIf { it.isNotBlank() && it != "0" && it != "0.00" }?.let { " +${money(it.toDoubleOrNull() ?: 0.0)}" } ?: ""
            "$groupName: $optionName$priceText".trimEnd(':', ' ')
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
        currentById[freshOrder.id]?.takeIf { it.status != "PENDING" && freshOrder.status == "PENDING" } ?: freshOrder
    }
    val localOnlyOrders = currentOrders.filter { it.id !in freshIds && it.status != "PENDING" }
    return mergedFreshOrders + localOnlyOrders
}

private fun updateOrderInList(orders: List<Order>, updatedOrder: Order): List<Order> {
    return if (orders.any { it.id == updatedOrder.id }) {
        orders.map { if (it.id == updatedOrder.id) updatedOrder else it }
    } else {
        listOf(updatedOrder) + orders
    }
}

private fun sampleOrders(): List<Order> {
    return listOf(
        Order(
            id = "17",
            customerName = "Grant",
            customerPhone = "9999999",
            orderType = "Online",
            fulfillmentType = "Pickup",
            notes = "Test order",
            status = "ACCEPTED",
            total = 8.50,
            createdAt = "2026-06-12T17:23:00Z",
            printedAt = null,
            items = listOf(OrderItem("House Salad", 1, 8.50, emptyList(), ""))
        ),
        Order(
            id = "16",
            customerName = "Grant",
            customerPhone = "323",
            orderType = "Online",
            fulfillmentType = "Pickup",
            notes = "",
            status = "ACCEPTED",
            total = 18.24,
            createdAt = "2026-06-12T17:23:00Z",
            printedAt = null,
            items = listOf(OrderItem("Pepperoni Pizza", 1, 18.24, listOf("Choose Size: Medium +$2.00", "Toppings: Extra Cheese +$1.25"), ""))
        ),
        newMockOrder(1)
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
        printedAt = null,
        items = listOf(
            OrderItem("Salmon Avocado Roll", 2, 9.50, listOf("Wasabi: On side"), ""),
            OrderItem("Green Tea", 1, 3.50, listOf("Size: Large"), "")
        )
    )
}

private fun statusColor(status: String): Color {
    return when (status) {
        "PENDING" -> Color(0xFF92400E)
        "ACCEPTED" -> Color(0xFF14532D)
        "COMPLETED" -> Color(0xFF1E3A8A)
        "CANCELLED" -> Color(0xFF991B1B)
        else -> Muted
    }
}

private fun statusBorderColor(status: String): Color {
    return when (status) {
        "PENDING" -> Color(0xFFFDE68A)
        "ACCEPTED" -> Color(0xFFBBF7D0)
        "COMPLETED" -> Color(0xFFBFDBFE)
        "CANCELLED" -> Color(0xFFE5E7EB)
        else -> Border
    }
}

private fun publicMenuUrl(apiUrl: String, slug: String): String {
    val localFrontendUrl = apiUrl
        .trimEnd('/')
        .replace("10.0.2.2:3000", "10.0.2.2:5173")
        .replace("localhost:3000", "localhost:5173")

    return "$localFrontendUrl/r/$slug"
}

private fun money(value: Double): String {
    return NumberFormat.getCurrencyInstance(Locale.US).format(value)
}

private fun formatOrderTime(value: String): String {
    return try {
        val normalized = value.replace("Z", "+0000").replace(Regex("\\.\\d{3}"), "")
        val parsed = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US).parse(normalized)
        SimpleDateFormat("h:mm a", Locale.US).format(parsed ?: Date())
    } catch (_: Exception) {
        value.ifBlank { SimpleDateFormat("h:mm a", Locale.US).format(Date()) }
    }
}

private fun formatOrderDate(value: String): String {
    return try {
        val normalized = value.replace("Z", "+0000").replace(Regex("\\.\\d{3}"), "")
        val parsed = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US).parse(normalized)
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(parsed ?: Date())
    } catch (_: Exception) {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }
}

private val PageBackground = Color(0xFFEEF2F4)
private val Ink = Color(0xFF17202A)
private val Muted = Color(0xFF526173)
private val Border = Color(0xFFD5DEE4)
private val BadgeBackground = Color(0xFFE2E8F0)
private val NoteBackground = Color(0xFFF1F5F9)
private val Teal = Color(0xFF317F73)
private val Dark = Color(0xFF17202A)
private val Orange = Color(0xFFD67A28)
private val Danger = Color(0xFFB42318)
