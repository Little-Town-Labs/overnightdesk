import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return new NextResponse(renderPage("Invalid Request", "No token provided."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const result = verifyUnsubscribeToken(token);

  if (!result.valid) {
    return new NextResponse(
      renderPage("Invalid Token", "This unsubscribe link is invalid or has expired."),
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  await db
    .update(user)
    .set({ emailOptOut: true })
    .where(eq(user.id, result.userId));

  return new NextResponse(
    renderPage(
      "Unsubscribed",
      "You have been unsubscribed from non-essential emails. You will still receive important account notifications (verification, password reset, payment alerts)."
    ),
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

function renderPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — OvernightDesk</title>
<style>body{background:#09090b;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#18181b;border:1px solid #27272a;border-radius:8px;padding:32px;max-width:400px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{color:#a1a1aa;font-size:14px;line-height:1.6;margin:0}</style>
</head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}
