export const dayLabel = (day: string, locale: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' });
export function calendarDays(start: string, end: string): string[] {
  const result: string[] = []; const date = new Date(`${start}T12:00:00`); const last = new Date(`${end}T12:00:00`);
  while (date <= last && result.length < 366) {
    result.push(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);
    date.setDate(date.getDate()+1);
  }
  return result;
}
