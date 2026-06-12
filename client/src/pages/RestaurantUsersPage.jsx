import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createRestaurantUser, deleteRestaurantUser, getRestaurant, getRestaurantUsers, updateRestaurantUser } from "../api.js";
import AdminHeader from "../components/AdminHeader.jsx";
import AdminStatus from "../components/AdminStatus.jsx";

export default function RestaurantUsersPage() {
  const { restaurantId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    email: "",
    name: "",
    status: "PENDING"
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadUsersPage() {
    try {
      setIsLoading(true);
      setError("");
      const [restaurantData, usersData] = await Promise.all([
        getRestaurant(restaurantId),
        getRestaurantUsers(restaurantId)
      ]);
      setRestaurant(restaurantData);
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsersPage();
  }, [restaurantId]);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  async function submitUser(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    try {
      const user = await createRestaurantUser(restaurantId, form);
      setForm({
        email: "",
        name: "",
        status: "PENDING"
      });
      setStatusMessage(`Added ${user.email}.`);
      await loadUsersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeStatus(userId, status) {
    try {
      setError("");
      setStatusMessage("");
      const user = await updateRestaurantUser(userId, { status });
      setStatusMessage(`${user.email} is now ${user.status}.`);
      await loadUsersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeUser(userId) {
    try {
      setError("");
      setStatusMessage("");
      await deleteRestaurantUser(userId);
      setStatusMessage("Restaurant user removed.");
      await loadUsersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  if (isLoading) {
    return <AdminStatus title="Loading restaurant users..." />;
  }

  if (error && !restaurant) {
    return <AdminStatus title={error} />;
  }

  return (
    <main className="admin-page">
      <AdminHeader title="Restaurant Users" eyebrow={restaurant.name}>
        <Link to={`/admin/restaurants/${restaurant.id}`}>Back</Link>
      </AdminHeader>

      {(statusMessage || error) && (
        <section className={error ? "notice notice-error" : "notice"}>
          {error || statusMessage}
        </section>
      )}

      <section className="admin-grid">
        <form className="editor-panel" onSubmit={submitUser}>
          <div className="panel-heading">
            <p className="eyebrow">Tablet Account</p>
            <h2>Add Restaurant User</h2>
          </div>

          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={updateForm} required />
          </label>

          <label>
            Name
            <input name="name" value={form.name} onChange={updateForm} />
          </label>

          <label>
            Status
            <select name="status" value={form.status} onChange={updateForm}>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>

          <button type="submit">Add User</button>
        </form>

        <section className="restaurant-list flat-panel">
          <div className="panel-heading">
            <p className="eyebrow">Access</p>
            <h2>Assigned Users</h2>
          </div>

          {users.length === 0 ? (
            <p className="empty-message">No restaurant users yet.</p>
          ) : (
            <div className="restaurant-user-list">
              {users.map((user) => (
                <article className="restaurant-user-card" key={user.id}>
                  <div>
                    <p className="eyebrow">{user.status}</p>
                    <h3>{user.name || user.email}</h3>
                    <p>{user.email}</p>
                    <p>{user.role}</p>
                  </div>

                  <div className="restaurant-user-actions">
                    <button type="button" onClick={() => changeStatus(user.id, "APPROVED")}>Approve</button>
                    <button type="button" onClick={() => changeStatus(user.id, "REJECTED")}>Reject</button>
                    <button className="danger-button" type="button" onClick={() => removeUser(user.id)}>Remove</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
