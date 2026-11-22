import { operator } from "@/lib/legal";
import { pilotOffer } from "@/lib/pilot-offer";

export function PilotOffer() {
  const seller = operator();
  const offer = pilotOffer(process.env, Boolean(seller && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seller.email)));
  if (!offer) return null;

  return (
    <section className="pilot" aria-labelledby="pilot-title" data-pilot-mode={offer.mode}>
      <div className="pilot__intro">
        <h2 id="pilot-title">Turn your PDF into a learning video</h2>
        <p>Get a short MP4 with source references from your PDF. We prepare it for you and deliver it by email.</p>
        {offer.mode === "test" && <p className="pilot__test">Test checkout only. No real payment, PDF submission or delivery.</p>}
      </div>
      <dl className="pilot__details">
        <div><dt>One-time price</dt><dd>{offer.price}</dd></div>
        <div><dt>Delivery</dt><dd>{offer.delivery}</dd></div>
        <div><dt>How to send your PDF</dt><dd>{offer.pdfHandoff}</dd></div>
      </dl>
      {offer.orderInfoUrl && seller && (
        <div className="pilot__info">
          <p><strong>Seller and contact:</strong> {seller.name}, {seller.address.join(", ")} · {seller.email}</p>
          <p><a href={offer.orderInfoUrl}>Order and privacy information</a> · <a href="/imprint">Imprint</a></p>
        </div>
      )}
      <div className="pilot__checkout">
        <a className="btn btn--primary" href={offer.checkoutUrl} referrerPolicy="no-referrer" data-action="pilot-order" aria-describedby="pilot-checkout-note">
          Order a learning video
        </a>
        <p id="pilot-checkout-note">{offer.mode === "test" ? "Opens Stripe’s test checkout." : "Opens Stripe’s checkout. No PDF upload at checkout."}</p>
      </div>
    </section>
  );
}
