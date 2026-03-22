import { Button, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./email-layout";

interface WelcomeEmailProps {
  name: string;
  dashboardUrl: string;
  isWaitlistConvert: boolean;
  unsubscribeUrl?: string;
}

export function WelcomeEmail({
  name,
  dashboardUrl,
  isWaitlistConvert,
  unsubscribeUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout
      preview="Welcome to OvernightDesk"
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={headingStyle}>
        {isWaitlistConvert
          ? "You're off the waitlist!"
          : "Welcome to OvernightDesk"}
      </Text>
      <Text style={textStyle}>Hi {name},</Text>
      {isWaitlistConvert ? (
        <Text style={textStyle}>
          Thanks for your patience — your spot is ready. Your account is now
          active and you can subscribe to get started with your managed Claude
          Code instance.
        </Text>
      ) : (
        <Text style={textStyle}>
          Your email has been verified and your account is active. Subscribe to
          get your own managed Claude Code instance running overnight.
        </Text>
      )}
      <Button href={dashboardUrl} style={buttonStyle}>
        Go to Dashboard
      </Button>
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
