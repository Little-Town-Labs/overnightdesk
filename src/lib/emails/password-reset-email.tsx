import { Button, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./email-layout";

interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
}

export function PasswordResetEmail({
  name,
  resetUrl,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout preview="Reset your password">
      <Text style={headingStyle}>Reset your password</Text>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        We received a request to reset the password for your OvernightDesk
        account. Click the button below to choose a new password.
      </Text>
      <Button href={resetUrl} style={buttonStyle}>
        Reset Password
      </Button>
      <Text style={smallTextStyle}>
        This link expires in 1 hour and can only be used once. If you
        didn&apos;t request a password reset, you can safely ignore this email —
        your password will remain unchanged.
      </Text>
    </EmailLayout>
  );
}

const headingStyle = {
  color: "#fafafa",
  fontSize: "20px",
  fontWeight: "bold" as const,
  margin: "0 0 16px",
};

const textStyle = {
  color: "#d4d4d8",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const buttonStyle = {
  backgroundColor: "#fafafa",
  borderRadius: "6px",
  color: "#09090b",
  display: "inline-block" as const,
  fontSize: "14px",
  fontWeight: "600" as const,
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
  margin: "16px 0",
};

const smallTextStyle = {
  color: "#71717a",
  fontSize: "12px",
  lineHeight: "20px",
  margin: "16px 0 0",
};
