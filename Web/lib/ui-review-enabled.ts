// Explicit synthetic review only; never an owner authentication bypass.
export function reviewEnabled(host: string | null) {
  return process.env.BOB_UI_REVIEW_ENABLED === "true" && process.env.NODE_ENV === "development" && !process.env.VERCEL && !process.env.VERCEL_ENV &&
    !["DATABASE_URL","BOB_AUTH_DATABASE_URL","BOB_CORE_DEVICE_TOKEN","AI_API_KEY","OPENAI_API_KEY","ZAI_API_KEY","BOB_AUTH_SECRET","BOB_CONTROL_CENTER_SESSION_SECRET"].some(k=>process.env[k]) &&
    !!host && ["127.0.0.1","localhost"].includes(host.split(":")[0]);
}
