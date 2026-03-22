import { Button, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./email-layout";

interface PaymentFailureEmailProps {
  name: string;
  amount: string;
  portalUrl: string;
}

export function PaymentFailureEmail({
  name,
  amount,
  portalUrl,
}: PaymentFailureEmailProps) {
  return (
    <EmailLayout preview="Action required: payment failed">
      <Text style={headingStyle}>Payment failed</Text>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        We were unable to process your payment of {amount} for your OvernightDesk
        subscription. Please update your payment method to avoid any
        interruption to your service.
      </Text>
      <Text style={textStyle}>
        You have a 3-day grace period before your instance is suspended.
      </Text>
      <Button href={portalUrl} style={buttonStyle}>
        Update Payment Method
      </Button>
      <Text style={smallTextStyle}>
        If you believe this is an error, please check with your card issuer or
        try a different payment method.
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
