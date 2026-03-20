import { NextResponse } from "next/server";
import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  name: z.string().max(100).optional(),
  business: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  try {
    await db
      .insert(waitlist)
      .values({
        email: parsed.data.email.toLowerCase().trim(),
        name: parsed.data.name?.trim() || null,
        business: parsed.data.business?.trim() || null,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
