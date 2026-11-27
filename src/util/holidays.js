// US federal holidays (decision #22, JK 11/26/26) for workday counting: the JLL 6-workday notice and lead times.
// Observed dates: a holiday on Saturday is observed Friday, on Sunday Monday (OPM rule). YYYY-MM-DD strings.
const p2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
/** nth (1-based) weekday (0 = Sun) of a month; n = -1 for the last one. */
function nth(y, m, wd, n) {
  if (n > 0) { const d = new Date(y, m, 1); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + 7 * (n - 1)); return d; }
  const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7)); return d;
}
function observed(y, m, day) { const d = new Date(y, m, day); if (d.getDay() === 6) d.setDate(d.getDate() - 1); else if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d; }

export function federalHolidays(year) {
  return [
    observed(year, 0, 1), nth(year, 0, 1, 3), nth(year, 1, 1, 3), nth(year, 4, 1, -1), observed(year, 5, 19), observed(year, 6, 4),
    nth(year, 8, 1, 1), nth(year, 9, 1, 2), observed(year, 10, 11), nth(year, 10, 4, 4), observed(year, 11, 25)
  ].map(ymd);
}
/** Federal holidays from `from` to `to` (inclusive years), plus next year's New Year's Day when it is observed on Dec 31. */
export function federalHolidayList(from, to) {
  const out = new Set();
  for (let y = from - 1; y <= to + 1; y++) for (const d of federalHolidays(y)) { const yy = +d.slice(0, 4); if (yy >= from && yy <= to) out.add(d); }
  return [...out].sort();
}
/** The list the app uses: last year to three years ahead. */
export const appHolidays = (now = new Date()) => federalHolidayList(now.getFullYear() - 1, now.getFullYear() + 3);
