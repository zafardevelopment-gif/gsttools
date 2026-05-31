/**
 * Razorpay integration — STUBBED for the MVP.
 *
 * Real flow (wire up later when keys exist):
 *  1. Server creates a Razorpay subscription/order with RAZORPAY_KEY_ID/SECRET.
 *  2. Client opens Razorpay Checkout with the order id.
 *  3. On success, Razorpay calls a webhook; we verify the signature with the
 *     secret and mark GST_subscriptions.status = 'active'.
 *
 * Until keys are configured, `isRazorpayConfigured` is false and the UI shows a
 * "demo upgrade" that simply flips the plan via a server action.
 */
import { getServerEnv } from "@/lib/env";
import type { PlanKey } from "@/lib/constants";

export function isRazorpayConfigured(): boolean {
  const env = getServerEnv();
  return !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET;
}

export type CheckoutOrder = {
  stub: boolean;
  plan: PlanKey;
  orderId: string;
  amountPaise: number;
};

/**
 * Create a checkout order. Stubbed: returns a fake order id. Replace the body
 * with the real Razorpay Orders/Subscriptions API call once keys are set.
 */
export async function createCheckoutOrder(
  plan: PlanKey,
  amountPaise: number,
): Promise<CheckoutOrder> {
  // TODO(real): use the `razorpay` SDK with getServerEnv() keys here.
  return {
    stub: true,
    plan,
    orderId: `stub_order_${plan}_${Date.now()}`,
    amountPaise,
  };
}

/** Verify a Razorpay webhook signature. Stubbed to always-false until keys set. */
export function verifyWebhookSignature(_payload: string, _signature: string): boolean {
  // TODO(real): crypto HMAC-SHA256 with RAZORPAY_KEY_SECRET.
  return false;
}
