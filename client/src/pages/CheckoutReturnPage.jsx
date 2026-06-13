import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCheckoutStatus } from "../api.js";
import { formatPrice } from "../utils.js";

export default function CheckoutReturnPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    if (!sessionId) {
      setState({ status: "error", message: "Missing checkout session id." });
      return;
    }

    getCheckoutStatus(sessionId)
      .then((data) => setState({ status: "done", data }))
      .catch((err) => setState({ status: "error", message: err.message }));
  }, [sessionId]);

  if (state.status === "loading") {
    return (
      <main className="page page-center">
        <div className="status-box">
          <p className="eyebrow">Payment</p>
          <h1>Confirming your payment...</h1>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="page page-center">
        <div className="status-box">
          <p className="eyebrow">Payment</p>
          <h1>We couldn't confirm your payment</h1>
          <p>{state.message}</p>
          <Link to="/">Back to the menu</Link>
        </div>
      </main>
    );
  }

  const { paymentStatus, orderId, customerName, total } = state.data;
  const isAuthorized = paymentStatus === "AUTHORIZED";
  const isPaid = paymentStatus === "PAID";
  const isConfirmed = isAuthorized || isPaid;

  return (
    <main className="page page-center">
      <div className="status-box">
        <p className="eyebrow">{isConfirmed ? "Order received" : "Payment status"}</p>
        <h1>{isConfirmed ? "Thank you for your order!" : "Payment not completed"}</h1>
        {isConfirmed ? (
          <>
            <p>
              Order #{orderId}
              {customerName ? ` for ${customerName}` : ""} has been sent to the restaurant.
            </p>
            {total != null && (
              <p>
                {isPaid
                  ? `Total charged: ${formatPrice(total)}`
                  : `Card authorized for ${formatPrice(total)} — you'll only be charged once the restaurant accepts your order.`}
              </p>
            )}
            <p>The kitchen will confirm your order shortly.</p>
          </>
        ) : (
          <p>Your payment was not completed. You can return to the menu and try again.</p>
        )}
        <Link to="/">Back to the menu</Link>
      </div>
    </main>
  );
}
