import { Resend } from "resend";
import { render } from "@react-email/components";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { VerificationEmail } from "@/lib/emails/verification-email";
import { PasswordResetEmail } from "@/lib/emails/password-reset-email";
import * as React from "react";

const EMAIL_FROM =
  process.env.EMAIL_FROM || "OvernightDesk <noreply@overnightdesk.com>";

type EmailType =
  | "verification"
  | "password_reset";

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

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const { to, subject, html, text, emailType, userId } = options;
  let lastError = "";
  let messageId: string | undefined;
  const resend = getResendClient();

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
