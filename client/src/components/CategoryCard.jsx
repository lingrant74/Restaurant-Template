import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function CategoryCard({ restaurantId, category, itemCount, onSave, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    name: category.name,
    sortOrder: String(category.sortOrder ?? "")
  });

  useEffect(() => {
    setForm({
      name: category.name,
      sortOrder: String(category.sortOrder ?? "")
    });
  }, [category.id, category.name, category.sortOrder]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  async function saveCategory(event) {
    event.preventDefault();
    await onSave(category.id, form);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <article className="category-manage-card">
        <form className="category-edit-form" onSubmit={saveCategory}>
          <label>
            Name
            <input name="name" value={form.name} onChange={updateField} required />
          </label>
          <label>
            Sort Order
            <input name="sortOrder" type="number" value={form.sortOrder} onChange={updateField} />
          </label>
          <div className="category-card-actions">
            <button type="submit">Save</button>
            <button type="button" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className="category-manage-card">
      <Link className="category-card-link" to={`/admin/restaurants/${restaurantId}/categories/${category.id}`}>
        <div>
          <h3>{category.name}</h3>
          <p>{itemCount} {itemCount === 1 ? "item" : "items"}</p>
        </div>
        <span>Sort {category.sortOrder}</span>
      </Link>

      <div className="category-card-actions">
        <button type="button" onClick={() => setIsEditing(true)}>
          Edit
        </button>
        <button className="danger-button" type="button" onClick={() => onDelete(category.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}
