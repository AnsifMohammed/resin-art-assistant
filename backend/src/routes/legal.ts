import type { FastifyInstance } from "fastify";

// Public legal pages linked from the Meta app settings (Privacy Policy URL and
// User data deletion instructions URL). Plain HTML, no auth.

const APP_NAME = "Knowvya Assistant";
const COMPANY = "Techza";
const CONTACT_EMAIL = "ansifansif777@gmail.com";
const LAST_UPDATED = "25 October 2026";

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${APP_NAME}</title>
<style>
  body { margin: 0; background: #faf9f7; color: #1f1d1a; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 40px 16px 64px; }
  h1 { font-size: 28px; line-height: 1.25; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 28px 0 8px; }
  p, li { color: #3d3a35; }
  .muted { color: #7a756c; font-size: 14px; margin: 0 0 24px; }
  a { color: #b45309; }
  nav { margin-top: 40px; font-size: 14px; }
</style>
</head>
<body>
<main>
${body}
<nav><a href="/privacy">Privacy Policy</a> · <a href="/data-deletion">Data Deletion</a></nav>
</main>
</body>
</html>`;
}

const privacyHtml = page(
  "Privacy Policy",
  `<h1>Privacy Policy</h1>
<p class="muted">${APP_NAME} by ${COMPANY} · Last updated ${LAST_UPDATED}</p>
<p>${APP_NAME} helps businesses reply to customer messages on Instagram and WhatsApp. This policy explains what information we handle when you message a business that uses ${APP_NAME}.</p>
<h2>What we collect</h2>
<ul>
  <li>Your Instagram or WhatsApp username, ID or phone number.</li>
  <li>The messages, photos and other content you send to the business.</li>
  <li>Order details you share, such as products, delivery address and payment status.</li>
</ul>
<h2>How we use it</h2>
<p>Only to reply to your messages, process and track your orders, and help the business provide customer service. Replies may be drafted automatically and checked by the business's team.</p>
<h2>Sharing</h2>
<p>We do not sell your data. We share it only with the services needed to run the app: Meta (Instagram and WhatsApp), our database and hosting providers, and the AI service used to draft replies.</p>
<h2>Storage and security</h2>
<p>Data is stored on secured servers, access is limited to the business's authorised staff, and access tokens are encrypted. We keep data only as long as needed for your orders and support.</p>
<h2>Your choices</h2>
<p>You can stop receiving messages at any time by replying STOP. You can ask us to delete your data as described on our <a href="/data-deletion">Data Deletion</a> page.</p>
<h2>Contact</h2>
<p>Questions about this policy: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>`,
);

const dataDeletionHtml = page(
  "Data Deletion",
  `<h1>Data Deletion Instructions</h1>
<p class="muted">${APP_NAME} by ${COMPANY} · Last updated ${LAST_UPDATED}</p>
<p>You can ask us to delete the data we hold about you at any time.</p>
<h2>How to request deletion</h2>
<ol>
  <li>Email <a href="mailto:${CONTACT_EMAIL}?subject=Data%20deletion%20request">${CONTACT_EMAIL}</a> with the subject "Data deletion request".</li>
  <li>Include your Instagram username or WhatsApp number so we can find your data.</li>
</ol>
<h2>What happens next</h2>
<p>We delete your messages, contact details and related records within 7 days and confirm by email. Records we must keep by law, such as invoices for completed orders, are kept only for the required period.</p>
<h2>Removing app access</h2>
<p>You can also remove ${APP_NAME}'s access from Instagram: Settings → Website permissions → Apps and websites.</p>`,
);

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/privacy", async (_request, reply) => reply.type("text/html; charset=utf-8").send(privacyHtml));
  app.get("/data-deletion", async (_request, reply) =>
    reply.type("text/html; charset=utf-8").send(dataDeletionHtml),
  );
}
