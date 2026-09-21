/**
 * Calculates the ISO-8601 week number and ISO week-numbering year.
 * In ISO-8601:
 * - Weeks start on Monday (Day 1) and end on Sunday (Day 7).
 * - Week 1 of a year is the week containing the first Thursday of that year (or Jan 4).
 * - Correctly handles year boundary transitions (e.g. Dec 29-31 or Jan 1-3).
 */
export function getIsoWeekString(date: Date): string {
  // Target date copy to avoid mutation
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  
  // ISO day of week: Monday is 1, Sunday is 7
  const dayNr = (target.getUTCDay() + 6) % 7 + 1;
  
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's dayNr 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNr);
  
  // Get first day of year
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7 + 1;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDayNr);
  
  // Calculate full weeks to nearest Thursday
  const weekNo = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Generates a standard canonical period key for an operational date based on frequency ID.
 * - Freq 1 (Harian): YYYY-MM-DD
 * - Freq 2 (Mingguan): YYYY-Www (ISO-8601 Week)
 * - Freq 3 (Bulanan): YYYY-MM
 * - Freq 4 (Triwulan): YYYY-Q1 .. YYYY-Q4
 * - Freq 5 (Semesteran): YYYY-S1 .. YYYY-S2
 * - Freq 6 (Tahunan): YYYY
 */
export function getPeriodKey(frequencyId: number, dateStr: string): string {
  if (!dateStr) return '';
  
  // Default values
  let year = 2026;
  let month = 7; // August (0-indexed)
  let day = 6;
  
  const matches = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matches) {
    year = parseInt(matches[1], 10);
    month = parseInt(matches[2], 10) - 1;
    day = parseInt(matches[3], 10);
  } else {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear();
      month = d.getMonth();
      day = d.getDate();
    } else {
      return dateStr; // fallback
    }
  }
  
  const dateObj = new Date(year, month, day);
  const monthStr = String(month + 1).padStart(2, '0');
  
  switch (frequencyId) {
    case 1: // Harian: YYYY-MM-DD
      return `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
      
    case 2: // Mingguan: ISO-8601 Week YYYY-Www
      return getIsoWeekString(dateObj);
    
    case 3: // Bulanan: YYYY-MM
      return `${year}-${monthStr}`;
      
    case 4: { // Triwulan: YYYY-Q1 .. YYYY-Q4
      const q = Math.ceil((month + 1) / 3);
      return `${year}-Q${q}`;
    }
    
    case 5: { // Semesteran: YYYY-S1 .. YYYY-S2
      const s = month < 6 ? 1 : 2;
      return `${year}-S${s}`;
    }
    
    case 6: // Tahunan: YYYY
      return String(year);
      
    default:
      return dateStr;
  }
}
