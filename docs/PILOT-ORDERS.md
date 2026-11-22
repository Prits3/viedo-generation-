# One-time PDF-to-video pilot (Netlify + Stripe)

The landing-page offer is one short MP4 with source references from one customer PDF, prepared and delivered manually by email. It does not create accounts, grant credits, or create subscriptions. No Stripe SDK, API credentials, or webhook is required.

## Netlify configuration

Go to **Project configuration → Environment variables**. Scope the variables to **Builds** where scopes are available. Set contextual values rather than sharing a value across all deploys. Use Netlify's built-in `CONTEXT`; don't define it yourself on Netlify. The homepage is prerendered, so rebuild after changing the values.

| Variable | Deploy Previews | Production |
| --- | --- | --- |
| `PILOT_STRIPE_TEST_LINK` | Required: official Dashboard sandbox Payment Link on `https://buy.stripe.com` with a `/test_…` path | Leave blank; ignored |
| `PILOT_STRIPE_LIVE_LINK` | Leave blank; ignored | Required: reviewed Stripe live Payment Link on `https://buy.stripe.com` with one non-test path segment |
| `PILOT_PRICE` | Optional: use actual sandbox price if available; otherwise display a labelled €5.00 placeholder | Required: approved one-time total, including currency and applicable taxes/fees; must match Checkout |
| `PILOT_DELIVERY` | Optional: otherwise a labelled three-business-day example | Required: approved delivery window, including when it starts |
| `PILOT_PDF_HANDOFF` | Optional: test-only instructions; do not ask for a real PDF | Required: approved instructions for how the team will request and securely receive the PDF after verifying payment |
| `PILOT_ORDER_INFO_URL` | Leave blank; ignored | Required: HTTPS URL to reviewed pre-contract and order privacy information for this offer |
| `PILOT_LIVE_APPROVED` | Leave blank; ignored | Set to `true` **only** after the checklist below is signed off |
| `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL` | Not required for the test offer | Required: public seller/contact details shown on the offer. Use Builds and Functions scopes so `/imprint` and `/privacy` also show the details at runtime; separate `LEGAL_ADDRESS` lines with `\|`. |

Without a valid link for the current context the section is hidden. In production, missing approval or incomplete offer details also hide it. Branch deploys and unspecified contexts never show it. Only copy the bare Payment Link from the Dashboard; the application intentionally rejects custom domains, query strings and fragments. The URL check verifies format, not Stripe ownership, price type, active status, or actual mode: verify those in the Dashboard.

### Which Stripe keys go where?

**Nowhere for this integration.** Paste the public Payment Link URL, not an API key, into the relevant `PILOT_STRIPE_*_LINK` build variable. If a future integration actually uses Stripe.js, a publishable key (prefix `pk_`) can use `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. A secret or restricted key (prefix `sk_` or `rk_`) would go only in a secrets vault or server-side Netlify **Functions** variable and must never use `NEXT_PUBLIC_`, appear in Git or `netlify.toml`, or be sent in chat. These key variables are not read by this change.

## Stripe setup and preview acceptance

1. In Stripe **sandbox mode**, create a Payment Link for one product and a fixed **one-time price**; quantity 1 with quantity adjustment off. Collect the buyer's email through Checkout. Don't request the PDF or sensitive data in Stripe. Use card-only for the pilot if practical to avoid delayed payment methods.
2. Set the sandbox URL in **Deploy Previews** and use a Netlify PR preview build. Check the Test banner, price and CTA at desktop and mobile widths. Open the CTA, verify the Stripe sandbox, then complete a successful transaction with a [Stripe test card](https://docs.stripe.com/testing#cards) and dummy data. Check the paid status in the **sandbox** Dashboard. Start a separate checkout and cancel or go back; this must not be treated as paid. Check the example lesson and early-access form again in the preview without submitting real personal data.
3. Use Stripe's hosted confirmation page. If you configure a return to the landing page instead, don't add payment or session data to the URL and don't show a paid message there. A redirect, customer's screenshot or email receipt isn't the team's source of truth.

## Manual fulfillment

1. In the correct Stripe mode, open **Payments** and find the transaction. Match the pilot product/payment link, amount/currency, Checkout email and Stripe payment ID. Proceed only when Dashboard shows **Succeeded** (paid), not Pending, Canceled, Failed, refunded or disputed. Test records never trigger real delivery.
2. In a restricted-access order log, record the payment ID, status and fulfillment stage; use the payment ID to prevent duplicate outreach or delivery. Reply to the Checkout email from the approved inbox with a private upload method and the approved PDF limits and deadline. Ask for a document the customer has permission to share; do not ask for card details. Keep files outside the public lesson store and follow the approved retention and deletion policy.
3. Prepare the short, check citations and narration against the source, then send the MP4 or a private download link by email. Record the delivery timestamp. Use the approved cancellation/refund procedure for unsuitable PDFs, missed deadlines or requests. Do not promise immediate delivery from Checkout.

## Live sign-off — keep `PILOT_LIVE_APPROVED` unset until complete

- The team has approved the fixed total, taxes/currency, number of PDFs and videos, PDF limits, delivery window/trigger, support contact and safe PDF handoff. Stripe's live link is active, uses the correct merchant and fixed one-time product/price, and matches the public offer. Review any currency conversion and taxes before accepting payments.
- Publish and check the required consumer information for the markets served: seller/contact, final total, delivery and restrictions, refunds/withdrawal and any digital-content or early-performance consent requirements, complaint handling and applicable order terms. Review the final Stripe pay-button wording and required consents with the team. Link the applicable order terms and privacy disclosures **before** payment. The site's early-access privacy copy alone does not cover Stripe, submitted PDFs or order fulfillment.
- Check the real operator details on Production `/imprint` and `/privacy`, and the order-information URL. Assign a team member to the inbox, payment verification, delivery and refunds. Record approval, then set the production-only values and rebuild. To stop taking orders, deactivate the link in the Dashboard as well as removing approval and redeploying; published links can be reused independently of this page.

References: [Stripe Payment Links](https://docs.stripe.com/payment-links/create), [After payment](https://docs.stripe.com/payment-links/post-payment), [Netlify build variables](https://docs.netlify.com/build/configure-builds/environment-variables/).
