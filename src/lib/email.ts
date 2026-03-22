import { Resend } from "resend";
import { render } from "@react-email/components";
import { db } from "@/db";
import { emailLog, user } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { VerificationEmail } from "@/lib/emails/verification-email";
import { PasswordResetEmail } from "@/lib/emails/password-reset-email";
import { WelcomeEmail } from "@/lib/emails/welcome-email";
import { PaymentFailureEmail } from "@/lib/emails/payment-failure-email";
import { ProvisioningEmail } from "@/lib/emails/provisioning-email";
import * as React from "react";

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM =
  process.env.EMAIL_FROM || "OvernightDesk <noreply@overnightdesk.com>";

import { getAppUrl } from "@/lib/config";

const APP_URL = getAppUrl();

type EmailType =
  | "verification"
  | "password_reset"
  | "welcome"
  | "payment_failure"
  | "provisioning";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  emailType: EmailType;
  userId?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const RETRY_DELAYS = [1000, 2000, 4000];

export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const { to, subject, html, text, emailType, userId } = options;
  let lastError = "";
  let messageId: string | undefined;

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    if (data?.id) {
      messageId = data.id;
      break;
    }

    lastError = error?.message || "Unknown error";

    if (attempt < RETRY_DELAYS.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }

  try {
    await db.insert(emailLog).values({
      userId: userId || null,
      recipientEmail: to,
      emailType,
      resendId: messageId || null,
      status: messageId ? "sent" : "failed",
      error: messageId ? null : lastError,
    });
  } catch {
    // Email logging should never block the operation
  }

  if (messageId) {
    return { success: true, messageId };
  }
  return { success: false, error: lastError };
}

async function isOptedOut(userId: string): Promise<boolean> {
  const rows = await db
    .select({ emailOptOut: user.emailOptOut })
    .from(user)
    .where(eq(user.id, userId));
  return rows[0]?.emailOptOut === true;
}

async function hasRecentEmail(
  recipientEmail: string,
  emailType: EmailType,
  withinMs: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinMs);
  const rows = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.recipientEmail, recipientEmail),
        eq(emailLog.emailType, emailType),
        eq(emailLog.status, "sent"),
        gte(emailLog.createdAt, cutoff)
      )
    );
  return rows.length > 0;
}

export async function sendVerificationEmail(
  userInfo: { email: string; name: string },
  url: string
): Promise<EmailResult> {
  const html = await render(
    React.createElement(VerificationEmail, {
      name: userInfo.name,
      verificationUrl: url,
    })
  );

  return sendEmail({
    to: userInfo.email,
    subject: "Verify your email — OvernightDesk",
    html,
    text: `Hi ${userInfo.name}, verify your email: ${url}`,
    emailType: "verification",
  });
}

export async function sendPasswordResetEmail(
  userInfo: { email: string; name: string },
  url: string
): Promise<EmailResult> {
  const html = await render(
    React.createElement(PasswordResetEmail, {
      name: userInfo.name,
      resetUrl: url,
    })
  );

  return sendEmail({
    to: userInfo.email,
    subject: "Reset your password — OvernightDesk",
    html,
    text: `Hi ${userInfo.name}, reset your password: ${url}`,
    emailType: "password_reset",
  });
}

export async function sendWelcomeEmail(options: {
  user: { email: string; name: string; id: string };
  isWaitlistConvert: boolean;
}): Promise<EmailResult> {
  const { user: userInfo, isWaitlistConvert } = options;

  if (await isOptedOut(userInfo.id)) {
    return { success: true, messageId: "skipped-opt-out" };
  }

  const html = await render(
    React.createElement(WelcomeEmail, {
      name: userInfo.name,
      dashboardUrl: `${APP_URL}/dashboard`,
      isWaitlistConvert,
    })
  );

  return sendEmail({
    to: userInfo.email,
    subject: isWaitlistConvert
      ? "You're off the waitlist! — OvernightDesk"
      : "Welcome to OvernightDesk",
    html,
    text: `Hi ${userInfo.name}, welcome to OvernightDesk! Visit your dashboard: ${APP_URL}/dashboard`,
    emailType: "welcome",
    userId: userInfo.id,
  });
}

export async function sendPaymentFailureEmail(options: {
  user: { email: string; name: string; id: string };
  amount: string;
  portalUrl: string;
}): Promise<EmailResult> {
  const { user: userInfo, amount, portalUrl } = options;

  // Dedup: no duplicate payment failure emails within 24 hours
  const twentyFourHours = 24 * 60 * 60 * 1000;
  if (await hasRecentEmail(userInfo.email, "payment_failure", twentyFourHours)) {
    return { success: true, messageId: "skipped-dedup" };
  }

  const html = await render(
    React.createElement(PaymentFailureEmail, {
      name: userInfo.name,
      amount,
      portalUrl,
    })
  );

  return sendEmail({
    to: userInfo.email,
    subject: "Action required: payment failed — OvernightDesk",
    html,
    text: `Hi ${userInfo.name}, your payment of ${amount} failed. Update your payment method: ${portalUrl}`,
    emailType: "payment_failure",
    userId: userInfo.id,
  });
}

export async function sendProvisioningEmail(options: {
  user: { email: string; name: string; id: string };
  dashboardUrl: string;
}): Promise<EmailResult> {
  const { user: userInfo, dashboardUrl } = options;

  if (await isOptedOut(userInfo.id)) {
    return { success: true, messageId: "skipped-opt-out" };
  }

  const html = await render(
    React.createElement(ProvisioningEmail, {
      name: userInfo.name,
      dashboardUrl,
    })
  );

  return sendEmail({
    to: userInfo.email,
    subject: "Your instance is ready — OvernightDesk",
    html,
    text: `Hi ${userInfo.name}, your Claude Code instance is ready! Open your dashboard: ${dashboardUrl}`,
    emailType: "provisioning",
    userId: userInfo.id,
  });
}
