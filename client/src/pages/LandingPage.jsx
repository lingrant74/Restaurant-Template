import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <main className="lp">
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-nav-brand">
            <img src="/gigi-logo.png" alt="GIGI" className="lp-nav-logo" />
            <span>GIGI</span>
          </Link>
          <div className="lp-nav-links">
            <a href="#product">Product</a>
            <a href="#how">How it works</a>
            <a href="#control">Pricing</a>
            <Link to="/tablet/login">Restaurant Login</Link>
            <a href="#cta" className="lp-nav-btn">Book a Demo</a>
          </div>
        </div>
      </nav>

      {/* ─── Cinematic Hero ─── */}
      <section className="lp-hero">
        <div className="lp-hero-center">
          <p className="lp-hero-tag">Phone order automation for restaurants</p>
          <h1>Never miss another<br />dinner rush call.</h1>
          <p className="lp-hero-sub">gigi answers calls, confirms orders, and sends clean tickets to your kitchen while your team stays focused.</p>
          <div className="lp-hero-btns">
            <a href="#cta" className="lp-btn-red">Book a Demo</a>
            <a href="#how" className="lp-btn-outline">See how it works</a>
          </div>
          <p className="lp-hero-trust">Built for restaurants that can't afford to miss the phone during peak hours.</p>
        </div>

        <div className="lp-hero-stage">
          <div className="lp-hero-float lp-float-left">
            <span className="lp-float-dot red" />
            <span>Dinner rush mode</span>
          </div>
          <div className="lp-hero-float lp-float-right-top">
            <span className="lp-float-dot green" />
            <span>Printer online</span>
          </div>
          <div className="lp-hero-float lp-float-right-bottom">
            <span>Staff handoff available</span>
          </div>

          <div className="lp-hero-mockup">
            <div className="mockup-chrome">
              <div className="mockup-topbar">
                <span className="mockup-dot-live" />
                <span className="mockup-call-info">+1 (555) 219-8841 &middot; 0:47</span>
                <span className="mockup-status-pill">Live</span>
                <span className="mockup-handoff-btn">Transfer to staff</span>
              </div>

              <div className="mockup-body">
                <div className="mockup-col-left">
                  <div className="mockup-panel">
                    <p className="mockup-panel-label">Live Transcript</p>
                    <div className="mockup-transcript-lines">
                      <p className="mockup-line-system">What would you like to order?</p>
                      <p className="mockup-line-caller">Two large pepperoni pizzas with extra cheese, no onions, and a house salad with ranch.</p>
                      <p className="mockup-line-system">Got it. Two large pepperoni with extra cheese, no onions. One house salad, ranch. Send to kitchen?</p>
                      <p className="mockup-line-caller">Yes please.</p>
                    </div>
                  </div>
                  <div className="mockup-panel">
                    <p className="mockup-panel-label">Confidence</p>
                    <div className="mockup-confidence">
                      <div className="mockup-confidence-bar"><div className="mockup-confidence-fill" /></div>
                      <span>96%</span>
                    </div>
                  </div>
                </div>

                <div className="mockup-col-right">
                  <div className="mockup-panel">
                    <p className="mockup-panel-label">Order Summary</p>
                    <div className="mockup-order-line"><span>2x</span><strong>LG Pepperoni Pizza</strong></div>
                    <p className="mockup-order-mod">+ Extra cheese &nbsp; - No onions</p>
                    <div className="mockup-order-line"><span>1x</span><strong>House Salad</strong></div>
                    <p className="mockup-order-mod">+ Ranch</p>
                    <div className="mockup-order-total">
                      <span>Total</span><strong>$38.48</strong>
                    </div>
                  </div>
                  <div className="mockup-panel mockup-ticket-panel">
                    <div className="mockup-ticket-header">
                      <p className="mockup-panel-label">Kitchen Ticket</p>
                      <span className="mockup-status-badge">Sent to printer</span>
                    </div>
                    <div className="mockup-ticket-body">
                      <p>#147 &middot; PHONE &middot; 4:32p</p>
                      <p>2 LG PEP +XTRA CHEESE -ONION</p>
                      <p>1 HOUSE SALAD +RANCH</p>
                      <p>────────────────────</p>
                      <p>TOTAL $38.48</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Value Strip ─── */}
      <section className="lp-value-strip">
        <div className="lp-value-strip-inner">
          <div className="lp-value-card">
            <span className="lp-value-num">01</span>
            <h3>Answer every call</h3>
            <p>No more missed orders during rush hour. gigi picks up instantly, every time.</p>
          </div>
          <div className="lp-value-card">
            <span className="lp-value-num">02</span>
            <h3>Send clean tickets</h3>
            <p>Structured orders print to your kitchen exactly like online orders do.</p>
          </div>
          <div className="lp-value-card">
            <span className="lp-value-num">03</span>
            <h3>Stay in control</h3>
            <p>Set when gigi handles calls and when it transfers to your staff.</p>
          </div>
        </div>
      </section>

      {/* ─── Product Section ─── */}
      <section className="lp-product" id="product">
        <div className="lp-section-header">
          <p className="lp-label">Product</p>
          <h2>One screen for every phone order.</h2>
          <p className="lp-section-sub">Phone orders show up alongside online orders. Accept, decline, print, or hand off — all from the same dashboard your team already uses.</p>
        </div>
        <div className="lp-dashboard-preview">
          <div className="lp-dash-card">
            <div className="lp-dash-card-header"><span className="lp-dash-dot green" /><span>Live Calls</span></div>
            <div className="lp-dash-card-body"><p className="lp-dash-metric">2</p><p className="lp-dash-caption">Active now</p></div>
          </div>
          <div className="lp-dash-card">
            <div className="lp-dash-card-header"><span className="lp-dash-dot amber" /><span>Pending Orders</span></div>
            <div className="lp-dash-card-body"><p className="lp-dash-metric">5</p><p className="lp-dash-caption">Awaiting confirmation</p></div>
          </div>
          <div className="lp-dash-card">
            <div className="lp-dash-card-header"><span className="lp-dash-dot blue" /><span>Handoff Rules</span></div>
            <div className="lp-dash-card-body"><p className="lp-dash-rule">After 2 failed attempts</p><p className="lp-dash-caption">Transfer to +1 (555) 000-1234</p></div>
          </div>
          <div className="lp-dash-card">
            <div className="lp-dash-card-header"><span className="lp-dash-dot green" /><span>Kitchen Printer</span></div>
            <div className="lp-dash-card-body"><p className="lp-dash-rule">Connected</p><p className="lp-dash-caption">192.168.1.45:9100</p></div>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="lp-how" id="how">
        <div className="lp-section-header">
          <p className="lp-label">How it works</p>
          <h2>Three steps. No new hardware.</h2>
        </div>
        <div className="lp-steps">
          <div className="lp-step"><div className="lp-step-num">1</div><h3>Customer calls your restaurant</h3><p>They dial your normal number. Twilio routes the call to gigi. The customer hears a greeting and starts ordering.</p></div>
          <div className="lp-step"><div className="lp-step-num">2</div><h3>gigi captures the order</h3><p>Speech is transcribed, matched to your menu, and modifiers are confirmed. Required choices like size or dressing are asked automatically.</p></div>
          <div className="lp-step"><div className="lp-step-num">3</div><h3>Restaurant confirms</h3><p>The structured order appears on your dashboard or prints directly to the kitchen. Accept, decline, or hand the call to staff.</p></div>
        </div>
      </section>

      {/* ─── Control Section ─── */}
      <section className="lp-handoff" id="control">
        <div className="lp-section-header">
          <p className="lp-label">Control</p>
          <h2>You decide when gigi hands off.</h2>
        </div>
        <div className="lp-handoff-grid">
          <div className="lp-handoff-card"><h3>After one unclear request</h3><p>If gigi can't match an item after one attempt, it transfers to your staff immediately.</p></div>
          <div className="lp-handoff-card"><h3>For custom orders</h3><p>Complex modifications or off-menu items trigger a handoff so nothing gets lost.</p></div>
          <div className="lp-handoff-card"><h3>During rush hours</h3><p>Schedule time windows where calls go straight to staff. gigi only answers when you want it to.</p></div>
          <div className="lp-handoff-card"><h3>Never, unless asked</h3><p>Let gigi handle everything. Customers can still say "talk to a person" at any time to reach staff.</p></div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="lp-cta" id="cta">
        <h2>Stop losing orders to voicemail.</h2>
        <p>Set up takes under an hour. No new hardware. No long contracts.</p>
        <div className="lp-cta-btns">
          <a href="mailto:hello@getgigi.com" className="lp-btn-red">Book a Demo</a>
          <Link to="/tablet/login" className="lp-btn-outline-dark">Try the Dashboard</Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand"><img src="/gigi-logo.png" alt="GIGI" /><span>GIGI</span></div>
          <p>Automatic phone ordering for restaurants.</p>
        </div>
      </footer>
    </main>
  );
}
