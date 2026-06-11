import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createRestaurant, getRestaurants } from "../api.js";
import AdminHeader from "../components/AdminHeader.jsx";
import { createSlug, emptyRestaurantForm } from "../utils.js";

export default function RestaurantsPage() {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantForm, setRestaurantForm] = useState(emptyRestaurantForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadRestaurants() {
    try {
      setIsLoading(true);
      setError("");
      const data = await getRestaurants();
      setRestaurants(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRestaurants();
  }, []);

  function updateRestaurantField(event) {
    const { name, value } = event.target;

    setRestaurantForm((currentForm) => ({
      ...currentForm,
      [name]: value,
      ...(name === "name" ? { slug: createSlug(value) } : {})
    }));
  }

  async function submitRestaurant(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    try {
      const restaurant = await createRestaurant(restaurantForm);
      setRestaurantForm(emptyRestaurantForm);
      setStatusMessage(`Created ${restaurant.name}.`);
      navigate(`/admin/restaurants/${restaurant.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="admin-page">
      <AdminHeader title="Restaurants" />

      {(statusMessage || error) && (
        <section className={error ? "notice notice-error" : "notice"}>
          {error || statusMessage}
        </section>
      )}

      <section className="admin-grid">
        <form className="editor-panel" onSubmit={submitRestaurant}>
          <div className="panel-heading">
            <p className="eyebrow">Restaurant</p>
            <h2>Create Restaurant</h2>
          </div>

          <label>
            Name
            <input name="name" value={restaurantForm.name} onChange={updateRestaurantField} required />
          </label>

          <label>
            Slug
            <input name="slug" value={restaurantForm.slug} onChange={updateRestaurantField} required />
          </label>

          <label>
            Description
            <textarea name="description" value={restaurantForm.description} onChange={updateRestaurantField} rows="3" />
          </label>

          <label>
            Address
            <input name="address" value={restaurantForm.address} onChange={updateRestaurantField} />
          </label>

          <label>
            Phone
            <input name="phone" value={restaurantForm.phone} onChange={updateRestaurantField} />
          </label>

          <label>
            Theme Color
            <input name="themeColor" type="color" value={restaurantForm.themeColor} onChange={updateRestaurantField} />
          </label>

          <button type="submit">Create Restaurant</button>
        </form>

        <section className="restaurant-list flat-panel">
          <div className="panel-heading">
            <p className="eyebrow">Manage</p>
            <h2>Choose Restaurant</h2>
          </div>

          {isLoading ? (
            <p className="empty-message">Loading restaurants...</p>
          ) : restaurants.length === 0 ? (
            <p className="empty-message">No restaurants yet.</p>
          ) : (
            <div className="list-grid">
              {restaurants.map((restaurant) => (
                <Link className="restaurant-card clickable-card" key={restaurant.id} to={`/admin/restaurants/${restaurant.id}`}>
                  <div>
                    <h3>{restaurant.name}</h3>
                    <p>/{restaurant.slug}</p>
                    {restaurant.address && <p>{restaurant.address}</p>}
                  </div>
                  <span>{restaurant._count?.menuItems || restaurant.menuItems?.length || 0} items</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
