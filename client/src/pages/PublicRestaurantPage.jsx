import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createOrder, getPublicRestaurant } from "../api.js";
import { formatPrice, groupMenuItems } from "../utils.js";

export default function PublicRestaurantPage() {
  const { slug } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [cartItems, setCartItems] = useState({});
  const [customerForm, setCustomerForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    notes: ""
  });
  const [orderMessage, setOrderMessage] = useState("");
  const [orderError, setOrderError] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRestaurant() {
      if (!slug) {
        setStatus("error");
        setError("Add a restaurant slug to the URL, like /joes-pizza.");
        return;
      }

      try {
        setStatus("loading");
        setError("");
        const data = await getPublicRestaurant(slug);
        setRestaurant(data);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setError(err.message);
      }
    }

    loadRestaurant();
  }, [slug]);

  const groupedMenuItems = useMemo(() => {
    if (!restaurant) {
      return {};
    }

    return groupMenuItems(restaurant.menuItems || []);
  }, [restaurant]);

  const cartItemsList = Object.values(cartItems);
  const cartSubtotal = cartItemsList.reduce((total, item) => total + Number(item.price) * item.quantity, 0);

  function addToCart(item) {
    setCartItems((currentCart) => {
      const existingItem = currentCart[item.id];

      return {
        ...currentCart,
        [item.id]: {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: existingItem ? existingItem.quantity + 1 : 1
        }
      };
    });
  }

  function updateCartQuantity(itemId, change) {
    setCartItems((currentCart) => {
      const item = currentCart[itemId];

      if (!item) {
        return currentCart;
      }

      const nextQuantity = item.quantity + change;

      if (nextQuantity <= 0) {
        const updatedCart = { ...currentCart };
        delete updatedCart[itemId];
        return updatedCart;
      }

      return {
        ...currentCart,
        [itemId]: {
          ...item,
          quantity: nextQuantity
        }
      };
    });
  }

  function removeFromCart(itemId) {
    setCartItems((currentCart) => {
      const updatedCart = { ...currentCart };
      delete updatedCart[itemId];
      return updatedCart;
    });
  }

  function updateCustomerField(event) {
    const { name, value } = event.target;
    setCustomerForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  async function placeOrder(event) {
    event.preventDefault();
    setOrderError("");
    setOrderMessage("");

    if (cartItemsList.length === 0) {
      setOrderError("Add at least one item to your cart first.");
      return;
    }

    if (!customerForm.customerName.trim() || !customerForm.customerPhone.trim()) {
      setOrderError("Name and phone number are required.");
      return;
    }

    try {
      setIsSubmittingOrder(true);
      const order = await createOrder(restaurant.id, {
        ...customerForm,
        items: cartItemsList.map((item) => ({
          menuItemId: item.id,
          quantity: item.quantity
        }))
      });

      setCartItems({});
      setCustomerForm({
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        notes: ""
      });
      setOrderMessage(`Order #${order.id} placed. Total: ${formatPrice(order.total || order.subtotal)}.`);
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="page page-center">
        <div className="status-box">
          <p className="eyebrow">Loading</p>
          <h1>Getting the menu ready...</h1>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="page page-center">
        <div className="status-box">
          <p className="eyebrow">Error</p>
          <h1>{error}</h1>
          <p>Check the slug in the URL and make sure the backend server is running.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page" style={{ "--theme-color": restaurant.themeColor || "#d62828" }}>
      <section className="hero">
        <div>
          <p className="eyebrow">Now serving</p>
          <h1>{restaurant.name}</h1>
          {restaurant.description && <p className="description">{restaurant.description}</p>}
        </div>

        <div className="restaurant-details">
          {restaurant.address && <p>{restaurant.address}</p>}
          {restaurant.phone && <p>{restaurant.phone}</p>}
          <span className="theme-chip">Theme {restaurant.themeColor || "#d62828"}</span>
        </div>
      </section>

      <section className="menu-section">
        <div className="section-heading">
          <p className="eyebrow">Menu</p>
          <h2>Available Items</h2>
        </div>

        <div className="menu-and-cart">
          <div>
            {restaurant.menuItems.length === 0 ? (
              <p className="empty-message">No available menu items yet.</p>
            ) : (
              Object.entries(groupedMenuItems).map(([category, items]) => (
                <div className="category-group" key={category}>
                  <h3>{category}</h3>
                  <div className="menu-grid">
                    {items.map((item) => (
                      <article className="menu-item" key={item.id}>
                        <div>
                          <h4>{item.name}</h4>
                          {item.description && <p>{item.description}</p>}
                        </div>
                        <div className="menu-item-actions">
                          <strong>{formatPrice(item.price)}</strong>
                          <button type="button" onClick={() => addToCart(item)}>
                            Add to cart
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <aside className="cart-panel">
            <div className="cart-heading">
              <p className="eyebrow">Cart</p>
              <h3>Your Order</h3>
            </div>

            {cartItemsList.length === 0 ? (
              <p className="cart-empty">Your cart is empty.</p>
            ) : (
              <div className="cart-items">
                {cartItemsList.map((item) => (
                  <div className="cart-item" key={item.id}>
                    <div>
                      <h4>{item.name}</h4>
                      <p>{formatPrice(item.price)} each</p>
                    </div>

                    <div className="quantity-controls">
                      <button type="button" onClick={() => updateCartQuantity(item.id, -1)}>
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => updateCartQuantity(item.id, 1)}>
                        +
                      </button>
                    </div>

                    <strong>{formatPrice(Number(item.price) * item.quantity)}</strong>

                    <button className="remove-button" type="button" onClick={() => removeFromCart(item.id)}>
                      Remove
                    </button>
                  </div>
                ))}

                <div className="cart-subtotal">
                  <span>Subtotal</span>
                  <strong>{formatPrice(cartSubtotal)}</strong>
                </div>
              </div>
            )}

            {(orderMessage || orderError) && (
              <div className={orderError ? "order-message order-message-error" : "order-message"}>
                {orderError || orderMessage}
              </div>
            )}

            <form className="order-form" onSubmit={placeOrder}>
              <label>
                Name
                <input name="customerName" value={customerForm.customerName} onChange={updateCustomerField} required />
              </label>

              <label>
                Phone
                <input name="customerPhone" value={customerForm.customerPhone} onChange={updateCustomerField} required />
              </label>

              <label>
                Email
                <input name="customerEmail" type="email" value={customerForm.customerEmail} onChange={updateCustomerField} />
              </label>

              <label>
                Notes
                <textarea name="notes" rows="3" value={customerForm.notes} onChange={updateCustomerField} />
              </label>

              <button type="submit" disabled={cartItemsList.length === 0 || isSubmittingOrder}>
                {isSubmittingOrder ? "Placing Order..." : "Place Order"}
              </button>
            </form>
          </aside>
        </div>
      </section>
    </main>
  );
}
