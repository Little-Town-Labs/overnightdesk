import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["200", "400", "700", "800"],
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["300", "400", "500"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

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
      <body className={`${bricolage.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased font-body`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
