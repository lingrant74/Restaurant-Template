import { Link } from "react-router-dom";
import LegalFooter from "../components/LegalFooter.jsx";

export default function LandingPage() {
  return (
    <main className="ed">
      {/* ─── Nav ─── */}
      <nav className="ed-nav">
        <Link to="/" className="ed-nav-brand">
          <img src="/gigi-logo.png" alt="GIGI" />
          <span>GIGI</span>
        </Link>
        <div className="ed-nav-right">
          <a href="#how">How it works</a>
          <a href="#product">Product</a>
          <Link to="/tablet/login">Login</Link>
          <a href="#cta" className="ed-nav-cta">Get started</a>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="ed-hero">
        <div className="ed-hero-left">
          <span className="ed-kicker">For restaurants losing orders to voicemail</span>
          <h1>Your phone rings.<br />Nobody's free.<br />The order is gone.</h1>
          <p className="ed-hero-p">GIGI answers the call, takes the order, confirms it back, and prints a ticket to your kitchen. Your staff never gets interrupted.</p>
          <div className="ed-hero-actions">
            <a href="#cta" className="ed-btn-primary">Book a demo</a>
            <a href="#how" className="ed-btn-ghost">See how it works</a>
          </div>
        </div>
        <div className="ed-hero-right">
          <div className="ed-ticket">
            <div className="ed-ticket-header">
              <span className="ed-ticket-badge">PHONE ORDER</span>
              <span className="ed-ticket-time">6:47 PM</span>
            </div>
            <div className="ed-ticket-body">
              <p className="ed-ticket-id">#147</p>
              <p>2x LG PEPPERONI</p>
              <p className="ed-ticket-mod">&nbsp;&nbsp;+XTRA CHEESE &nbsp;-ONION</p>
              <p>1x HOUSE SALAD</p>
              <p className="ed-ticket-mod">&nbsp;&nbsp;+RANCH</p>
              <p className="ed-ticket-rule">――――――――――――――――</p>
              <p className="ed-ticket-total">TOTAL &nbsp; $38.48</p>
            </div>
            <div className="ed-ticket-footer">
              <span className="ed-ticket-status">Sent to printer</span>
            </div>
          </div>
          <div className="ed-hero-aside">
            <p className="ed-aside-line"><span className="ed-dot green" />Printer connected</p>
            <p className="ed-aside-line"><span className="ed-dot red" />3 calls this rush</p>
            <p className="ed-aside-line"><span className="ed-dot" />Avg 47 seconds</p>
          </div>
        </div>
      </section>

      {/* ─── Statement ─── */}
      <section className="ed-statement">
        <p>Restaurants lose 20% of phone orders during peak hours.<br />Not because the food is bad. Because nobody picked up.</p>
      </section>

      {/* ─── How It Works ─── */}
      <section className="ed-how" id="how">
        <div className="ed-how-header">
          <h2>How it works</h2>
        </div>
        <div className="ed-how-grid">
          <div className="ed-how-step">
            <span className="ed-how-num">01</span>
            <h3>The phone rings</h3>
            <p>Customer calls your restaurant number. GIGI picks up instantly — no hold music, no missed rings.</p>
          </div>
          <div className="ed-how-step">
            <span className="ed-how-num">02</span>
            <h3>The order is captured</h3>
            <p>GIGI asks about sizes, toppings, dressings. Confirms the order back. Gets a yes before anything prints.</p>
          </div>
          <div className="ed-how-step">
            <span className="ed-how-num">03</span>
            <h3>The ticket prints</h3>
            <p>A clean kitchen ticket hits your printer — or your dashboard. Same format as your online orders.</p>
          </div>
        </div>
      </section>

      {/* ─── Product ─── */}
      <section className="ed-product" id="product">
        <div className="ed-product-split">
          <div className="ed-product-text">
            <h2>One dashboard.<br />Phone and online.</h2>
            <p>Phone orders land in the same queue as your website orders. Accept, decline, print, or hand off to staff — all from one screen.</p>
          </div>
          <div className="ed-product-cards">
            <div className="ed-pcard">
              <span className="ed-pcard-label">Live calls</span>
              <span className="ed-pcard-value">2 active</span>
            </div>
            <div className="ed-pcard">
              <span className="ed-pcard-label">Pending</span>
              <span className="ed-pcard-value">5 orders</span>
            </div>
            <div className="ed-pcard">
              <span className="ed-pcard-label">Handoff</span>
              <span className="ed-pcard-value">After 2 failures</span>
            </div>
            <div className="ed-pcard">
              <span className="ed-pcard-label">Printer</span>
              <span className="ed-pcard-value green">Online</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Control ─── */}
      <section className="ed-control" id="control">
        <h2>You decide when to take over.</h2>
        <div className="ed-control-grid">
          <div className="ed-control-item">
            <h3>After one miss</h3>
            <p>Can't match the item? Transfers immediately.</p>
          </div>
          <div className="ed-control-item">
            <h3>Complex orders</h3>
            <p>Off-menu requests route to your staff.</p>
          </div>
          <div className="ed-control-item">
            <h3>Rush windows</h3>
            <p>Schedule when GIGI answers and when it doesn't.</p>
          </div>
          <div className="ed-control-item">
            <h3>Never</h3>
            <p>Let it run. Customers can still ask for a person.</p>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="ed-cta" id="cta">
        <h2>Stop losing dinner rush orders.</h2>
        <p>Set up in under an hour. No hardware. No contracts. Cancel whenever.</p>
        <a href="mailto:hello@getgigi.com" className="ed-btn-primary">Book a demo</a>
      </section>

      {/* ─── Footer ─── */}
      <footer className="ed-footer">
        <div className="ed-footer-left">
          <img src="/gigi-logo.png" alt="GIGI" />
          <span>GIGI</span>
        </div>
        <p>Phone order automation for restaurants.</p>
      </footer>

      <LegalFooter variant="landing" />
    </main>
  );
}
