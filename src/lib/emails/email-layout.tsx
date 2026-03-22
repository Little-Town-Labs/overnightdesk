import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  unsubscribeUrl?: string;
}

export function EmailLayout({
  preview,
  children,
  unsubscribeUrl,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={logoStyle}>OvernightDesk</Text>
          <Section style={contentStyle}>{children}</Section>
          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            OvernightDesk — Managed Claude Code Hosting
            <br />
            Little Town Labs
          </Text>
          {unsubscribeUrl && (
            <Text style={footerStyle}>
              <a href={unsubscribeUrl} style={linkStyle}>
                Unsubscribe from non-essential emails
              </a>
            </Text>
          )}
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: "#09090b",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const containerStyle = {
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
};

const logoStyle = {
  color: "#fafafa",
  fontSize: "24px",
  fontWeight: "bold" as const,
  textAlign: "center" as const,
  margin: "0 0 32px",
};

const contentStyle = {
  backgroundColor: "#18181b",
  borderRadius: "8px",
  padding: "32px",
  border: "1px solid #27272a",
};

const hrStyle = {
  borderColor: "#27272a",
  margin: "32px 0 16px",
};

const footerStyle = {
  color: "#71717a",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "4px 0",
};

const linkStyle = {
  color: "#a1a1aa",
  textDecoration: "underline",
};
