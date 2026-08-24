import { BobMark } from "@/components/bob-mark";

export default function Loading() {
  return (
    <main className="login-page">
      <section className="login-card">
        <BobMark />
        <div className="login-copy">
          <p className="eyebrow">Bob Control Center</p>
          <h1>Assembling current Core state…</h1>
          <p>Loading health, project context, and privacy-safe activity.</p>
        </div>
      </section>
    </main>
  );
}
