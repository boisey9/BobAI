import Link from "next/link";
import { redirect } from "next/navigation";
import { hasOwnerSession } from "@/lib/session";
import { ownerAuthEnabled } from "@/lib/owner-auth";
import { OwnerSecurity } from "@/components/owner-security";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!(await hasOwnerSession())) redirect("/login");
  return (
    <main className="dashboard-main" style={{ maxWidth: 960, margin: "0 auto" }}>
      <Link href="/">← Today and projects</Link>
      {ownerAuthEnabled() ? (
        <OwnerSecurity />
      ) : (
        <p>Passkey migration has not been enabled on this deployment.</p>
      )}
    </main>
  );
}
