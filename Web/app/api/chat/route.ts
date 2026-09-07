import { NextRequest, NextResponse } from "next/server";
import { chatWithBob } from "@/lib/bob-core";
import { hasOwnerSession, validateOwnerCsrfToken } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!(await hasOwnerSession()))
    return NextResponse.json({ error: "Sign in to Bob." }, { status: 401 });
  if (
    !(await validateOwnerCsrfToken(
      request.headers.get("x-bob-csrf") ?? undefined,
    ))
  )
    return NextResponse.json(
      { error: "Your session changed. Reload before sending." },
      { status: 403 },
    );
  const text = await request.text();
  if (text.length > 32_768)
    return NextResponse.json(
      { error: "Message history is too large." },
      { status: 413 },
    );
  let body: { projectKey?: unknown; messages?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (
    !body ||
    typeof body.projectKey !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(body.projectKey) ||
    !Array.isArray(body.messages) ||
    body.messages.length < 1 ||
    body.messages.length > 20 ||
    !body.messages.every(
      (m) =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string" &&
        m.content.trim().length > 0 &&
        m.content.length <= 4_000,
    ) ||
    body.messages.at(-1).role !== "user"
  )
    return NextResponse.json(
      { error: "Invalid workspace or message." },
      { status: 400 },
    );
  try {
    const response = await chatWithBob({
      projectKey: body.projectKey,
      messages: body.messages.map(({ role, content }) => ({ role, content })),
    });
    return NextResponse.json(response, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Bob could not respond. Your message has not been saved as a task. Try again shortly.",
      },
      { status: 503 },
    );
  }
}
