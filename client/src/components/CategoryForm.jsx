import { emptyCategoryForm } from "../utils.js";

export default function CategoryForm({ value = emptyCategoryForm, onChange, onSubmit, buttonLabel = "Add Category" }) {
  return (
    <form className="category-form" onSubmit={onSubmit}>
      <label>
        Name
        <input name="name" value={value.name} onChange={onChange} required />
      </label>
      <label>
        Sort
        <input name="sortOrder" type="number" value={value.sortOrder} onChange={onChange} />
      </label>
      <button type="submit">{buttonLabel}</button>
    </form>
  );
}
