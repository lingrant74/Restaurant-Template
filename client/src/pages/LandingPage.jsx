import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <p className="eyebrow">Restaurant Platform</p>
        <h1>Restaurant order management</h1>
        <p>Manage restaurants, menus, online orders, and tablet order screens.</p>
      </section>

      <section className="landing-card-grid" aria-label="Choose user type">
        <article className="landing-card">
          <div>
            <h2>Platform Admin</h2>
            <p>For platform admin only</p>
          </div>
          <Link to="/admin/login">Admin Login</Link>
        </article>

        <article className="landing-card">
          <div>
            <h2>Restaurant Owner / Staff</h2>
            <p>For restaurant owners and staff to view incoming orders</p>
          </div>
          <Link to="/tablet/login">Restaurant Login</Link>
        </article>

        <article className="landing-card">
          <div>
            <h2>Customer Online Menu</h2>
            <p>Customers order from a restaurant's public menu link. Restaurants usually share this direct link with their customers.</p>
          </div>
          <span>Example: /r/restaurant-slug</span>
        </article>
      </section>
    </main>
  );
}
