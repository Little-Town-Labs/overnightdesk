import { Button, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./email-layout";

interface ProvisioningEmailProps {
  name: string;
  dashboardUrl: string;
  unsubscribeUrl?: string;
}

export function ProvisioningEmail({
  name,
  dashboardUrl,
  unsubscribeUrl,
}: ProvisioningEmailProps) {
  return (
    <EmailLayout
      preview="Your Claude Code instance is ready"
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={headingStyle}>Your instance is ready</Text>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        Your managed Claude Code instance has been provisioned and is ready to
        use. Head to your dashboard to connect your Claude Code account and
        start running tasks.
      </Text>
      <Button href={dashboardUrl} style={buttonStyle}>
        Open Dashboard
      </Button>
      <Text style={smallTextStyle}>
        Next step: Click &quot;Connect Claude Code&quot; in your dashboard to
        authenticate with your Anthropic account.
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
