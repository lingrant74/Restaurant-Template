import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createMenuItem,
  deleteMenuItem,
  getCategoryItems,
  getModifierGroups,
  getRestaurant,
  setMenuItemModifierGroups,
  updateMenuItem
} from "../api.js";
import AdminHeader from "../components/AdminHeader.jsx";
import AdminStatus from "../components/AdminStatus.jsx";
import MenuItemCard from "../components/MenuItemCard.jsx";
import MenuItemForm from "../components/MenuItemForm.jsx";
import { emptyMenuItemForm } from "../utils.js";

export default function CategoryDetailPage() {
  const { restaurantId, categoryId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [category, setCategory] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [menuItemForm, setMenuItemForm] = useState(emptyMenuItemForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadCategoryPage() {
    try {
      setIsLoading(true);
      setError("");
      const [restaurantData, categoryData, modifierGroupData] = await Promise.all([
        getRestaurant(restaurantId),
        getCategoryItems(restaurantId, categoryId),
        getModifierGroups(restaurantId)
      ]);
      setRestaurant(restaurantData);
      setCategory(categoryData.category);
      setMenuItems(categoryData.menuItems);
      setModifierGroups(modifierGroupData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCategoryPage();
  }, [restaurantId, categoryId]);

  function updateMenuItemField(event) {
    const { name, value, type, checked } = event.target;

    if (name === "modifierGroupIds") {
      const groupId = Number(value);
      setMenuItemForm((currentForm) => ({
        ...currentForm,
        modifierGroupIds: checked
          ? [...(currentForm.modifierGroupIds || []), groupId]
          : (currentForm.modifierGroupIds || []).filter((id) => id !== groupId)
      }));
      return;
    }

    setMenuItemForm((currentForm) => ({
      ...currentForm,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  async function submitMenuItem(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    try {
      const menuItem = await createMenuItem(restaurantId, {
        ...menuItemForm,
        categoryId: Number(categoryId)
      });

      await setMenuItemModifierGroups(menuItem.id, menuItemForm.modifierGroupIds || []);
      setMenuItemForm(emptyMenuItemForm);
      setStatusMessage(`Added ${menuItem.name}.`);
      await loadCategoryPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveMenuItem(menuItemId, form) {
    setError("");
    setStatusMessage("");

    try {
      const updatedItem = await updateMenuItem(menuItemId, {
        ...form,
        categoryId: Number(categoryId)
      });
      await setMenuItemModifierGroups(menuItemId, form.modifierGroupIds || []);
      setStatusMessage(`Saved ${updatedItem.name}.`);
      await loadCategoryPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeMenuItem(menuItemId) {
    setError("");
    setStatusMessage("");

    try {
      await deleteMenuItem(menuItemId);
      setStatusMessage("Deleted menu item.");
      await loadCategoryPage();
    } catch (err) {
      setError(err.message);
    }
  }

  if (isLoading) {
    return <AdminStatus title="Loading category..." />;
  }

  if (error && (!restaurant || !category)) {
    return <AdminStatus title={error} />;
  }

  return (
    <main className="admin-page">
      <AdminHeader title={category.name} eyebrow={restaurant.name}>
        <Link to={`/admin/restaurants/${restaurant.id}`}>Back</Link>
      </AdminHeader>

      {(statusMessage || error) && (
        <section className={error ? "notice notice-error" : "notice"}>
          {error || statusMessage}
        </section>
      )}

      <section className="admin-grid">
        <MenuItemForm value={menuItemForm} modifierGroups={modifierGroups} onChange={updateMenuItemField} onSubmit={submitMenuItem} />

        <section className="restaurant-list flat-panel">
          <div className="panel-heading">
            <p className="eyebrow">Menu</p>
            <h2>{category.name} Items</h2>
          </div>

          {menuItems.length === 0 ? (
            <p className="empty-message">No items in this category yet.</p>
          ) : (
            <div className="menu-admin-grid">
              {menuItems.map((item) => (
                <MenuItemCard key={item.id} item={item} modifierGroups={modifierGroups} onSave={saveMenuItem} onDelete={removeMenuItem} />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
