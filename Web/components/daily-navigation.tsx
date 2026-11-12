"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./daily-workspace.module.css";

const sections = [
  ["today", "Today"], ["overview", "System state"], ["task-manager", "Tasks"], ["project-state", "Project workspace"],
  ["approvals", "Approvals"], ["interfaces", "Connections"], ["release-health", "Implementation evidence"], ["activity", "Activity"],
] as const;

export function DailyNavigation({ project, mobile = false }: { project: string; mobile?: boolean }) {
  const [active, setActive] = useState<string>("today");
  useEffect(() => {
    let frame = 0;
    function inspect() {
      frame = 0;
      const positions = sections.map(([id]) => ({ id, top: document.getElementById(id)?.getBoundingClientRect().top }))
        .filter((item): item is { id: typeof sections[number][0]; top: number } => item.top !== undefined)
        .sort((a, b) => a.top - b.top);
      setActive(positions.filter(item => item.top <= 180).at(-1)?.id ?? positions[0]?.id ?? "today");
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(inspect); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); window.removeEventListener("hashchange", schedule); };
  }, []);
  return <nav className={mobile ? styles.mobileNavigation : undefined} aria-label={mobile ? "Mobile workspace navigation" : "Control Center navigation"}>
    {sections.map(([id, label]) => <a key={id} className={`nav-link${active === id ? " active" : ""}`} href={`#${id}`} aria-current={active === id ? "location" : undefined}>{label}</a>)}
    <Link className="nav-link" href={`/chat?project=${encodeURIComponent(project)}`}>Talk to Bob</Link>
    <Link className="nav-link" href={`/account?project=${encodeURIComponent(project)}`}>Settings &amp; access</Link>
  </nav>;
}
