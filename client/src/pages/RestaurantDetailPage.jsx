import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createCategory, deleteCategory, getRestaurant, updateCategory } from "../api.js";
import AdminHeader from "../components/AdminHeader.jsx";
import AdminStatus from "../components/AdminStatus.jsx";
import CategoryCard from "../components/CategoryCard.jsx";
import CategoryForm from "../components/CategoryForm.jsx";
import OnlineMenuLink from "../components/OnlineMenuLink.jsx";
import { emptyCategoryForm } from "../utils.js";

export default function RestaurantDetailPage() {
  const { restaurantId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadRestaurant() {
    try {
      setIsLoading(true);
      setError("");
      const data = await getRestaurant(restaurantId);
      setRestaurant(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRestaurant();
  }, [restaurantId]);

  function updateCategoryField(event) {
    const { name, value } = event.target;
    setCategoryForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  async function submitCategory(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    try {
      const category = await createCategory(restaurantId, categoryForm);
      setCategoryForm(emptyCategoryForm);
      setStatusMessage(`Added ${category.name}.`);
      await loadRestaurant();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCategory(categoryId, form) {
    setError("");
    setStatusMessage("");

    try {
      const category = await updateCategory(categoryId, form);
      setStatusMessage(`Saved ${category.name}.`);
      await loadRestaurant();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeCategory(categoryId) {
    setError("");
    setStatusMessage("");

    try {
      await deleteCategory(categoryId);
      setStatusMessage("Deleted category.");
      await loadRestaurant();
    } catch (err) {
      setError(err.message);
    }
  }

  if (isLoading) {
    return <AdminStatus title="Loading restaurant..." />;
  }

  if (error && !restaurant) {
    return <AdminStatus title={error} />;
  }

  return (
    <main className="admin-page">
      <AdminHeader title={restaurant.name}>
        <Link to="/admin">Back</Link>
        <Link className="admin-action-link" to={`/admin/restaurants/${restaurant.id}/orders`}>
          Orders
        </Link>
        <Link className="admin-action-link" to={`/admin/restaurants/${restaurant.id}/live-orders`}>
          Live Orders
        </Link>
        <Link className="admin-action-link" to={`/admin/restaurants/${restaurant.id}/modifiers`}>
          Modifiers
        </Link>
        <Link className="admin-action-link" to={`/admin/restaurants/${restaurant.id}/users`}>
          Restaurant Users
        </Link>
      </AdminHeader>

      {(statusMessage || error) && (
        <section className={error ? "notice notice-error" : "notice"}>
          {error || statusMessage}
        </section>
      )}

      <OnlineMenuLink restaurant={restaurant} />

      <section className="restaurant-list">
        <div className="panel-heading">
          <p className="eyebrow">Categories</p>
          <h2>Menu Categories</h2>
        </div>

        <CategoryForm value={categoryForm} onChange={updateCategoryField} onSubmit={submitCategory} />

        {restaurant.categories.length === 0 ? (
          <p className="empty-message">No categories yet.</p>
        ) : (
          <div className="category-card-grid">
            {restaurant.categories.map((category) => {
              const itemCount = restaurant.menuItems.filter((item) => item.categoryId === category.id).length;

              return (
                <CategoryCard
                  key={category.id}
                  restaurantId={restaurant.id}
                  category={category}
                  itemCount={itemCount}
                  onSave={saveCategory}
                  onDelete={removeCategory}
                />
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
