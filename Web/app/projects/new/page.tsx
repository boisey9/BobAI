import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectCreator } from "@/components/project-creator";
import { getOwnerCsrfToken, hasOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewProjectPage() {
  if (!(await hasOwnerSession())) redirect("/login");
  const csrfToken = await getOwnerCsrfToken();
  if (!csrfToken) redirect("/login");
  return <main className="dashboard-main project-onboarding">
    <Link href="/">← Today and projects</Link>
    <header className="section-heading"><div><p className="eyebrow">Your projects</p><h1>New project</h1>
      <p>Give an outcome its own place for tasks, decisions and approved context.</p></div></header>
    <ProjectCreator csrfToken={csrfToken} />
  </main>;
}
