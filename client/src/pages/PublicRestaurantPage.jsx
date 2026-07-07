import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createOrder, getPublicRestaurant } from "../api.js";
import LegalFooter from "../components/LegalFooter.jsx";
import { createAnchorId, formatPrice, getItemModifierGroups, getJapaneseCategoryLabel, groupMenuItems } from "../utils.js";

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
  const [customizingItem, setCustomizingItem] = useState(null);
  const [modifierSelections, setModifierSelections] = useState({});
  const [modifierError, setModifierError] = useState("");

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

  const visibleCategories = useMemo(() => {
    if (!restaurant) {
      return [];
    }

    const categoriesWithItems = new Set(Object.keys(groupedMenuItems));
    const sortedCategories = (restaurant.categories || [])
      .filter((category) => categoriesWithItems.has(category.name))
      .sort((firstCategory, secondCategory) => firstCategory.sortOrder - secondCategory.sortOrder)
      .map((category) => ({
        key: category.name,
        label: getJapaneseCategoryLabel(category.name)
      }));
    const sortedCategoryKeys = sortedCategories.map((category) => category.key);
    const uncategorizedNames = Object.keys(groupedMenuItems)
      .filter((categoryName) => !sortedCategoryKeys.includes(categoryName))
      .map((categoryName) => ({
        key: categoryName,
        label: getJapaneseCategoryLabel(categoryName)
      }));

    return [...sortedCategories, ...uncategorizedNames];
  }, [restaurant, groupedMenuItems]);

  const cartItemsList = Object.values(cartItems);
  const cartSubtotal = cartItemsList.reduce((total, item) => total + Number(item.price) * item.quantity, 0);

  function addToCart(item) {
    const modifierGroups = getItemModifierGroups(item);

    if (modifierGroups.length > 0) {
      setCustomizingItem(item);
      setModifierSelections({});
      setModifierError("");
      return;
    }

    addCartLine(item, [], Number(item.price));
  }

  function addCartLine(item, selectedModifiers, finalPrice) {
    const optionKey = selectedModifiers.map((modifier) => modifier.optionId).sort((a, b) => a - b).join("-");
    const cartKey = `${item.id}:${optionKey || "plain"}`;

    setCartItems((currentCart) => {
      const existingItem = currentCart[cartKey];

      return {
        ...currentCart,
        [cartKey]: {
          id: cartKey,
          menuItemId: item.id,
          name: item.name,
          basePrice: item.price,
          price: finalPrice.toFixed(2),
          selectedModifiers,
          customerComment: existingItem?.customerComment || "",
          quantity: existingItem ? existingItem.quantity + 1 : 1
        }
      };
    });
  }

  function updateCartItemComment(itemId, customerComment) {
    setCartItems((currentCart) => ({
      ...currentCart,
      [itemId]: {
        ...currentCart[itemId],
        customerComment
      }
    }));
  }

  function getSelectedModifierSnapshots(item, shouldValidate = false) {
    const modifierGroups = getItemModifierGroups(item);
    const snapshots = [];

    for (const group of modifierGroups) {
      const selectedOptionIds = modifierSelections[group.id] || [];
      const requiredMinimum = group.required ? Math.max(group.minSelections || 0, 1) : group.minSelections || 0;

      if (shouldValidate && selectedOptionIds.length < requiredMinimum) {
        throw new Error(`${group.name} requires at least ${requiredMinimum} selection${requiredMinimum === 1 ? "" : "s"}.`);
      }

      if (shouldValidate && !group.allowMultiple && selectedOptionIds.length > 1) {
        throw new Error(`${group.name} only allows one selection.`);
      }

      if (shouldValidate && group.maxSelections !== null && selectedOptionIds.length > group.maxSelections) {
        throw new Error(`${group.name} allows at most ${group.maxSelections} selection${group.maxSelections === 1 ? "" : "s"}.`);
      }

      for (const optionId of selectedOptionIds) {
        const option = (group.options || []).find((currentOption) => currentOption.id === optionId);

        if (option) {
          snapshots.push({
            groupId: group.id,
            groupName: group.name,
            optionId: option.id,
            optionName: option.name,
            priceDelta: Number(option.priceDelta).toFixed(2)
          });
        }
      }
    }

    return snapshots;
  }

  function updateModifierSelection(group, optionId, checked) {
    setModifierSelections((currentSelections) => {
      if (!group.allowMultiple) {
        return {
          ...currentSelections,
          [group.id]: [optionId]
        };
      }

      const currentGroupSelections = currentSelections[group.id] || [];

      return {
        ...currentSelections,
        [group.id]: checked
          ? [...currentGroupSelections, optionId]
          : currentGroupSelections.filter((id) => id !== optionId)
      };
    });
  }

  function addCustomizedItemToCart() {
    try {
      const selectedModifiers = getSelectedModifierSnapshots(customizingItem, true);
      const finalPrice = selectedModifiers.reduce(
        (total, modifier) => total + Number(modifier.priceDelta),
        Number(customizingItem.price)
      );

      addCartLine(customizingItem, selectedModifiers, finalPrice);
      setCustomizingItem(null);
      setModifierSelections({});
      setModifierError("");
    } catch (err) {
      setModifierError(err.message);
    }
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
    const nextValue = name === "customerPhone" ? value.replace(/\D/g, "").slice(0, 10) : value;

    setCustomerForm((currentForm) => ({
      ...currentForm,
      [name]: nextValue
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

    if (!/^\d{10}$/.test(customerForm.customerPhone)) {
      setOrderError("Phone number must be exactly 10 numbers.");
      return;
    }

    try {
      setIsSubmittingOrder(true);
      const order = await createOrder(restaurant.id, {
        ...customerForm,
        items: cartItemsList.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          customerComment: item.customerComment,
          selectedModifiers: item.selectedModifiers
        }))
      });

      setCartItems({});
      setCustomerForm({
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        notes: ""
      });
      setOrderMessage(`Order #${order.id} was placed successfully.`);
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
        <div className="section-heading japanese-menu-heading">
          <div>
            <p className="eyebrow">Japanese Menu</p>
            <h2>Available Items</h2>
          </div>
        </div>

        <div className="public-menu-layout">
          <aside className="category-sidebar">
            <p className="eyebrow">Categories</p>
            <nav>
              {visibleCategories.map((category) => (
                <a href={`#${createAnchorId(category.key)}`} key={category.key}>
                  <span className="category-nav-icon" aria-hidden="true" />
                  {category.label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="menu-and-cart">
            <div>
            {restaurant.menuItems.length === 0 ? (
              <p className="empty-message">No available menu items yet.</p>
            ) : (
              visibleCategories.map((category) => (
                <div className="category-group" id={createAnchorId(category.key)} key={category.key}>
                  <h3>{category.label}</h3>
                  <div className="menu-grid">
                    {groupedMenuItems[category.key].map((item) => (
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
                      {item.selectedModifiers.length > 0 && (
                        <ul className="cart-modifiers">
                          {item.selectedModifiers.map((modifier) => (
                            <li key={`${modifier.groupId}-${modifier.optionId}`}>
                              {modifier.groupName}: {modifier.optionName} +{formatPrice(modifier.priceDelta)}
                            </li>
                          ))}
                        </ul>
                      )}
                      <label className="cart-item-comment">
                        Item comment
                        <textarea
                          rows="2"
                          value={item.customerComment}
                          onChange={(event) => updateCartItemComment(item.id, event.target.value)}
                          placeholder="No scallions, extra spicy, sauce on the side..."
                        />
                      </label>
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
                <input
                  name="customerPhone"
                  value={customerForm.customerPhone}
                  onChange={updateCustomerField}
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength="10"
                  placeholder="10 digit phone number"
                  required
                />
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
        </div>
      </section>

      {customizingItem && (
        <ModifierModal
          item={customizingItem}
          modifierSelections={modifierSelections}
          modifierError={modifierError}
          onSelect={updateModifierSelection}
          onClose={() => setCustomizingItem(null)}
          onAdd={addCustomizedItemToCart}
          previewModifiers={getSelectedModifierSnapshots(customizingItem)}
        />
      )}

      <LegalFooter variant="public" />
    </main>
  );
}

function ModifierModal({ item, modifierSelections, modifierError, previewModifiers, onSelect, onClose, onAdd }) {
  const modifierGroups = getItemModifierGroups(item);
  const finalPrice = previewModifiers.reduce((total, modifier) => total + Number(modifier.priceDelta), Number(item.price));

  return (
    <div className="modal-backdrop">
      <section className="modifier-modal">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Customize</p>
            <h2>{item.name}</h2>
            <p>Base price {formatPrice(item.price)}</p>
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {modifierGroups.map((group) => (
          <fieldset className="public-modifier-group" key={group.id}>
            <legend>
              {group.name}
              {group.required && " (required)"}
            </legend>

            {(group.options || []).map((option) => {
              const inputType = group.allowMultiple ? "checkbox" : "radio";
              const selectedOptionIds = modifierSelections[group.id] || [];

              return (
                <label className="modifier-option-choice" key={option.id}>
                  <input
                    type={inputType}
                    name={`modifier-${group.id}`}
                    checked={selectedOptionIds.includes(option.id)}
                    onChange={(event) => onSelect(group, option.id, event.target.checked)}
                  />
                  <span>{option.name}</span>
                  <strong>+{formatPrice(option.priceDelta)}</strong>
                </label>
              );
            })}
          </fieldset>
        ))}

        {modifierError && <div className="order-message order-message-error">{modifierError}</div>}

        <div className="modifier-modal-footer">
          <strong>Total {formatPrice(finalPrice)}</strong>
          <button type="button" onClick={onAdd}>
            Add to cart
          </button>
        </div>
      </section>
    </div>
  );
}
