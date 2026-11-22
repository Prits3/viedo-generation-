export interface PilotOfferConfig {
  mode: "test" | "live";
  checkoutUrl: string;
  price: string;
  delivery: string;
  pdfHandoff: string;
  orderInfoUrl: string | null;
}

const defaults = {
  price: "€5.00 (test price)",
  delivery: "Within 3 business days after we receive the PDF (test estimate).",
  pdfHandoff: "For real orders: we verify payment, then email PDF submission instructions.",
};

function text(value: string | undefined, max: number) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function paymentLink(value: string | undefined, mode: PilotOfferConfig["mode"]) {
  const href = value?.trim();
  if (!href) return null;
  // Exact Stripe Payment Link origin and one opaque path segment. No redirects,
  // query parameters, credentials, ports, or custom domains in this pilot.
  const match = /^https:\/\/buy\.stripe\.com\/(test_)?[A-Za-z0-9]+$/.exec(href);
  return match && Boolean(match[1]) === (mode === "test") ? href : null;
}

function orderInfoLink(value: string | undefined) {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Called during homepage prerender. Dashboard review is an explicit operator step, not inferred from the URL. */
export function pilotOffer(env: NodeJS.ProcessEnv, operatorConfigured: boolean): PilotOfferConfig | null {
  const price = text(env.PILOT_PRICE, 80);
  const delivery = text(env.PILOT_DELIVERY, 180);
  const pdfHandoff = text(env.PILOT_PDF_HANDOFF, 320);

  if (env.CONTEXT === "deploy-preview") {
    const checkoutUrl = paymentLink(env.PILOT_STRIPE_TEST_LINK, "test");
    return checkoutUrl ? {
      mode: "test", checkoutUrl,
      price: price ?? defaults.price,
      delivery: delivery ?? defaults.delivery,
      pdfHandoff: pdfHandoff ?? defaults.pdfHandoff,
      orderInfoUrl: null,
    } : null;
  }

  if (env.CONTEXT !== "production" || env.PILOT_LIVE_APPROVED !== "true" || !operatorConfigured) return null;
  const checkoutUrl = paymentLink(env.PILOT_STRIPE_LIVE_LINK, "live");
  const orderInfoUrl = orderInfoLink(env.PILOT_ORDER_INFO_URL);
  if (!checkoutUrl || !price || !delivery || !pdfHandoff || !orderInfoUrl) return null;
  return { mode: "live", checkoutUrl, price, delivery, pdfHandoff, orderInfoUrl };
}
