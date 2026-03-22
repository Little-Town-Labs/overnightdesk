import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import {
  handleCheckoutCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
} from "@/lib/stripe-webhook-handlers";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { success: false, error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { success: false, error: "Webhook not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 1 }
        );
        const priceId = lineItems.data[0]?.price?.id ?? "";
        await handleCheckoutCompleted(session, priceId);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId =
          typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          await handleInvoicePaid(subId, invoice.lines.data[0]?.period?.end ?? 0);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId =
          typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          await handleInvoicePaymentFailed(subId, invoice.amount_due);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const item = sub.items.data[0];
        const priceId = item?.price?.id ?? "";
        const periodEnd = item?.current_period_end ?? 0;
        await handleSubscriptionUpdated(
          sub.id,
          sub.status,
          priceId,
          periodEnd
        );
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub.id);
        break;
      }
    }
  } catch (error) {
    console.error("Webhook processing failed:", {
      eventType: event.type,
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
