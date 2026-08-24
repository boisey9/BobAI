type StatusCardProps = {
  label: string;
  value: string;
  detail: string;
  state: "healthy" | "warning" | "offline" | "neutral";
  symbol: string;
};

export function StatusCard({
  label,
  value,
  detail,
  state,
  symbol,
}: StatusCardProps) {
  return (
    <article className={`status-card status-${state}`}>
      <div className="status-card-top">
        <span className="status-symbol" aria-hidden="true">
          {symbol}
        </span>
        <span className="status-dot" aria-label={`Status: ${state}`} />
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
