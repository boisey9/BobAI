import Link from "next/link";
import { redirect } from "next/navigation";
import { OwnerCheckpointImport } from "@/components/owner-checkpoint-import";
import { getOwnerCsrfToken, hasOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ImportPage() {
  if (!(await hasOwnerSession())) redirect("/login");
  const csrfToken = await getOwnerCsrfToken();
  if (!csrfToken) redirect("/login");

  return (
    <main className="dashboard-main" style={{ maxWidth: 960, margin: "0 auto" }}>
      <Link href="/">← Today and projects</Link>
      <header className="section-heading" style={{ marginTop: 24 }}>
        <div>
          <p className="eyebrow">Project continuity</p>
          <h1>Import checkpoints</h1>
          <p>Compare the prepared checkpoints with each project’s current context, then confirm the import.</p>
        </div>
      </header>
      <OwnerCheckpointImport csrfToken={csrfToken} />
    </main>
  );
}
