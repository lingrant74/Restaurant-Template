import { Link } from "react-router-dom";

export default function AdminHeader({ title, eyebrow = "Admin", children }) {
  return (
    <header className="admin-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <nav className="admin-nav">
        <Link to="/admin">Restaurants</Link>
        <a href="/joes-pizza">Public page</a>
        {children}
      </nav>
    </header>
  );
}
