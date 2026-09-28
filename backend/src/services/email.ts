import { Resend } from "resend";
import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";

const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;
const fromDomain = config.RESEND_FROM_DOMAIN || "resend.dev";
const alertsFrom = `Resin Art Assistant <alerts@${fromDomain}>`;
const welcomeFrom = `Resin Art Assistant <noreply@${fromDomain}>`;

/** HTML-escape a value for safe interpolation into element content or attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip CR/LF (and other control chars) so a value cannot inject extra email headers. */
export function sanitizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface EscalationAlertOptions {
  to: string;
  staffName: string;
  reason: string;
  conversationId: string;
  customerName: string;
  lastMessage: string;
  dashboardUrl: string;
}

export interface StaffWelcomeOptions {
  to: string;
  name: string;
  email: string;
  temporaryPassword: string;
  dashboardUrl: string;
}

export async function sendEscalationAlert(opts: EscalationAlertOptions): Promise<void> {
  const subject = sanitizeHeader(`⚠️ New escalation: ${opts.customerName}`);
  const html = `
    <h2>Human attention required</h2>
    <p>Hi ${escapeHtml(opts.staffName)},</p>
    <p>A conversation needs your attention.</p>
    <table>
      <tr><td><b>Customer:</b></td><td>${escapeHtml(opts.customerName)}</td></tr>
      <tr><td><b>Reason:</b></td><td>${escapeHtml(opts.reason)}</td></tr>
      <tr><td><b>Last message:</b></td><td>${escapeHtml(opts.lastMessage)}</td></tr>
    </table>
    <p><a href="${escapeHtml(`${opts.dashboardUrl}/escalations`)}">Open in dashboard →</a></p>
  `;

  if (!resend) {
    logger.info({ conversationId: opts.conversationId, reason: opts.reason }, "Email notification logged (RESEND_API_KEY unset)");
    return;
  }

  try {
    await resend.emails.send({
      from: alertsFrom,
      to: sanitizeHeader(opts.to),
      subject,
      html,
    });
  } catch (err) {
    logger.error({ err, to: opts.to }, "Failed to send escalation email via Resend");
  }
}

export async function sendStaffWelcome(opts: StaffWelcomeOptions): Promise<void> {
  const subject = "Your dashboard access";
  const html = `
    <h2>Welcome, ${escapeHtml(opts.name)}!</h2>
    <p>You have been added to the Resin Art dashboard.</p>
    <p><b>Login URL:</b> ${escapeHtml(`${opts.dashboardUrl}/login`)}</p>
    <p><b>Email:</b> ${escapeHtml(opts.email)}</p>
    <p><b>Password:</b> ${escapeHtml(opts.temporaryPassword)}</p>
    <p>Please change your password after first login.</p>
  `;

  if (!resend) {
    logger.info("Staff welcome email logged (RESEND_API_KEY unset)");
    return;
  }

  try {
    await resend.emails.send({
      from: welcomeFrom,
      to: sanitizeHeader(opts.to),
      subject,
      html,
    });
  } catch (err) {
    logger.error({ err, to: opts.to }, "Failed to send welcome email via Resend");
  }
}
