import { Button, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./email-layout";

interface VerificationEmailProps {
  name: string;
  verificationUrl: string;
}

export function VerificationEmail({
  name,
  verificationUrl,
}: VerificationEmailProps) {
  return (
    <EmailLayout preview="Verify your email address to get started">
      <Text style={headingStyle}>Verify your email</Text>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        Thanks for signing up for OvernightDesk. Click the button below to
        verify your email address and activate your account.
      </Text>
      <Button href={verificationUrl} style={buttonStyle}>
        Verify Email Address
      </Button>
      <Text style={smallTextStyle}>
        This link expires in 24 hours. If you didn&apos;t create an account, you
        can safely ignore this email.
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
