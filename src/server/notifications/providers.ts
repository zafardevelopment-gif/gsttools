import "server-only";

/**
 * Channel providers behind the NotificationService abstraction.
 *
 * WhatsAppProvider — WhatsApp Business Cloud API (primary channel).
 * SmsProvider     — MSG91-style HTTP gateway (built + testable now, but kept
 *                   dormant until the business flips `notification_channel`).
 *
 * Both are configured purely via env vars; when unconfigured they return a
 * "skipped" result instead of failing, so dev/test environments work offline.
 */

export type SendResult = {
  status: "sent" | "failed" | "skipped";
  providerId?: string;
  error?: string;
};

export type ProviderMessage = {
  to: string; // E.164-ish phone number
  /** Template name (WhatsApp) / DLT template id (SMS). */
  template: string;
  /** Rendered body text (SMS fallback / WA template params source). */
  body: string;
  params?: Record<string, string>;
};

export interface NotificationProvider {
  readonly channel: "whatsapp" | "sms";
  send(msg: ProviderMessage): Promise<SendResult>;
}

// ---- WhatsApp Business Cloud API ---------------------------------------------
export class WhatsAppProvider implements NotificationProvider {
  readonly channel = "whatsapp" as const;

  async send(msg: ProviderMessage): Promise<SendResult> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return { status: "skipped", error: "WhatsApp Cloud API not configured." };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: msg.to,
            type: "template",
            template: {
              name: msg.template,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
              components: msg.params
                ? [
                    {
                      type: "body",
                      parameters: Object.values(msg.params).map((text) => ({
                        type: "text",
                        text,
                      })),
                    },
                  ]
                : undefined,
            },
          }),
        },
      );
      const data = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        return { status: "failed", error: data.error?.message ?? `HTTP ${res.status}` };
      }
      return { status: "sent", providerId: data.messages?.[0]?.id };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ---- SMS gateway (MSG91-compatible; dormant by default) ----------------------
export class SmsProvider implements NotificationProvider {
  readonly channel = "sms" as const;

  async send(msg: ProviderMessage): Promise<SendResult> {
    const authKey = process.env.SMS_AUTH_KEY;
    const sender = process.env.SMS_SENDER_ID;
    if (!authKey || !sender) {
      return { status: "skipped", error: "SMS gateway not configured." };
    }

    try {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          authkey: authKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender,
          template_id: msg.template,
          recipients: [{ mobiles: msg.to, ...msg.params }],
        }),
      });
      const data = (await res.json()) as { type?: string; message?: string };
      if (!res.ok || data.type === "error") {
        return { status: "failed", error: data.message ?? `HTTP ${res.status}` };
      }
      return { status: "sent", providerId: data.message };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }
}
