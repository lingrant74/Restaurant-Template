import { emptyMenuItemForm } from "../utils.js";

export default function MenuItemForm({ value = emptyMenuItemForm, modifierGroups = [], onChange, onSubmit, buttonLabel = "Add Item" }) {
  return (
    <form className="editor-panel" onSubmit={onSubmit}>
      <div className="panel-heading">
        <p className="eyebrow">Item</p>
        <h2>{buttonLabel}</h2>
      </div>

      <label>
        Name
        <input name="name" value={value.name} onChange={onChange} required />
      </label>

      <label>
        Description
        <textarea name="description" value={value.description} onChange={onChange} rows="3" />
      </label>

      <label>
        Image URL
        <input name="imageUrl" value={value.imageUrl} onChange={onChange} />
      </label>

      <label>
        Price
        <input name="price" type="number" min="0" step="0.01" value={value.price} onChange={onChange} required />
      </label>

      <label className="checkbox-row">
        <input name="isAvailable" type="checkbox" checked={Boolean(value.isAvailable)} onChange={onChange} />
        Available
      </label>

      {modifierGroups.length > 0 && (
        <fieldset className="modifier-checkboxes">
          <legend>Modifier Groups</legend>
          {modifierGroups.map((group) => (
            <label className="checkbox-row" key={group.id}>
              <input
                name="modifierGroupIds"
                type="checkbox"
                value={group.id}
                checked={(value.modifierGroupIds || []).includes(group.id)}
                onChange={onChange}
              />
              {group.name}
            </label>
          ))}
        </fieldset>
      )}

      <button type="submit">{buttonLabel}</button>
    </form>
  );
}
