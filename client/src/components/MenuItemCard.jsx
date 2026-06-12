import { useEffect, useState } from "react";
import { formatPrice } from "../utils.js";

export default function MenuItemCard({ item, modifierGroups = [], onSave, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    name: item.name,
    description: item.description || "",
    imageUrl: item.imageUrl || "",
    price: String(item.price),
    isAvailable: item.isAvailable,
    modifierGroupIds: (item.modifierGroupLinks || []).map((link) => link.modifierGroupId)
  });

  useEffect(() => {
    setForm({
      name: item.name,
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      price: String(item.price),
      isAvailable: item.isAvailable,
      modifierGroupIds: (item.modifierGroupLinks || []).map((link) => link.modifierGroupId)
    });
  }, [item]);

  function updateField(event) {
    const { name, value, type, checked } = event.target;

    if (name === "modifierGroupIds") {
      const groupId = Number(value);
      setForm((currentForm) => ({
        ...currentForm,
        modifierGroupIds: checked
          ? [...(currentForm.modifierGroupIds || []), groupId]
          : (currentForm.modifierGroupIds || []).filter((id) => id !== groupId)
      }));
      return;
    }

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
            <label className="edit-description-field">
              Description
              <textarea name="description" rows="2" value={form.description} onChange={updateField} />
            </label>
            <label className="checkbox-row edit-availability-field">
              <input name="isAvailable" type="checkbox" checked={Boolean(form.isAvailable)} onChange={updateField} />
              Available
            </label>

            {modifierGroups.length > 0 && (
              <fieldset className="modifier-checkboxes edit-menu-modifiers">
                <legend>Modifier Groups</legend>
                {modifierGroups.map((group) => (
                  <label className="checkbox-row" key={group.id}>
                    <input
                      name="modifierGroupIds"
                      type="checkbox"
                      value={group.id}
                      checked={(form.modifierGroupIds || []).includes(group.id)}
                      onChange={updateField}
                    />
                    {group.name}
                  </label>
                ))}
              </fieldset>
            )}
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
