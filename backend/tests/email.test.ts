import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestEnv } from "./env.ts";

applyTestEnv({ RESEND_API_KEY: "re_test_key", RESEND_FROM_DOMAIN: "example.com" });

const send = vi.fn(async (_payload: any) => ({ data: { id: "email-1" }, error: null }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { sendEscalationAlert, sendStaffWelcome, escapeHtml, sanitizeHeader } = await import(
  "../src/services/email.ts"
);

const hostile = "<script>x</script>\r\nBcc: a@b";

beforeEach(() => send.mockClear());

describe("email templates", () => {
  it("escapes & < > \" ' in HTML", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("strips CR/LF from header values", () => {
    expect(sanitizeHeader("a\r\nBcc: x@y\nz")).not.toMatch(/[\r\n]/);
  });

  it("sendEscalationAlert escapes every interpolated value and sanitizes the subject", async () => {
    await sendEscalationAlert({
      to: "asha@asharesins.com",
      staffName: `<b>Asha</b>`,
      reason: `"reason"<i>`,
      conversationId: "conv-1",
      customerName: hostile,
      lastMessage: `<img src=x onerror=alert(1)> & 'quoted'`,
      dashboardUrl: `https://dash.example.com/"><script>evil()</script>`,
    });

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]![0];

    // Subject: no CR/LF (no header injection) and not HTML-escaped.
    expect(payload.subject).not.toMatch(/[\r\n]/);
    expect(payload.subject).toContain("<script>x</script>");
    expect(payload.subject).toContain("New escalation:");

    // HTML: no raw tags from user input anywhere.
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).not.toContain("<img");
    expect(payload.html).not.toContain("<b>Asha");
    expect(payload.html).not.toContain("<i>");
    expect(payload.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(payload.html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &#39;quoted&#39;");
    expect(payload.html).toContain("&quot;reason&quot;&lt;i&gt;");
    // href cannot be broken out of.
    expect(payload.html).toContain(
      `href="https://dash.example.com/&quot;&gt;&lt;script&gt;evil()&lt;/script&gt;/escalations"`,
    );
  });

  it("sendStaffWelcome escapes name, email, password and URL", async () => {
    await sendStaffWelcome({
      to: "priya@asharesins.com",
      name: hostile,
      email: `x"@y.com<`,
      temporaryPassword: `p<a>ss&'`,
      dashboardUrl: `https://dash.example.com/<x>`,
    });

    const payload = send.mock.calls[0]![0];
    expect(payload.subject).not.toMatch(/[\r\n]/);
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("Welcome, &lt;script&gt;x&lt;/script&gt;");
    expect(payload.html).toContain("x&quot;@y.com&lt;");
    expect(payload.html).toContain("p&lt;a&gt;ss&amp;&#39;");
    expect(payload.html).toContain("https://dash.example.com/&lt;x&gt;/login");
  });
});
