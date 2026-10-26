export type LocalDueFields = { dueDate: string; dueTime: string };
type DueResult = { ok: true; dueAt: string | null } | { ok: false; error: string };

export function localDueFields(value: string | null): LocalDueFields {
  if (!value) return { dueDate: "", dueTime: "" };
  const date = new Date(value);
  const pad = (number: number, length = 2) => String(number).padStart(length, "0");
  return {
    dueDate: `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    dueTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function parseLocalDue({ dueDate, dueTime }: LocalDueFields): DueResult {
  if (!dueDate && !dueTime) return { ok: true, dueAt: null };
  if (!dueDate || !dueTime) return { ok: false, error: "Enter both a due date and time, or clear both fields." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !/^\d{2}:\d{2}$/.test(dueTime)) {
    return { ok: false, error: "Use YYYY-MM-DD for the date and HH:MM for the time (24-hour)." };
  }
  const [year, month, day] = dueDate.split("-").map(Number);
  const [hour, minute] = dueTime.split(":").map(Number);
  const leap = year! % 4 === 0 && (year! % 100 !== 0 || year! % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year! < 1 || month! < 1 || month! > 12 || day! < 1 || day! > days[month! - 1]!
      || hour! > 23 || minute! > 59) {
    return { ok: false, error: "Enter a valid calendar date and a time from 00:00 to 23:59." };
  }
  const date = new Date(`${dueDate}T${dueTime}:00`);
  const matches = (candidate: Date) => candidate.getFullYear() === year && candidate.getMonth() + 1 === month
    && candidate.getDate() === day && candidate.getHours() === hour && candidate.getMinutes() === minute;
  if (!Number.isFinite(date.getTime()) || !matches(date)) {
    return { ok: false, error: "This local time does not exist because the clocks change. Choose another time." };
  }
  // Date picks one occurrence during a backwards clock change. Check nearby
  // offsets for another matching instant so the owner never silently gets one.
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    offsets.add(new Date(date.getTime() + hours * 3_600_000).getTimezoneOffset());
  }
  for (const offset of offsets) {
    if (offset !== date.getTimezoneOffset()
        && matches(new Date(date.getTime() + (offset - date.getTimezoneOffset()) * 60_000))) {
      return { ok: false, error: "This local time occurs twice because the clocks change. Choose an unambiguous time." };
    }
  }
  return { ok: true, dueAt: date.toISOString() };
}
