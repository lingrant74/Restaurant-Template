import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { createConnectOnboardingLink, getConnectStatus, getRestaurant } from "../api.js";
import AdminHeader from "../components/AdminHeader.jsx";
import AdminStatus from "../components/AdminStatus.jsx";

export default function RestaurantPaymentsPage() {
  const { restaurantId } = useParams();
  const [searchParams] = useSearchParams();
  const [restaurant, setRestaurant] = useState(null);
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");

  async function loadStatus() {
    try {
      setIsLoading(true);
      setError("");
      const [restaurantData, statusData] = await Promise.all([
        getRestaurant(restaurantId),
        getConnectStatus(restaurantId)
      ]);
      setRestaurant(restaurantData);
      setStatus(statusData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, searchParams.toString()]);

  async function startOnboarding() {
    try {
      setIsStarting(true);
      setError("");
      const { url } = await createConnectOnboardingLink(restaurantId);
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setIsStarting(false);
    }
  }

  if (isLoading) {
    return <AdminStatus title="Loading payment settings..." />;
  }

  if (error && !restaurant) {
    return <AdminStatus title={error} />;
  }

  const chargesEnabled = status?.chargesEnabled;
  const connected = status?.connected;

  return (
    <main className="admin-page">
      <AdminHeader title="Payments" eyebrow={restaurant?.name}>
        <Link to={`/admin/restaurants/${restaurantId}`}>Back</Link>
      </AdminHeader>

      {error && (
        <section className="notice notice-error">{error}</section>
      )}

      <section className="admin-grid">
        <section className="editor-panel">
          <div className="panel-heading">
            <p className="eyebrow">Stripe Connect</p>
            <h2>Accept payments for this restaurant</h2>
          </div>

          <div className="connect-status">
            <p>
              <strong>Status:</strong>{" "}
              {chargesEnabled
                ? "Ready to accept payments ✅"
                : connected
                  ? "Onboarding started — not finished yet"
                  : "Not connected"}
            </p>
            <ul>
              <li>Connected account: {connected ? "Yes" : "No"}</li>
              <li>Charges enabled: {status?.chargesEnabled ? "Yes" : "No"}</li>
              <li>Payouts enabled: {status?.payoutsEnabled ? "Yes" : "No"}</li>
              <li>Details submitted: {status?.detailsSubmitted ? "Yes" : "No"}</li>
            </ul>
          </div>

          <button type="button" onClick={startOnboarding} disabled={isStarting}>
            {isStarting
              ? "Opening Stripe..."
              : chargesEnabled
                ? "Manage on Stripe"
                : connected
                  ? "Continue onboarding"
                  : "Connect with Stripe"}
          </button>
        </section>

        <section className="flat-panel">
          <div className="panel-heading">
            <p className="eyebrow">How it works</p>
            <h2>Fees & payouts</h2>
          </div>
          <p>
            Customer payments go directly to this restaurant's Stripe account. The platform
            keeps a fee on each order: the larger of <strong>$0.20 per item</strong> or{" "}
            <strong>3.5% of the order total</strong>.
          </p>
          <p>
            Cards are authorized when the customer checks out and only charged when the order is
            accepted. Declined orders are never charged.
          </p>
        </section>
      </section>
    </main>
  );
}
