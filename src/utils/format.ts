export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `¥${value.toFixed(2)}`;
}

export function kg(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value}kg`;
}

const dateTimeFmt = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFmt.format(date).replace(/\//g, "-");
}

export function date(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateFmt.format(date).replace(/\//g, "-");
}
