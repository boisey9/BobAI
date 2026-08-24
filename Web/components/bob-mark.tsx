type BobMarkProps = {
  compact?: boolean;
};

export function BobMark({ compact = false }: BobMarkProps) {
  return (
    <div className="brand-lockup" aria-label="Bob Control Center">
      <span className="bob-mark" aria-hidden="true">
        <span className="bob-mark-eye" />
        <span className="bob-mark-eye" />
        <span className="bob-mark-mouth" />
      </span>
      {!compact && (
        <span>
          <strong>Bob</strong>
          <small>Control Center</small>
        </span>
      )}
    </div>
  );
}
