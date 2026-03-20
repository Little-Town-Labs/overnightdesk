import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OvernightDesk — Your business never sleeps",
  description:
    "A private AI assistant that handles support, operations, and reporting while you sleep. Built for solo entrepreneurs and small businesses.",
  openGraph: {
    title: "OvernightDesk — Your business never sleeps",
    description:
      "A private AI assistant that handles your customer support, operations, and reporting. Built for solo entrepreneurs in regulated industries.",
    url: "https://overnightdesk.com",
    siteName: "OvernightDesk",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OvernightDesk — Your business never sleeps",
    description:
      "A private AI assistant for solo entrepreneurs. Support, ops, and reporting handled — while you sleep.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
