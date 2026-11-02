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

export interface IgCommentAlertOptions {
  to: string;
  adminName: string;
  commenterUsername?: string | null | undefined;
  text: string;
  mediaCaption?: string | null | undefined;
  dashboardUrl: string;
}

export async function sendIgCommentAlert(opts: IgCommentAlertOptions): Promise<void> {
  const handle = opts.commenterUsername ? `@${opts.commenterUsername}` : "Instagram user";
  const subject = sanitizeHeader(`⚠️ Instagram comment needs attention: ${handle}`);
  const html = `
    <h2>Instagram Comment Needs Attention</h2>
    <p>Hi ${escapeHtml(opts.adminName)},</p>
    <p>A new comment on Instagram has been flagged as a complaint or sensitive message and requires your attention:</p>
    <blockquote style="border-left: 3px solid #e11d48; padding-left: 12px; margin: 12px 0; color: #333;">
      <strong>${escapeHtml(handle)}:</strong> ${escapeHtml(opts.text)}
    </blockquote>
    ${opts.mediaCaption ? `<p style="color: #666; font-size: 0.9em;">Post: ${escapeHtml(opts.mediaCaption.slice(0, 100))}</p>` : ""}
    <p><a href="${escapeHtml(opts.dashboardUrl)}/ig-comments" style="display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 6px;">Open in Dashboard</a></p>
  `;

  if (!resend) {
    logger.info({ to: opts.to, subject, preview: opts.text.slice(0, 100) }, "[DEMO_MODE] IG comment alert email logged");
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
    logger.error({ err, to: opts.to }, "Failed to send IG comment alert email");
  }
}
