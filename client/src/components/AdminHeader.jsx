import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function AdminHeader({ title, eyebrow = "Admin", children }) {
  const { currentUser, logout } = useAuth();

  return (
    <header className="admin-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <nav className="admin-nav">
        <Link to="/admin">Restaurants</Link>
        <a href="/r/joes-pizza">Public page</a>
        {children}
        {currentUser && (
          <button className="admin-logout-button" type="button" onClick={logout}>
            Logout
          </button>
        )}
      </nav>
    </header>
  );
}
