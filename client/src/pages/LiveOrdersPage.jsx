import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { acceptOrder, declineOrder, getLiveOrdersRestaurant, getOrders, markOrderPrinted, updateOrderStatus } from "../api.js";
import AdminStatus from "../components/AdminStatus.jsx";
import OnlineMenuLink from "../components/OnlineMenuLink.jsx";
import { useAuth } from "../auth.jsx";
import { formatPrice } from "../utils.js";

function playAlertTone(audioContext) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.value = 880;
  gain.gain.value = 0.08;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.28);
}

function areNumberArraysEqual(firstArray, secondArray) {
  return firstArray.length === secondArray.length && firstArray.every((value, index) => value === secondArray[index]);
}

function getOrderListSignature(orders) {
  return orders.map((order) => (
    [
      order.id,
      order.status,
      order.updatedAt,
      order.printedAt || "",
      order.acceptedAt || "",
      order.cancelledAt || "",
      order.items?.length || 0
    ].join(":")
  )).join("|");
}

export default function LiveOrdersPage() {
  const { restaurantId } = useParams();
  const { currentUser, logout } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [highlightedOrderIds, setHighlightedOrderIds] = useState([]);
  const [printOrder, setPrintOrder] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [viewedPendingOrderIds, setViewedPendingOrderIds] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const audioContextRef = useRef(null);
  const restaurantLoadedRef = useRef(false);
  const orderListSignatureRef = useRef("");

  const pendingOrders = orders.filter((order) => order.status === "PENDING");
  const acceptedOrders = orders.filter((order) => order.status === "ACCEPTED");
  const activeOrders = orders.filter((order) => ["PENDING", "ACCEPTED"].includes(order.status));
  const completedOrders = orders.filter((order) => order.status === "COMPLETED");
  const cancelledOrders = orders.filter((order) => order.status === "CANCELLED");
  const filteredOrders = statusFilter === "ALL" ? orders : orders.filter((order) => order.status === statusFilter);
  const filterOptions = [
    {
      label: "All",
      value: "ALL",
      count: orders.length
    },
    {
      label: "Pending",
      value: "PENDING",
      count: pendingOrders.length
    },
    {
      label: "In Progress",
      value: "ACCEPTED",
      count: acceptedOrders.length
    },
    {
      label: "Completed",
      value: "COMPLETED",
      count: completedOrders.length
    },
    {
      label: "Cancelled",
      value: "CANCELLED",
      count: cancelledOrders.length
    }
  ];
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
  const viewedPendingOrderIdSet = useMemo(() => new Set(viewedPendingOrderIds), [viewedPendingOrderIds]);
  const unseenPendingOrders = pendingOrders
    .filter((order) => !viewedPendingOrderIdSet.has(order.id))
    .sort((firstOrder, secondOrder) => new Date(firstOrder.createdAt) - new Date(secondOrder.createdAt));
  const newOrderOverlayTarget = !selectedOrder ? unseenPendingOrders[0] : null;
  const newOrderOverlayCount = unseenPendingOrders.length;
  const isNewOrderOverlayActive = Boolean(newOrderOverlayTarget);
  const hasPendingOrders = pendingOrders.length > 0;

  async function loadLiveOrders({ quiet = false } = {}) {
    try {
      if (!quiet) {
        setIsLoading(true);
      }

      setError("");
      const shouldLoadRestaurant = !restaurantLoadedRef.current;
      const [restaurantData, orderData] = await Promise.all([
        shouldLoadRestaurant ? getLiveOrdersRestaurant(restaurantId) : Promise.resolve(null),
        getOrders(restaurantId)
      ]);
      const pendingIds = new Set(orderData.filter((order) => order.status === "PENDING").map((order) => order.id));
      const nextHighlightedOrderIds = [...pendingIds];

      setHighlightedOrderIds((currentIds) => (
        areNumberArraysEqual(currentIds, nextHighlightedOrderIds) ? currentIds : nextHighlightedOrderIds
      ));

      if (restaurantData) {
        restaurantLoadedRef.current = true;
        setRestaurant((currentRestaurant) => (
          JSON.stringify(currentRestaurant) === JSON.stringify(restaurantData) ? currentRestaurant : restaurantData
        ));
      }

      const nextOrderListSignature = getOrderListSignature(orderData);

      if (orderListSignatureRef.current !== nextOrderListSignature) {
        orderListSignatureRef.current = nextOrderListSignature;
        setOrders(orderData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    restaurantLoadedRef.current = false;
    orderListSignatureRef.current = "";
    loadLiveOrders();
    const intervalId = window.setInterval(() => loadLiveOrders({ quiet: true }), 3000);

    return () => window.clearInterval(intervalId);
  }, [restaurantId]);

  useEffect(() => {
    if (!isNewOrderOverlayActive || !soundEnabled || isMuted) {
      return undefined;
    }

    if (audioContextRef.current) {
      playAlertTone(audioContextRef.current);
    }

    const intervalId = window.setInterval(() => {
      const audioContext = audioContextRef.current;

      if (audioContext) {
        playAlertTone(audioContext);
      }
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [isNewOrderOverlayActive, soundEnabled, isMuted]);

  async function enableSoundAlerts() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = audioContextRef.current || new AudioContext();

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      audioContextRef.current = audioContext;
      playAlertTone(audioContext);
      setSoundEnabled(true);
      setIsMuted(false);
      setStatusMessage("Sound alerts are enabled.");
    } catch {
      setError("Sound alerts could not be enabled in this browser.");
    }
  }

  async function handleAccept(orderId) {
    try {
      setError("");
      const order = await acceptOrder(orderId);
      setStatusMessage(`Accepted order #${order.id}.`);
      await loadLiveOrders({ quiet: true });
      setSelectedOrderId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReject(orderId) {
    try {
      setError("");
      const order = await declineOrder(orderId);
      setStatusMessage(`Declined order #${order.id}.`);
      await loadLiveOrders({ quiet: true });
      setSelectedOrderId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleComplete(orderId) {
    try {
      setError("");
      const order = await updateOrderStatus(orderId, "COMPLETED");
      setStatusMessage(`Completed order #${order.id}.`);
      await loadLiveOrders({ quiet: true });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePrint(order) {
    setPrintOrder(order);
    window.setTimeout(async () => {
      window.print();

      try {
        const printedOrder = await markOrderPrinted(order.id);
        setStatusMessage(`Marked order #${printedOrder.id} as printed.`);
        await loadLiveOrders({ quiet: true });
      } catch (err) {
        setError(err.message);
      }
    }, 100);
  }

  function chooseFilter(filterValue) {
    setStatusFilter(filterValue);
    setIsDrawerOpen(false);
    setSelectedOrderId(null);
  }

  function openNewOrderDetail() {
    if (!newOrderOverlayTarget) {
      return;
    }

    setViewedPendingOrderIds((currentIds) => (
      currentIds.includes(newOrderOverlayTarget.id) ? currentIds : [...currentIds, newOrderOverlayTarget.id]
    ));
    setSelectedOrderId(newOrderOverlayTarget.id);
    setStatusFilter("PENDING");
  }

  if (isLoading && !restaurant) {
    return <AdminStatus title="Loading live orders..." />;
  }

  if (error && !restaurant) {
    return <AdminStatus title={error} />;
  }

  return (
    <main className={isNewOrderOverlayActive ? "live-orders-page live-orders-alerting" : "live-orders-page"}>
      {isNewOrderOverlayActive && (
        <button className="new-order-takeover" type="button" onClick={openNewOrderDetail}>
          <span className="new-order-count">
            {newOrderOverlayCount} new order{newOrderOverlayCount === 1 ? "" : "s"}
          </span>
          <strong>NEW ORDER</strong>
          <span>Tap anywhere to view</span>
        </button>
      )}

      <header className="live-orders-header">
        <button className="hamburger-button" type="button" onClick={() => setIsDrawerOpen(true)} aria-label="Open dashboard menu">
          <span />
          <span />
          <span />
        </button>

        <div className="live-orders-title">
          <p className="eyebrow">Live Orders</p>
          <h1>{restaurant.name}</h1>
          <span>{activeOrders.length} active order{activeOrders.length === 1 ? "" : "s"}</span>
        </div>

        <div className="live-orders-header-actions">
          <div className="live-sound-controls">
            {!soundEnabled ? (
              <button className="enable-sound-button" type="button" onClick={enableSoundAlerts}>
                Enable Sound Alerts
              </button>
            ) : (
              <button className="mute-sound-button" type="button" onClick={() => setIsMuted((current) => !current)}>
                {isMuted ? "Unmute Alerts" : "Mute Alerts"}
              </button>
            )}
            <span>{isNewOrderOverlayActive ? "New order alert active" : hasPendingOrders ? "Pending order open" : "No pending alerts"}</span>
          </div>
        </div>
      </header>

      {isDrawerOpen && (
        <div className="live-drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <aside className="live-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="live-drawer-header">
              <h2>Dashboard</h2>
              <button type="button" onClick={() => setIsDrawerOpen(false)} aria-label="Close dashboard menu">
                X
              </button>
            </div>

            <button className={statusFilter === "ALL" ? "drawer-nav-item drawer-nav-item-active" : "drawer-nav-item"} type="button" onClick={() => chooseFilter("ALL")}>
              Live Orders
            </button>
            {filterOptions.slice(1).map((option) => (
              <button
                className={statusFilter === option.value ? "drawer-nav-item drawer-nav-item-active" : "drawer-nav-item"}
                type="button"
                key={option.value}
                onClick={() => chooseFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
            {currentUser && (
              <button className="drawer-nav-item" type="button" onClick={logout}>
                Logout
              </button>
            )}
          </aside>
        </div>
      )}

      <section className="live-filter-bar" aria-label="Order status filters">
        {filterOptions.map((option) => (
          <button
            className={statusFilter === option.value ? "live-filter-button live-filter-button-active" : "live-filter-button"}
            type="button"
            key={option.value}
            onClick={() => setStatusFilter(option.value)}
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </button>
        ))}
      </section>

      <OnlineMenuLink restaurant={restaurant} compact />

      {(statusMessage || error) && (
        <section className={error ? "notice notice-error" : "notice"}>
          {error || statusMessage}
        </section>
      )}

      {selectedOrder ? (
        <OrderDetailView
          order={selectedOrder}
          onBack={() => setSelectedOrderId(null)}
          onAccept={handleAccept}
          onReject={handleReject}
          onPrint={handlePrint}
          onComplete={handleComplete}
        />
      ) : (
        <section className="live-orders-grid">
          {filteredOrders.length === 0 ? (
            <p className="live-empty">No orders match this filter.</p>
          ) : (
            filteredOrders.map((order) => (
              <LiveOrderCard
                key={order.id}
                order={order}
                isHighlighted={highlightedOrderIds.includes(order.id)}
                onAccept={handleAccept}
                onReject={handleReject}
                onPrint={handlePrint}
                onComplete={handleComplete}
              />
            ))
          )}
        </section>
      )}

      {printOrder && <PrintableReceipt restaurant={restaurant} order={printOrder} />}
    </main>
  );
}

function LiveOrderCard({ order, isHighlighted, onAccept, onReject, onPrint, onComplete }) {
  const cardClassName = [
    "live-order-card",
    `live-order-card-${order.status.toLowerCase()}`,
    isHighlighted ? "live-order-card-new" : ""
  ].filter(Boolean).join(" ");

  return (
    <article className={cardClassName}>
      <div className="live-order-card-header">
        <div>
          <p className="eyebrow">Order #{order.id}</p>
          <h3>{order.customerName}</h3>
          <p>{order.customerPhone}</p>
        </div>
        <div className="live-status-stack">
          <span className={`live-status-pill status-${order.status.toLowerCase()}`}>{order.status}</span>
          <time>{new Date(order.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
        </div>
      </div>

      <div className="live-order-card-body">
        {order.notes && <p className="live-order-notes">{order.notes}</p>}
        <ReceiptItems order={order} />
      </div>

      <div className="live-order-card-footer">
        <div className="live-order-total">
          <span>Total</span>
          <strong>{formatPrice(order.total || order.subtotal)}</strong>
        </div>

        <div className="live-order-actions">
          <button className="print-order-button" type="button" onClick={() => onPrint(order)}>
            Print Receipt
          </button>

          {order.status === "PENDING" && (
            <>
              <button className="accept-order-button" type="button" onClick={() => onAccept(order.id)}>
                Accept Order
              </button>
              <button className="reject-order-button" type="button" onClick={() => onReject(order.id)}>
                Decline Order
              </button>
            </>
          )}

          {order.status === "ACCEPTED" && (
            <>
              <button className="complete-order-button" type="button" onClick={() => onComplete(order.id)}>
                Mark Completed
              </button>
            </>
          )}

          {order.printedAt && <span className="printed-stamp">Printed {new Date(order.printedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
        </div>
      </div>
    </article>
  );
}

function OrderDetailView({ order, onBack, onAccept, onReject, onPrint, onComplete }) {
  return (
    <section className="live-order-detail-view">
      <div className="live-order-detail-header">
        <button type="button" onClick={onBack}>Back to Dashboard</button>
        <div>
          <p className="eyebrow">Order #{order.id}</p>
          <h2>{order.customerName}</h2>
          <p>{order.customerPhone}</p>
        </div>
        <div className="live-status-stack">
          <span className={`live-status-pill status-${order.status.toLowerCase()}`}>{order.status}</span>
          <time>{new Date(order.createdAt).toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}</time>
        </div>
      </div>

      <div className="live-order-detail-body">
        {order.notes && (
          <section className="live-order-detail-notes">
            <p className="eyebrow">Notes</p>
            <strong>{order.notes}</strong>
          </section>
        )}

        <section>
          <p className="eyebrow">Items</p>
          <ReceiptItems order={order} />
        </section>
      </div>

      <footer className="live-order-detail-footer">
        <div className="live-order-total">
          <span>Total</span>
          <strong>{formatPrice(order.total || order.subtotal)}</strong>
        </div>

        <div className="live-order-detail-actions">
          <button className="print-order-button" type="button" onClick={() => onPrint(order)}>
            Print Receipt
          </button>

          {order.status === "PENDING" && (
            <>
              <button className="accept-order-button" type="button" onClick={() => onAccept(order.id)}>
                Accept Order
              </button>
              <button className="reject-order-button" type="button" onClick={() => onReject(order.id)}>
                Decline Order
              </button>
            </>
          )}

          {order.status === "ACCEPTED" && (
            <>
              <button className="complete-order-button" type="button" onClick={() => onComplete(order.id)}>
                Mark Completed
              </button>
            </>
          )}
        </div>
      </footer>
    </section>
  );
}

function ReceiptItems({ order }) {
  return (
    <div className="receipt-item-list">
      {order.items.map((item) => (
        <div className="receipt-item" key={item.id}>
          <div className="receipt-item-main">
            <strong>{item.quantity} x {item.name}</strong>
            <span>{formatPrice(Number(item.finalPrice || item.price) * item.quantity)}</span>
          </div>
          {(item.selectedModifiers || []).length > 0 && (
            <ul>
              {item.selectedModifiers.map((modifier) => (
                <li key={`${item.id}-${modifier.groupId}-${modifier.optionId}`}>
                  {modifier.groupName}: {modifier.optionName} +{formatPrice(modifier.priceDelta)}
                </li>
              ))}
            </ul>
          )}
          {item.customerComment && <p>Comment: {item.customerComment}</p>}
        </div>
      ))}
    </div>
  );
}

function PrintableReceipt({ restaurant, order }) {
  return (
    <section className="print-receipt">
      <h1>{restaurant.name}</h1>
      <p>Order #{order.id}</p>
      <p>{new Date(order.createdAt).toLocaleString()}</p>
      <p>{order.customerName} - {order.customerPhone}</p>
      {order.notes && <p>Notes: {order.notes}</p>}
      <ReceiptItems order={order} />
      <div className="print-receipt-total">
        <span>Total</span>
        <strong>{formatPrice(order.total || order.subtotal)}</strong>
      </div>
    </section>
  );
}
