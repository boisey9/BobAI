import type { ContextPackage } from "@/lib/types";

export function contextTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Time not reported";
  return new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto" }) + " (Toronto)";
}

export function ContextSourceStatus({ context, source, label }: {
  context: ContextPackage | null;
  source: string;
  label: string;
}) {
  const details = context?.sources?.[source];
  const checked = details?.checkedAt ? Date.parse(details.checkedAt) : NaN;
  const old = Number.isFinite(checked) && Date.now() - checked > 6 * 60 * 60 * 1000;
  return (
    <p className="source-status" aria-label={`${label} source status`}>
      <strong>{label}: {!context || details?.status === "unavailable" ? "unavailable" : details?.status === "available" ? "retrieved" : "unverified"}.</strong>{" "}
      {!details ? "Source freshness and completeness are not reported." : <>
        {details.truncated ? "Bounded snapshot; more records may exist. " : details.status === "available" ? "No truncation reported for this source. " : "Refresh to retry this source. "}
        Checked {contextTime(details.checkedAt)}.
        {old && " Checked more than six hours ago; refresh before relying on this snapshot."}
      </>}
    </p>
  );
}
