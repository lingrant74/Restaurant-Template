import { useEffect, useState } from "react";
import { formatPrice } from "../utils.js";

export default function MenuItemCard({ item, onSave, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    name: item.name,
    description: item.description || "",
    imageUrl: item.imageUrl || "",
    price: String(item.price),
    isAvailable: item.isAvailable
  });

  useEffect(() => {
    setForm({
      name: item.name,
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      price: String(item.price),
      isAvailable: item.isAvailable
    });
  }, [item]);

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  async function saveItem(event) {
    event.preventDefault();
    await onSave(item.id, form);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <article className="edit-menu-item">
        <form className="edit-menu-form" onSubmit={saveItem}>
          <div className="edit-menu-fields">
            <label>
              Name
              <input name="name" value={form.name} onChange={updateField} required />
            </label>
            <label>
              Price
              <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={updateField} required />
            </label>
            <label>
              Image URL
              <input name="imageUrl" value={form.imageUrl} onChange={updateField} />
            </label>
            <label>
              Description
              <textarea name="description" rows="2" value={form.description} onChange={updateField} />
            </label>
            <label className="checkbox-row">
              <input name="isAvailable" type="checkbox" checked={Boolean(form.isAvailable)} onChange={updateField} />
              Available
            </label>
          </div>

          <div className="edit-menu-actions">
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
    <article className="menu-admin-card">
      <div>
        <div className="menu-admin-heading">
          <h3>{item.name}</h3>
          <strong>{formatPrice(item.price)}</strong>
        </div>
        {item.description && <p>{item.description}</p>}
        {item.imageUrl && <p className="muted-text">{item.imageUrl}</p>}
        <span className={item.isAvailable ? "availability-pill" : "availability-pill unavailable"}>
          {item.isAvailable ? "Available" : "Unavailable"}
        </span>
      </div>

      <div className="edit-menu-actions">
        <button type="button" onClick={() => setIsEditing(true)}>
          Edit
        </button>
        <button className="danger-button" type="button" onClick={() => onDelete(item.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}
