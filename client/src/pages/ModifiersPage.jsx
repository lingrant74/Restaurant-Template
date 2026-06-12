import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createModifierGroup,
  createModifierOption,
  deleteModifierGroup,
  deleteModifierOption,
  getModifierGroups,
  getRestaurant,
  updateModifierGroup,
  updateModifierOption
} from "../api.js";
import AdminHeader from "../components/AdminHeader.jsx";
import AdminStatus from "../components/AdminStatus.jsx";
import { formatPrice } from "../utils.js";

const emptyGroupForm = {
  name: "",
  required: false,
  allowMultiple: false,
  minSelections: "0",
  maxSelections: "",
  sort: "0"
};

const emptyOptionForm = {
  name: "",
  priceDelta: "0",
  sort: "0",
  available: true
};

export default function ModifiersPage() {
  const { restaurantId } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [editingGroups, setEditingGroups] = useState({});
  const [optionForms, setOptionForms] = useState({});
  const [editingOptions, setEditingOptions] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadModifiersPage() {
    try {
      setIsLoading(true);
      setError("");
      const [restaurantData, modifierGroupData] = await Promise.all([
        getRestaurant(restaurantId),
        getModifierGroups(restaurantId)
      ]);
      setRestaurant(restaurantData);
      setModifierGroups(modifierGroupData);
      setEditingGroups(modifierGroupData.reduce((groupsById, group) => ({
        ...groupsById,
        [group.id]: {
          name: group.name,
          required: group.required,
          allowMultiple: group.allowMultiple,
          minSelections: String(group.minSelections ?? 0),
          maxSelections: group.maxSelections === null ? "" : String(group.maxSelections),
          sort: String(group.sort ?? 0)
        }
      }), {}));
      setEditingOptions(modifierGroupData.reduce((optionsById, group) => {
        for (const option of group.options || []) {
          optionsById[option.id] = {
            name: option.name,
            priceDelta: String(option.priceDelta),
            sort: String(option.sort ?? 0),
            available: option.available
          };
        }

        return optionsById;
      }, {}));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadModifiersPage();
  }, [restaurantId]);

  function updateForm(setForm) {
    return (event) => {
      const { name, value, type, checked } = event.target;
      setForm((currentForm) => ({
        ...currentForm,
        [name]: type === "checkbox" ? checked : value
      }));
    };
  }

  function updateEditingGroup(groupId, event) {
    const { name, value, type, checked } = event.target;
    setEditingGroups((currentGroups) => ({
      ...currentGroups,
      [groupId]: {
        ...currentGroups[groupId],
        [name]: type === "checkbox" ? checked : value
      }
    }));
  }

  function updateOptionForm(groupId, event) {
    const { name, value, type, checked } = event.target;
    setOptionForms((currentForms) => ({
      ...currentForms,
      [groupId]: {
        ...(currentForms[groupId] || emptyOptionForm),
        [name]: type === "checkbox" ? checked : value
      }
    }));
  }

  function updateEditingOption(optionId, event) {
    const { name, value, type, checked } = event.target;
    setEditingOptions((currentOptions) => ({
      ...currentOptions,
      [optionId]: {
        ...currentOptions[optionId],
        [name]: type === "checkbox" ? checked : value
      }
    }));
  }

  async function submitGroup(event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    try {
      const group = await createModifierGroup(restaurantId, groupForm);
      setGroupForm(emptyGroupForm);
      setStatusMessage(`Created ${group.name}.`);
      await loadModifiersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveGroup(groupId) {
    setError("");
    setStatusMessage("");

    try {
      const group = await updateModifierGroup(groupId, editingGroups[groupId]);
      setStatusMessage(`Saved ${group.name}.`);
      await loadModifiersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeGroup(groupId) {
    setError("");
    setStatusMessage("");

    try {
      await deleteModifierGroup(groupId);
      setStatusMessage("Deleted modifier group.");
      await loadModifiersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitOption(groupId, event) {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    try {
      const option = await createModifierOption(groupId, optionForms[groupId] || emptyOptionForm);
      setOptionForms((currentForms) => ({
        ...currentForms,
        [groupId]: emptyOptionForm
      }));
      setStatusMessage(`Added ${option.name}.`);
      await loadModifiersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveOption(optionId) {
    setError("");
    setStatusMessage("");

    try {
      const option = await updateModifierOption(optionId, editingOptions[optionId]);
      setStatusMessage(`Saved ${option.name}.`);
      await loadModifiersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeOption(optionId) {
    setError("");
    setStatusMessage("");

    try {
      await deleteModifierOption(optionId);
      setStatusMessage("Deleted option.");
      await loadModifiersPage();
    } catch (err) {
      setError(err.message);
    }
  }

  if (isLoading) {
    return <AdminStatus title="Loading modifiers..." />;
  }

  if (error && !restaurant) {
    return <AdminStatus title={error} />;
  }

  return (
    <main className="admin-page">
      <AdminHeader title="Modifier Groups" eyebrow={restaurant.name}>
        <Link to={`/admin/restaurants/${restaurant.id}`}>Back</Link>
      </AdminHeader>

      {(statusMessage || error) && (
        <section className={error ? "notice notice-error" : "notice"}>
          {error || statusMessage}
        </section>
      )}

      <section className="admin-grid">
        <form className="editor-panel" onSubmit={submitGroup}>
          <div className="panel-heading">
            <p className="eyebrow">Modifiers</p>
            <h2>Create Group</h2>
          </div>

          <ModifierGroupFields value={groupForm} onChange={updateForm(setGroupForm)} />

          <button type="submit">Create Modifier Group</button>
        </form>

        <section className="restaurant-list flat-panel">
          <div className="panel-heading">
            <p className="eyebrow">Manage</p>
            <h2>Groups and Options</h2>
          </div>

          {modifierGroups.length === 0 ? (
            <p className="empty-message">No modifier groups yet.</p>
          ) : (
            <div className="modifier-group-list">
              {modifierGroups.map((group) => (
                <article className="modifier-group-card" key={group.id}>
                  <div className="panel-heading">
                    <p className="eyebrow">Group #{group.id}</p>
                    <h3>{group.name}</h3>
                  </div>

                  <div className="modifier-edit-grid">
                    <ModifierGroupFields value={editingGroups[group.id] || emptyGroupForm} onChange={(event) => updateEditingGroup(group.id, event)} compact />
                  </div>

                  <div className="category-card-actions">
                    <button type="button" onClick={() => saveGroup(group.id)}>
                      Save Group
                    </button>
                    <button className="danger-button" type="button" onClick={() => removeGroup(group.id)}>
                      Delete Group
                    </button>
                  </div>

                  <form className="modifier-option-form" onSubmit={(event) => submitOption(group.id, event)}>
                    <label>
                      Option
                      <input
                        name="name"
                        value={(optionForms[group.id] || emptyOptionForm).name}
                        onChange={(event) => updateOptionForm(group.id, event)}
                        required
                      />
                    </label>
                    <label>
                      Price Delta
                      <input
                        name="priceDelta"
                        type="number"
                        step="0.01"
                        value={(optionForms[group.id] || emptyOptionForm).priceDelta}
                        onChange={(event) => updateOptionForm(group.id, event)}
                      />
                    </label>
                    <label>
                      Sort
                      <input
                        name="sort"
                        type="number"
                        value={(optionForms[group.id] || emptyOptionForm).sort}
                        onChange={(event) => updateOptionForm(group.id, event)}
                      />
                    </label>
                    <label className="checkbox-row">
                      <input
                        name="available"
                        type="checkbox"
                        checked={Boolean((optionForms[group.id] || emptyOptionForm).available)}
                        onChange={(event) => updateOptionForm(group.id, event)}
                      />
                      Available
                    </label>
                    <button type="submit">Add Option</button>
                  </form>

                  {group.options.length === 0 ? (
                    <p className="empty-message">No options yet.</p>
                  ) : (
                    <div className="modifier-option-list">
                      {group.options.map((option) => (
                        <div className="modifier-option-row" key={option.id}>
                          <input
                            name="name"
                            value={editingOptions[option.id]?.name || ""}
                            onChange={(event) => updateEditingOption(option.id, event)}
                          />
                          <input
                            name="priceDelta"
                            type="number"
                            step="0.01"
                            value={editingOptions[option.id]?.priceDelta || "0"}
                            onChange={(event) => updateEditingOption(option.id, event)}
                          />
                          <input
                            name="sort"
                            type="number"
                            value={editingOptions[option.id]?.sort || "0"}
                            onChange={(event) => updateEditingOption(option.id, event)}
                          />
                          <label className="checkbox-row">
                            <input
                              name="available"
                              type="checkbox"
                              checked={Boolean(editingOptions[option.id]?.available)}
                              onChange={(event) => updateEditingOption(option.id, event)}
                            />
                            Available
                          </label>
                          <span>{formatPrice(option.priceDelta)}</span>
                          <button type="button" onClick={() => saveOption(option.id)}>
                            Save
                          </button>
                          <button className="danger-button" type="button" onClick={() => removeOption(option.id)}>
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function ModifierGroupFields({ value, onChange }) {
  return (
    <>
      <label>
        Name
        <input name="name" value={value.name} onChange={onChange} required />
      </label>

      <label className="checkbox-row">
        <input name="required" type="checkbox" checked={Boolean(value.required)} onChange={onChange} />
        Required
      </label>

      <label className="checkbox-row">
        <input name="allowMultiple" type="checkbox" checked={Boolean(value.allowMultiple)} onChange={onChange} />
        Allow Multiple
      </label>

      <label>
        Min Selections
        <input name="minSelections" type="number" min="0" value={value.minSelections} onChange={onChange} />
      </label>

      <label>
        Max Selections
        <input name="maxSelections" type="number" min="0" value={value.maxSelections} onChange={onChange} />
      </label>

      <label>
        Sort
        <input name="sort" type="number" value={value.sort} onChange={onChange} />
      </label>
    </>
  );
}
