import { normalizeShift } from './contextFilter';

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
  juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12'
};

/**
 * Checks if a string or date contains a spreadsheet base epoch artifact (e.g. 1899 or 1900).
 */
export function isSpreadsheetEpochArtifact(input?: string | null): boolean {
  if (!input) return false;
  const s = String(input);
  return s.includes('1899') || s.includes('1900') || s.includes('Dec 30') || s.includes('1899-12-30');
}

/**
 * Normalizes an operational date to canonical YYYY-MM-DD representation.
 * Always resolves calendar date in Asia/Jakarta context without UTC day-shifting.
 *
 * Examples:
 * - "2026-08-18" -> "2026-08-18"
 * - "Tue Aug 18 2026 00:00:00 GMT+0700 (Western Indonesia Time)" -> "2026-08-18"
 * - "18/08/2026" -> "2026-08-18"
 * - "2026-08-18T04:33:00.000Z" -> "2026-08-18"
 */
export function normalizeOperationalDate(input?: string | Date | null): string {
  if (!input) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  }

  if (input instanceof Date) {
    if (isNaN(input.getTime()) || input.getFullYear() < 2000) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    }
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(input);
  }

  const str = String(input).trim();
  if (!str) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  }

  // 1. Direct ISO Date pattern: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch && parseInt(isoMatch[1], 10) >= 2000) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 2. Localized format: DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (ddmmyyyyMatch && parseInt(ddmmyyyyMatch[3], 10) >= 2000) {
    const day = ddmmyyyyMatch[1].padStart(2, '0');
    const month = ddmmyyyyMatch[2].padStart(2, '0');
    const year = ddmmyyyyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 3. String like "Tue Aug 18 2026 00:00:00 GMT+0700..."
  const textDateMatch = str.match(/([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
  if (textDateMatch) {
    const monthKey = textDateMatch[1].toLowerCase();
    const monthNum = MONTH_MAP[monthKey];
    const day = textDateMatch[2].padStart(2, '0');
    const year = textDateMatch[3];
    if (monthNum && parseInt(year, 10) >= 2000) {
      return `${year}-${monthNum}-${day}`;
    }
  }

  // 4. Fallback: Parse via Date object with Jakarta timezone formatting
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(parsed);
  }

  // Fallback to today in Jakarta
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

/**
 * Extracts time components (HH:mm:ss) from various formats.
 */
export function extractTimeComponent(input?: string | Date | null): {
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
} {
  if (!input) {
    const now = new Date();
    return {
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: now.getSeconds(),
      formatted: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`,
    };
  }

  if (input instanceof Date) {
    const h = input.getHours();
    const m = input.getMinutes();
    const s = input.getSeconds();
    return {
      hours: h,
      minutes: m,
      seconds: s,
      formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    };
  }

  const str = String(input).trim();

  // Look for HH:mm:ss or HH:mm or HH.mm pattern
  const timeMatch = str.match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/);
  if (timeMatch) {
    const h = Math.min(23, Math.max(0, parseInt(timeMatch[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(timeMatch[2], 10)));
    const s = timeMatch[3] ? Math.min(59, Math.max(0, parseInt(timeMatch[3], 10))) : 0;
    return {
      hours: h,
      minutes: m,
      seconds: s,
      formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    };
  }

  const now = new Date();
  return {
    hours: now.getHours(),
    minutes: now.getMinutes(),
    seconds: 0,
    formatted: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`,
  };
}

/**
 * Normalizes submitted_at to a canonical ISO-8601 moment-in-time timestamp (UTC+07:00).
 * Resolves spreadsheet epoch artifacts (1899/1900) by binding time to the operational date.
 *
 * Shift Rules:
 * - Shift Pagi (PS, 07:00 - 18:59) -> Calendar date = operationalDate
 * - Shift Malam (M, 19:00 - 23:59) -> Calendar date = operationalDate
 * - Shift Malam (M, 00:00 - 06:59) -> Calendar date = operationalDate + 1 day (next calendar day)
 */
export function normalizeSubmittedDateTime(
  submittedInput?: string | Date | null,
  operationalDateInput?: string | Date | null,
  shiftStr?: string
): string {
  const cleanOpDate = normalizeOperationalDate(operationalDateInput);
  const timeComp = extractTimeComponent(submittedInput);
  const normShift = normalizeShift(shiftStr);

  const [opYear, opMonth, opDay] = cleanOpDate.split('-').map((n) => parseInt(n, 10));

  let calendarYear = opYear;
  let calendarMonth = opMonth;
  let calendarDay = opDay;

  // If Shift Malam and submission was between 00:00 and 06:59:59, submission is on next day
  if (normShift === 'Malam' && timeComp.hours < 7) {
    const nextDayUtc = new Date(Date.UTC(opYear, opMonth - 1, opDay + 1));
    calendarYear = nextDayUtc.getUTCFullYear();
    calendarMonth = nextDayUtc.getUTCMonth() + 1;
    calendarDay = nextDayUtc.getUTCDate();
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const calDateStr = `${calendarYear}-${pad(calendarMonth)}-${pad(calendarDay)}`;

  return `${calDateStr}T${timeComp.formatted}+07:00`;
}

/**
 * Normalizes created_at / updated_at historical timestamps.
 * Preserves existing valid ISO timestamps (year >= 2020).
 * Reconstructs from operational date if invalid or infected with 1899/1900 spreadsheet artifact.
 */
export function normalizeHistoricalTimestamp(
  timestampInput?: string | Date | null,
  fallbackOperationalDate?: string | Date | null,
  fallbackShift?: string
): string {
  if (!timestampInput) {
    return normalizeSubmittedDateTime(null, fallbackOperationalDate, fallbackShift);
  }

  if (isSpreadsheetEpochArtifact(String(timestampInput))) {
    return normalizeSubmittedDateTime(timestampInput, fallbackOperationalDate, fallbackShift);
  }

  if (timestampInput instanceof Date) {
    if (isNaN(timestampInput.getTime()) || timestampInput.getFullYear() < 2020) {
      return normalizeSubmittedDateTime(timestampInput, fallbackOperationalDate, fallbackShift);
    }
    return timestampInput.toISOString();
  }

  const str = String(timestampInput).trim();

  // If already full ISO-8601 with year >= 2020 (e.g. 2026-08-18T...)
  const isoMatch = str.match(/^(\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch && parseInt(isoMatch[1], 10) >= 2020) {
    return str;
  }

  // Attempt standard Date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) {
    return parsed.toISOString();
  }

  return normalizeSubmittedDateTime(str, fallbackOperationalDate, fallbackShift);
}
