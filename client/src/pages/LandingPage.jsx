import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">Restaurant Helpers</p>
          <h1>Restaurant Helpers</h1>
          <p>
            We help restaurants take online orders, manage menus, and keep kitchen teams moving with simple live order screens.
          </p>
          <div className="landing-hero-actions">
            <Link to="/admin/login">Admin Login</Link>
            <Link to="/tablet/login">Restaurant Login</Link>
          </div>
        </div>

        <div className="landing-hero-preview" aria-label="Live order dashboard preview">
          <div className="preview-header">
            <span />
            <div>
              <p>LIVE ORDERS</p>
              <strong>Joe's Pizza</strong>
            </div>
          </div>
          <div className="preview-tabs">
            <span>All 12</span>
            <span>Pending 3</span>
            <span>In Progress 6</span>
          </div>
          <div className="preview-ticket">
            <div>
              <p>ORDER #24</p>
              <strong>New customer order</strong>
              <span>2 x Pepperoni Pizza</span>
              <span>1 x Garlic Knots</span>
            </div>
            <strong>$32.48</strong>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <p className="eyebrow">Who We Are</p>
        <h2>Built for small restaurants that need ordering tools without the mess.</h2>
        <p>
          Restaurant Helpers is a lightweight platform for restaurants that want a public menu, online ordering,
          staff dashboards, and tablet-friendly order handling in one place.
        </p>
      </section>

      <section className="landing-card-grid" aria-label="What Restaurant Helpers does">
        <article className="landing-card">
          <div>
            <h2>Online Menus</h2>
            <p>Create a public restaurant menu link customers can open from their phone.</p>
          </div>
          <span>/r/restaurant-slug</span>
        </article>

        <article className="landing-card">
          <div>
            <h2>Live Orders</h2>
            <p>Show incoming orders on a tablet with alerts, order details, and accept or decline actions.</p>
          </div>
          <Link to="/tablet/login">Restaurant Login</Link>
        </article>

        <article className="landing-card">
          <div>
            <h2>Admin Tools</h2>
            <p>Manage restaurants, categories, menu items, modifiers, staff access, and order history.</p>
          </div>
          <Link to="/admin/login">Admin Login</Link>
        </article>
      </section>

      <section className="landing-feature-band">
        <div>
          <p className="eyebrow">What We Do</p>
          <h2>We connect the customer menu to the kitchen screen.</h2>
        </div>
        <ul>
          <li>Customers place orders from a public restaurant page.</li>
          <li>Restaurants see new orders instantly on the live dashboard.</li>
          <li>Staff accept, decline, print, and complete orders from one screen.</li>
        </ul>
      </section>
    </main>
  );
}
