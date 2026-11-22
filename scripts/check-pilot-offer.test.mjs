import assert from "node:assert/strict";
import { test } from "node:test";
import { pilotOffer } from "../src/lib/pilot-offer.ts";

const sandbox = "https://buy.stripe.com/test_PilotFixtureOnly";
const live = "https://buy.stripe.com/PilotFixtureOnly";
const approved = {
  CONTEXT: "production",
  PILOT_LIVE_APPROVED: "true",
  PILOT_STRIPE_TEST_LINK: sandbox,
  PILOT_STRIPE_LIVE_LINK: live,
  PILOT_PRICE: "€15.00 total",
  PILOT_DELIVERY: "Within three days of receipt of the PDF.",
  PILOT_PDF_HANDOFF: "After payment we email a private upload link.",
  PILOT_ORDER_INFO_URL: "https://example.com/pilot-terms",
};

test("unconfigured and non-Netlify/branch contexts do not show an offer", () => {
  assert.equal(pilotOffer({}, false), null);
  for (const CONTEXT of [undefined, "dev", "branch-deploy", "preview"]) assert.equal(pilotOffer({ ...approved, CONTEXT }, true), null);
});

test("previews accept only their test link and label placeholder data", () => {
  const preview = pilotOffer({ CONTEXT: "deploy-preview", PILOT_STRIPE_TEST_LINK: sandbox }, false);
  assert.equal(preview.mode, "test");
  assert.equal(preview.checkoutUrl, sandbox);
  assert.match(preview.price, /test price/);
  assert.match(preview.delivery, /test estimate/);
  assert.match(preview.pdfHandoff, /verify payment, then email/);
  assert.equal(preview.orderInfoUrl, null);
  assert.equal(pilotOffer({ ...approved, CONTEXT: "deploy-preview", PILOT_STRIPE_TEST_LINK: live }, true), null);
  assert.equal(pilotOffer({ ...approved, CONTEXT: "deploy-preview", PILOT_STRIPE_TEST_LINK: "" }, true), null);
  assert.equal(pilotOffer({ ...approved, CONTEXT: "deploy-preview" }, true).price, approved.PILOT_PRICE);
});

test("production uses the reviewed live link, never the test variable or placeholders", () => {
  assert.deepEqual(pilotOffer(approved, true), {
    mode: "live", checkoutUrl: live, price: approved.PILOT_PRICE, delivery: approved.PILOT_DELIVERY,
    pdfHandoff: approved.PILOT_PDF_HANDOFF, orderInfoUrl: approved.PILOT_ORDER_INFO_URL,
  });
  assert.equal(pilotOffer({ ...approved, PILOT_STRIPE_LIVE_LINK: sandbox }, true), null);
  assert.equal(pilotOffer(approved, false), null);
  for (const key of Object.keys(approved).filter((k) => !["CONTEXT", "PILOT_STRIPE_TEST_LINK"].includes(k))) {
    assert.equal(pilotOffer({ ...approved, [key]: "  " }, true), null, `${key} must be present`);
  }
  assert.equal(pilotOffer({ ...approved, PILOT_LIVE_APPROVED: "1" }, true), null);
});

test("rejects non-Stripe, insecure, and noncanonical payment destinations", () => {
  const badLinks = [
    "http://buy.stripe.com/test_Fake", "https://buy.stripe.com.evil.example/test_Fake",
    "https://buy.stripe.com@other.example/test_Fake", "https://other.example@buy.stripe.com/test_Fake",
    "https://buy.stripe.com:444/test_Fake", "https://checkout.stripe.com/test_Fake",
    "//buy.stripe.com/test_Fake", "https://buy.stripe.com/test_Fake#x", "https://buy.stripe.com/test_Fake?x=1",
    "https://buy.stripe.com/test_", "https://buy.stripe.com/test_A/extra", "https://buy.stripe.com/%74est_Fake",
    "https://buy.stripe.com/test_F\nake", "https://buy.stripe.com/test_Fake/", "javascript:alert(1)",
  ];
  for (const link of badLinks) {
    assert.equal(pilotOffer({ CONTEXT: "deploy-preview", PILOT_STRIPE_TEST_LINK: link }, false), null, link);
    assert.equal(pilotOffer({ ...approved, PILOT_STRIPE_LIVE_LINK: link.replace("test_", "") }, true), null, link);
  }
});

test("production excludes non-HTTPS or credential-bearing terms URLs", () => {
  for (const url of ["http://example.com", "javascript:alert(1)", "/terms", "https://user:pw@example.com/terms"]) {
    assert.equal(pilotOffer({ ...approved, PILOT_ORDER_INFO_URL: url }, true), null, url);
  }
});
