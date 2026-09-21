import { getOperationalShift } from '../utils/technicianSchedule';

export interface OperationalContext {
  calendar_date: string;       // YYYY-MM-DD in Asia/Jakarta timezone
  operational_date: string;    // YYYY-MM-DD applying Midnight Rule
  shift: 'Pagi' | 'Malam';     // 'Pagi' | 'Malam'
  local_time: string;          // HH:mm format in WIB
}

/**
 * Returns a JS Date representing the current time.
 */
export function getJakartaNow(): Date {
  return new Date();
}

/**
 * Resolves full operational context for a given date in Asia/Jakarta context.
 * 
 * Shift Logic:
 * - 07:00 - 18:59 = Shift Pagi (PS), operationalDate = calendarDate
 * - 19:00 - 23:59 = Shift Malam (M), operationalDate = calendarDate
 * - 00:00 - 06:59 = Shift Malam (M), operationalDate = previous calendarDate
 */
export function resolveOperationalContext(dateInput?: Date | string | number): OperationalContext {
  const targetDate = dateInput ? new Date(dateInput) : getJakartaNow();
  
  // Format into Asia/Jakarta timezone components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(targetDate);
  const partMap: Record<string, string> = {};
  parts.forEach((p) => {
    if (p.type !== 'literal') {
      partMap[p.type] = p.value;
    }
  });

  const year = partMap.year;
  const month = partMap.month;
  const day = partMap.day;
  const hour = partMap.hour;
  const minute = partMap.minute;

  const calendar_date = `${year}-${month}-${day}`;
  const local_time = `${hour}:${minute}`;

  const shiftInfo = getOperationalShift(targetDate);

  return {
    calendar_date,
    operational_date: shiftInfo.operationalDate,
    shift: shiftInfo.shift as 'Pagi' | 'Malam',
    local_time,
  };
}
