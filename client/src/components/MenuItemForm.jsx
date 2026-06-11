import { emptyMenuItemForm } from "../utils.js";

export default function MenuItemForm({ value = emptyMenuItemForm, onChange, onSubmit, buttonLabel = "Add Item" }) {
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

      <button type="submit">{buttonLabel}</button>
    </form>
  );
}
