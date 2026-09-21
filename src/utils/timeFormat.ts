/**
 * Standard Time & Date Presentation Utilities for NTI Preventive/Corrective System.
 * Ensures clean, concise, and consistent formatting across reports, exports, tables, and UI cards.
 *
 * Examples:
 * - Date: "10 Agustus 2026" or "Senin, 10 Agustus 2026"
 * - Single Time: "21.30 WIB"
 * - Time Range: "21.30 - 23.15 WIB"
 * - Date + Time: "10 Agustus 2026, 21.30 WIB"
 */

const MONTHS_INDONESIAN_FULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const MONTHS_INDONESIAN_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
];

const DAYS_INDONESIAN = [
  'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'
];

/**
 * Formats a date string (e.g. "2026-08-10" or ISO string) to concise Indonesian date ("10 Agustus 2026").
 */
export function formatIndonesianDate(
  dateStr?: string,
  options: { includeDayName?: boolean; shortMonth?: boolean } = {}
): string {
  if (!dateStr || dateStr.trim() === '') return '-';

  const cleanStr = dateStr.trim();

  // If already formatted like "10 Agustus 2026" or "Senin, 10 Agustus 2026"
  if (/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(cleanStr)) {
    return cleanStr;
  }

  let dateObj: Date | null = null;

  if (/^\d{4}-\d{2}-\d{2}/.test(cleanStr)) {
    const parts = cleanStr.split('T')[0].split(' ')[0].split('-');
    if (parts.length === 3) {
      dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    dateObj = new Date(cleanStr);
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    return cleanStr; // fallback to original if unparseable
  }

  const dayNum = String(dateObj.getDate()).padStart(2, '0');
  const monthList = options.shortMonth ? MONTHS_INDONESIAN_SHORT : MONTHS_INDONESIAN_FULL;
  const monthName = monthList[dateObj.getMonth()];
  const yearNum = dateObj.getFullYear();

  if (options.includeDayName) {
    const dayName = DAYS_INDONESIAN[dateObj.getDay()];
    return `${dayName}, ${dayNum} ${monthName} ${yearNum}`;
  }

  return `${dayNum} ${monthName} ${yearNum}`;
}

/**
 * Normalizes a time string or ISO timestamp (e.g. "2026-09-21T08:27:00Z", "15:30:00", "15:30", "15.30") to "15.30 WIB".
 */
export function formatTimeShort(timeStr?: string, withWibSuffix: boolean = true): string {
  if (!timeStr || timeStr.trim() === '') return '-';

  let clean = timeStr.trim().replace('WIB', '').replace('wib', '').trim();

  // If this is an ISO timestamp with full date or timezone (e.g. 2026-09-21T08:27:00Z, 2026-09-21 08:27:00+00)
  if (clean.includes('T') || (clean.includes('-') && (clean.includes(':') || clean.includes('Z')))) {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      try {
        const formatter = new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const parts = formatter.formatToParts(d);
        const hour = parts.find((p) => p.type === 'hour')?.value.padStart(2, '0') || '00';
        const minute = parts.find((p) => p.type === 'minute')?.value.padStart(2, '0') || '00';
        const formatted = `${hour}.${minute}`;
        return withWibSuffix ? `${formatted} WIB` : formatted;
      } catch {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const formatted = `${hh}.${mm}`;
        return withWibSuffix ? `${formatted} WIB` : formatted;
      }
    }
  }

  // Extract HH:mm or HH.mm from string
  const timeMatch = clean.match(/(\d{1,2})[:.](\d{2})/);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0');
    const mm = timeMatch[2];
    clean = `${hh}.${mm}`;
  } else {
    // If only number like "21"
    const num = parseInt(clean, 10);
    if (!isNaN(num)) {
      clean = `${String(num).padStart(2, '0')}.00`;
    }
  }

  return withWibSuffix ? `${clean} WIB` : clean;
}

/**
 * Formats start and end times into concise time range: "21.30 - 23.15 WIB".
 */
export function formatTimeRange(startTime?: string, endTime?: string): string {
  const sTime = formatTimeShort(startTime, false);
  const eTime = formatTimeShort(endTime, false);

  if (sTime === '-' && eTime === '-') return '-';
  if (sTime !== '-' && (eTime === '-' || eTime === sTime)) {
    return `${sTime} WIB`;
  }
  return `${sTime} - ${eTime} WIB`;
}

/**
 * Formats a full date-time string (e.g. "2026-08-10T08:27:00Z" or "2026-08-10 21:30:00") to "10 Agustus 2026, 21.30 WIB".
 */
export function formatDateTimeShort(dateTimeStr?: string): string {
  if (!dateTimeStr || dateTimeStr.trim() === '') return '-';

  const clean = dateTimeStr.trim();
  const dateFormatted = formatIndonesianDate(clean, { shortMonth: false });
  const timeFormatted = formatTimeShort(clean, true);

  if (dateFormatted !== '-' && timeFormatted !== '-') {
    return `${dateFormatted}, ${timeFormatted}`;
  }
  if (dateFormatted !== '-') return dateFormatted;
  return clean;
}
