import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrders, getRestaurant, updateOrderStatus } from "../api.js";
import AdminHeader from "../components/AdminHeader.jsx";
import AdminStatus from "../components/AdminStatus.jsx";
import { formatPrice } from "../utils.js";

const orderStatuses = ["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"];

export default function OrdersPage() {
  const { restaurantId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadOrdersPage() {
    try {
      setIsLoading(true);
      setError("");
      const [restaurantData, orderData] = await Promise.all([
        getRestaurant(restaurantId),
        getOrders(restaurantId)
      ]);
      setRestaurant(restaurantData);
      setOrders(orderData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrdersPage();
  }, [restaurantId]);

  async function changeOrderStatus(orderId, status) {
    try {
      setError("");
      setStatusMessage("");
      const order = await updateOrderStatus(orderId, status);
      setStatusMessage(`Order #${order.id} updated to ${order.status}.`);
      await loadOrdersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  if (isLoading) {
    return <AdminStatus title="Loading orders..." />;
  }

  if (error && !restaurant) {
    return <AdminStatus title={error} />;
  }

  return (
    <main className="admin-page">
      <AdminHeader title="Orders" eyebrow={restaurant.name}>
        <Link to={`/admin/restaurants/${restaurant.id}`}>Back</Link>
      </AdminHeader>

      {(statusMessage || error) && (
        <section className={error ? "notice notice-error" : "notice"}>
          {error || statusMessage}
        </section>
      )}

      <section className="restaurant-list">
        <div className="panel-heading">
          <p className="eyebrow">Kitchen</p>
          <h2>Restaurant Orders</h2>
        </div>

        {orders.length === 0 ? (
          <p className="empty-message">No orders yet.</p>
        ) : (
          <div className="orders-list">
            {orders.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-card-header">
                  <div>
                    <p className="eyebrow">Order #{order.id}</p>
                    <h3>{order.customerName}</h3>
                    <p>{order.customerPhone}</p>
                    {order.customerEmail && <p>{order.customerEmail}</p>}
                  </div>

                  <label className="order-status-control">
                    Status
                    <select value={order.status} onChange={(event) => changeOrderStatus(order.id, event.target.value)}>
                      {orderStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {order.notes && <p className="order-notes">{order.notes}</p>}

                <div className="order-items">
                  {order.items.map((item) => (
                    <div className="order-item-row" key={item.id}>
                      <div>
                        <span>{item.quantity} x {item.name}</span>
                        {(item.selectedModifiers || []).length > 0 && (
                          <ul className="cart-modifiers">
                            {item.selectedModifiers.map((modifier) => (
                              <li key={`${item.id}-${modifier.groupId}-${modifier.optionId}`}>
                                {modifier.groupName}: {modifier.optionName} +{formatPrice(modifier.priceDelta)}
                              </li>
                            ))}
                          </ul>
                        )}
                        {item.customerComment && (
                          <p className="order-item-comment">Comment: {item.customerComment}</p>
                        )}
                      </div>
                      <strong>{formatPrice(Number(item.finalPrice || item.price) * item.quantity)}</strong>
                    </div>
                  ))}
                </div>

                <div className="order-total-row">
                  <span>{new Date(order.createdAt).toLocaleString()}</span>
                  <strong>Total {formatPrice(order.total || order.subtotal)}</strong>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
