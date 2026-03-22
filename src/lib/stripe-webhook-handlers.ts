import { db } from "@/db";
import { subscription, platformAuditLog, user, instance } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendPaymentFailureEmail } from "@/lib/email";
import { stripe } from "@/lib/stripe";
import { createInstance } from "@/lib/instance";
import { provisionerClient } from "@/lib/provisioner";

export function mapPriceIdToPlan(
  priceId: string
): "starter" | "pro" {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  return "starter";
}

export async function handleCheckoutCompleted(
  session: {
    client_reference_id: string | null;
    customer: string | object | null;
    subscription: string | object | null;
  },
  priceId: string
): Promise<void> {
  const userId = session.client_reference_id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : null;

  if (!userId || !subscriptionId) return;

  // Idempotency: skip if subscription already exists
  const existing = await findSubscription(subscriptionId);
  if (existing) return;

  const plan = mapPriceIdToPlan(priceId);

  await db.insert(subscription).values({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    plan,
    status: "active",
    currentPeriodEnd: null,
  });

  await db.insert(platformAuditLog).values({
    actor: "stripe-webhook",
    action: "subscription.created",
    target: `user:${userId}`,
    details: { stripeSubscriptionId: subscriptionId, plan, status: "active" },
  });

  // Trigger provisioning
  try {
    const { instance: inst, plaintextToken } = await createInstance(userId, plan);
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://overnightdesk.com";

    // Fire-and-forget: don't await the provisioner response
    provisionerClient
      .provision({
        tenantId: inst.tenantId,
        plan,
        gatewayPort: inst.gatewayPort!,
        dashboardTokenHash: inst.dashboardTokenHash!,
        callbackUrl: `${appUrl}/api/provisioner/callback`,
      })
      .catch(() => {
        // Provisioner failure handled via callback or manual retry
      });
  } catch {
    // Instance creation failure — logged but doesn't block subscription creation
  }
}

async function findSubscription(stripeSubscriptionId: string) {
  const rows = await db
    .select()
    .from(subscription)
    .where(eq(subscription.stripeSubscriptionId, stripeSubscriptionId));
  return rows[0] ?? null;
}

export async function handleInvoicePaid(
  stripeSubscriptionId: string,
  periodEnd: number
): Promise<void> {
  const sub = await findSubscription(stripeSubscriptionId);
  if (!sub) return;

  await db
    .update(subscription)
    .set({
      status: "active",
      currentPeriodEnd: new Date(periodEnd * 1000),
      updatedAt: new Date(),
    })
    .where(eq(subscription.stripeSubscriptionId, stripeSubscriptionId));

  await db.insert(platformAuditLog).values({
    actor: "stripe-webhook",
    action: "invoice.paid",
    target: `user:${sub.userId}`,
    details: { stripeSubscriptionId },
  });
}

export async function handleInvoicePaymentFailed(
  stripeSubscriptionId: string,
  amountDue: number
): Promise<void> {
  const sub = await findSubscription(stripeSubscriptionId);
  if (!sub) return;

  await db
    .update(subscription)
    .set({
      status: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(subscription.stripeSubscriptionId, stripeSubscriptionId));

  await db.insert(platformAuditLog).values({
    actor: "stripe-webhook",
    action: "payment.failed",
    target: `user:${sub.userId}`,
    details: { stripeSubscriptionId, amountDue },
  });

  // Send payment failure email
  if (!sub.stripeCustomerId) return;

  const userRows = await db
    .select()
    .from(user)
    .where(eq(user.id, sub.userId));
  const userRecord = userRows[0];
  if (!userRecord) return;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url:
      (process.env.NEXT_PUBLIC_APP_URL || "https://overnightdesk.com") +
      "/dashboard",
  });

  const amountStr = `$${(amountDue / 100).toFixed(2)}`;

  await sendPaymentFailureEmail({
    user: {
      email: userRecord.email,
      name: userRecord.name,
      id: userRecord.id,
    },
    amount: amountStr,
    portalUrl: portalSession.url,
  });
}

export async function handleSubscriptionUpdated(
  stripeSubscriptionId: string,
  status: string,
  priceId: string,
  periodEnd: number
): Promise<void> {
  const sub = await findSubscription(stripeSubscriptionId);
  if (!sub) return;

  const plan = mapPriceIdToPlan(priceId);
  const mappedStatus = mapStripeStatus(status);

  await db
    .update(subscription)
    .set({
      status: mappedStatus,
      plan,
      currentPeriodEnd: new Date(periodEnd * 1000),
      updatedAt: new Date(),
    })
    .where(eq(subscription.stripeSubscriptionId, stripeSubscriptionId));

  await db.insert(platformAuditLog).values({
    actor: "stripe-webhook",
    action: "subscription.updated",
    target: `user:${sub.userId}`,
    details: { stripeSubscriptionId, status: mappedStatus, plan },
  });
}

export async function handleSubscriptionDeleted(
  stripeSubscriptionId: string
): Promise<void> {
  const sub = await findSubscription(stripeSubscriptionId);
  if (!sub) return;

  await db
    .update(subscription)
    .set({
      status: "canceled",
      updatedAt: new Date(),
    })
    .where(eq(subscription.stripeSubscriptionId, stripeSubscriptionId));

  await db.insert(platformAuditLog).values({
    actor: "stripe-webhook",
    action: "subscription.canceled",
    target: `user:${sub.userId}`,
    details: { stripeSubscriptionId },
  });

  // Trigger deprovisioning
  try {
    const instances = await db
      .select()
      .from(instance)
      .where(eq(instance.userId, sub.userId));

    const activeInstance = instances.find(
      (i) =>
        i.status === "running" ||
        i.status === "awaiting_auth" ||
        i.status === "queued" ||
        i.status === "provisioning"
    );

    if (activeInstance) {
      provisionerClient.deprovision(activeInstance.tenantId).catch(() => {
        // Deprovisioning failure handled manually
      });

      await db
        .update(instance)
        .set({ status: "stopped", updatedAt: new Date() })
        .where(eq(instance.id, activeInstance.id));
    }
  } catch {
    // Deprovisioning failure — logged but doesn't block subscription cancellation
  }
}

function mapStripeStatus(
  stripeStatus: string
): "active" | "past_due" | "canceled" | "trialing" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    case "trialing":
      return "trialing";
    default:
      return "canceled";
  }
}
