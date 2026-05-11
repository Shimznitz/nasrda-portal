// src/app/api/kobo/forms/route.ts
import { NextResponse } from 'next/server';

const KOBO_API_URL = process.env.KOBO_API_URL;
const KOBO_TOKEN = process.env.KOBO_API_TOKEN; // Put in .env.local (NOT NEXT_PUBLIC_)

export async function GET() {
  if (!KOBO_TOKEN) {
    return NextResponse.json({ error: "Kobo API token not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${KOBO_API_URL}/assets/`, {
      headers: {
        'Authorization': `Token ${KOBO_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Kobo API error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data.results || []);
  } catch (err) {
    console.error("Kobo fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch forms" }, { status: 500 });
  }
}