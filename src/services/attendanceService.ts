import { AttendanceRecord, AttendanceSessionState } from '../types';

const ATTENDANCE_HISTORY_KEY = 'faskampen_attendance_history';
const ADMIN_PASSWORDS = ['admin123', 'admin', 'faskampen123', 'faskampen', '123456'];

/**
 * Returns current Date in Asia/Jakarta timezone.
 */
export function getJakartaDate(): Date {
  const now = new Date();
  const jakartaTimeString = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  return new Date(jakartaTimeString);
}

/**
 * Returns YYYY-MM-DD in Asia/Jakarta timezone.
 */
export function getJakartaDateString(): string {
  const jkt = getJakartaDate();
  const year = jkt.getFullYear();
  const month = String(jkt.getMonth() + 1).padStart(2, '0');
  const day = String(jkt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns formatted time in Asia/Jakarta timezone, e.g. "06.48 WIB"
 */
export function getJakartaTimeString(): string {
  const jkt = getJakartaDate();
  const hours = String(jkt.getHours()).padStart(2, '0');
  const minutes = String(jkt.getMinutes()).padStart(2, '0');
  return `${hours}.${minutes} WIB`;
}

/**
 * Detects default shift based on current Jakarta hour.
 * 06:00 - 17:59 -> Shift Pagi
 * 18:00 - 05:59 -> Shift Malam
 */
export function detectDefaultShift(): 'Pagi' | 'Malam' {
  const jkt = getJakartaDate();
  const hour = jkt.getHours();
  return hour >= 6 && hour < 18 ? 'Pagi' : 'Malam';
}

/**
 * Calculates standard attendance status based on shift and time.
 * - Shift Pagi: toleransi sampai 07:15 WIB.
 * - Shift Malam: toleransi sampai 19:15 WIB.
 */
export function calculateAttendanceStatus(shift: 'Pagi' | 'Malam'): 'Tepat Waktu' | 'Telat' {
  const jkt = getJakartaDate();
  const hour = jkt.getHours();
  const minute = jkt.getMinutes();
  const currentTotalMinutes = hour * 60 + minute;

  if (shift === 'Pagi') {
    // 07:15 WIB is threshold
    const thresholdMinutes = 7 * 60 + 15;
    return currentTotalMinutes <= thresholdMinutes ? 'Tepat Waktu' : 'Telat';
  } else {
    // Shift Malam: threshold is 19:15 WIB (1155 min)
    // If arriving earlier in the evening (e.g. 18:00 - 19:15) or around 19:00 -> Tepat Waktu
    const thresholdMinutes = 19 * 60 + 15;
    const nightStartMinutes = 17 * 60; // From 17:00 onwards
    if (currentTotalMinutes >= nightStartMinutes && currentTotalMinutes <= thresholdMinutes) {
      return 'Tepat Waktu';
    }
    // If arriving after 19:15
    if (currentTotalMinutes > thresholdMinutes) {
      return 'Telat';
    }
    return 'Tepat Waktu';
  }
}

/**
 * Workplace reference: Bandara Halim Perdanakusuma (Terminal & Area Operasional)
 * Coordinates based on operational airport map: -6.2657, 106.8906
 */
export const AIRPORT_BASE_COORDINATES = {
  latitude: -6.2657,
  longitude: 106.8906,
  name: 'Bandara Halim Perdanakusuma',
  maxRadiusMeters: 2500, // 2.5km operational radius covering terminal, hangars, and runway
};

/**
 * Calculates distance between two coordinates in meters using Haversine formula
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Validates GPS location against operational work area (Bandara Halim Perdanakusuma)
 */
export function validateWorkLocation(latitude: number, longitude: number, accuracy?: number): {
  isWithinRadius: boolean;
  distanceMeters: number;
  areaName: string;
  statusText: string;
} {
  const distance = calculateDistanceMeters(
    latitude,
    longitude,
    AIRPORT_BASE_COORDINATES.latitude,
    AIRPORT_BASE_COORDINATES.longitude
  );

  const radiusLimit = typeof window !== 'undefined' && localStorage.getItem('faskampen_airport_radius_meters')
    ? parseInt(localStorage.getItem('faskampen_airport_radius_meters') || '2500', 10)
    : AIRPORT_BASE_COORDINATES.maxRadiusMeters;

  const isWithinRadius = distance <= radiusLimit;
  const areaName = isWithinRadius
    ? 'Bandara Halim Perdanakusuma'
    : `Di Luar Radius Bandara (${(distance / 1000).toFixed(1)} km)`;
  const statusText = isWithinRadius
    ? 'Lokasi Valid & Terverifikasi di Bandara Halim Perdanakusuma'
    : 'Perhatian: Posisi berada di luar radius operasional Bandara Halim';

  return {
    isWithinRadius,
    distanceMeters: distance,
    areaName,
    statusText,
  };
}

/**
 * Generates WhatsApp format with photo verification & GPS location
 */
export function generateAttendanceWhatsAppText(data: {
  name: string;
  shift: 'Pagi' | 'Malam';
  time: string;
  status: 'Tepat Waktu' | 'Telat';
  locationStr?: string;
  hasPhoto?: boolean;
}): string {
  const lines = [
    `*PRESENSI MASUK TEKNISI PEMELIHARAAN*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `*Nama :* ${data.name}`,
    `*Shift :* ${data.shift}`,
    `*Waktu Absen :* ${data.time}`,
    `*Status :* ${data.status}`,
  ];

  if (data.locationStr) {
    lines.push(`*Lokasi GPS :* ${data.locationStr}`);
  }

  if (data.hasPhoto) {
    lines.push(`*Foto Absen :* Terlampir (Watermark Waktu & GPS Live)`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`_Dilaporkan via Sistem Monitoring Operasional Peralatan Bandara_`);
  return lines.join('\n');
}

/**
 * Normalizes technician name for storage key
 */
function normalizeKeyName(name: string): string {
  return (name || 'anonymous').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Gets the session key for today's technician attendance
 */
function getTodaySessionKey(techName: string, dateStr?: string): string {
  const date = dateStr || getJakartaDateString();
  return `faskampen_attendance_${date}_${normalizeKeyName(techName)}`;
}

/**
 * Retrieves today's attendance state for a given technician
 */
export function getTodayAttendanceState(techName: string, dateStr?: string): AttendanceSessionState {
  const date = dateStr || getJakartaDateString();
  const sessionKey = getTodaySessionKey(techName, date);

  try {
    // 1. Check direct session key
    const sessionRaw = localStorage.getItem(sessionKey);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      return {
        hasAttended: !!parsed.hasAttended,
        isBypassed: !!parsed.isBypassed,
        isOffDuty: !!parsed.isOffDuty,
        record: parsed.record,
      };
    }

    // 2. Check general admin bypass for today
    const generalBypass = sessionStorage.getItem(`faskampen_admin_bypass_${date}`);
    if (generalBypass === 'true') {
      return {
        hasAttended: false,
        isBypassed: true,
        isOffDuty: false,
      };
    }
  } catch (err) {
    console.error('Error reading attendance state:', err);
  }

  return {
    hasAttended: false,
    isBypassed: false,
    isOffDuty: false,
  };
}

/**
 * Saves a new attendance record locally and sends to server
 */
export function saveAttendanceRecord(record: AttendanceRecord): void {
  const date = record.attendance_date || getJakartaDateString();
  const sessionKey = getTodaySessionKey(record.technician_name, date);

  try {
    // 1. Save session indicator
    const sessionData: AttendanceSessionState = {
      hasAttended: true,
      isBypassed: false,
      isOffDuty: false,
      record,
    };
    localStorage.setItem(sessionKey, JSON.stringify(sessionData));

    // 2. Append to history list
    const historyRaw = localStorage.getItem(ATTENDANCE_HISTORY_KEY);
    const history: AttendanceRecord[] = historyRaw ? JSON.parse(historyRaw) : [];
    // Replace if same tech, date and attendance_type exists, otherwise prepend
    const recordType = record.attendance_type || 'masuk';
    const filtered = history.filter(
      (h) =>
        !(
          h.attendance_date === date &&
          h.technician_name.toLowerCase() === record.technician_name.toLowerCase() &&
          (h.attendance_type || 'masuk') === recordType
        )
    );
    filtered.unshift(record);
    localStorage.setItem(ATTENDANCE_HISTORY_KEY, JSON.stringify(filtered.slice(0, 100)));

    // 3. Asynchronously sync to backend endpoint
    fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    }).catch((err) => {
      console.warn('Could not sync attendance to backend:', err);
    });
  } catch (err) {
    console.error('Error saving attendance record:', err);
  }
}

export interface AttendanceBypassSkipParams {
  technician_name: string;
  technician_id?: number;
  shift: 'Pagi' | 'Malam';
  type: 'grace_period' | 'admin_override' | 'off_duty';
  reason?: string;
  notes?: string;
  authorized_by?: string;
  dateStr?: string;
}

/**
 * Logs bypass, grace period skip, or off-duty declaration into both
 * local storage and the persistent server database (/api/attendance),
 * ensuring audit trails and technical consistency even when schedules are undefined.
 */
export async function logAttendanceBypassOrSkip(
  params: AttendanceBypassSkipParams
): Promise<AttendanceRecord> {
  const dateStr = params.dateStr || getJakartaDateString();
  const timeStr = getJakartaTimeString();
  const recordId = `att-${params.type.replace('_', '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  let notes = params.notes;
  if (!notes) {
    if (params.type === 'admin_override') {
      notes = `[ADMIN OVERRIDE] Otorisasi: ${params.authorized_by || 'Supervisor'} | Alasan: ${params.reason || 'Bypass resmi oleh supervisor'}`;
    } else if (params.type === 'grace_period') {
      notes = `[GRACE PERIOD] Akses Masa Tenggang / Jadwal Belum Terbit | Alasan: ${params.reason || 'Transisi operasional darurat'}`;
    } else if (params.type === 'off_duty') {
      notes = `[OFF DUTY] Personel Lepas Piket | Akses: Pemantauan Dashboard Saja`;
    }
  }

  const record: AttendanceRecord = {
    id: recordId,
    technician_id: params.technician_id,
    technician_name: params.technician_name,
    shift: params.shift,
    attendance_date: dateStr,
    attendance_time: timeStr,
    status: 'Tepat Waktu',
    is_bypassed: params.type === 'admin_override' || params.type === 'grace_period',
    is_off_duty: params.type === 'off_duty',
    notes,
    created_at: new Date().toISOString(),
  };

  // 1. Save session indicator
  const sessionKey = getTodaySessionKey(params.technician_name, dateStr);
  const sessionData: AttendanceSessionState = {
    hasAttended: false,
    isBypassed: params.type === 'admin_override' || params.type === 'grace_period',
    isOffDuty: params.type === 'off_duty',
    record,
  };

  try {
    localStorage.setItem(sessionKey, JSON.stringify(sessionData));
    if (params.type === 'admin_override' || params.type === 'grace_period') {
      sessionStorage.setItem(`faskampen_admin_bypass_${dateStr}`, 'true');
    }
  } catch (err) {
    console.error('Error saving bypass session to localStorage:', err);
  }

  // 2. Append to history list
  try {
    const historyRaw = localStorage.getItem(ATTENDANCE_HISTORY_KEY);
    const history: AttendanceRecord[] = historyRaw ? JSON.parse(historyRaw) : [];
    const filtered = history.filter(
      (h) => !(h.attendance_date === dateStr && h.technician_name.toLowerCase() === params.technician_name.toLowerCase())
    );
    filtered.unshift(record);
    localStorage.setItem(ATTENDANCE_HISTORY_KEY, JSON.stringify(filtered.slice(0, 100)));
  } catch (err) {
    console.error('Error saving bypass record to history:', err);
  }

  // 3. Post to backend database endpoint (/api/attendance)
  try {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    const result = await res.json();
    if (result && result.record) {
      return result.record;
    }
  } catch (err) {
    console.warn('Could not sync bypass log to backend database:', err);
  }

  return record;
}

/**
 * Checks if current time is within standard shift transition grace period window (e.g. within 60 minutes of shift start)
 */
export function isWithinGracePeriodWindow(shift: 'Pagi' | 'Malam'): boolean {
  const jkt = getJakartaDate();
  const hour = jkt.getHours();
  const minute = jkt.getMinutes();
  const totalMinutes = hour * 60 + minute;

  if (shift === 'Pagi') {
    // 06:30 - 08:30 WIB is the standard grace window for Shift Pagi
    return totalMinutes >= 6 * 60 + 30 && totalMinutes <= 8 * 60 + 30;
  } else {
    // 18:30 - 20:30 WIB is the standard grace window for Shift Malam
    return totalMinutes >= 18 * 60 + 30 && totalMinutes <= 20 * 60 + 30;
  }
}

/**
 * Marks current user as Off-Duty for today (e.g. Reza who is just viewing dashboard)
 */
export function setSessionOffDuty(techName: string, dateStr?: string): void {
  const date = dateStr || getJakartaDateString();
  const sessionKey = getTodaySessionKey(techName, date);
  try {
    const sessionData: AttendanceSessionState = {
      hasAttended: false,
      isBypassed: false,
      isOffDuty: true,
    };
    localStorage.setItem(sessionKey, JSON.stringify(sessionData));
  } catch (err) {
    console.error('Error setting off-duty:', err);
  }
}

/**
 * Sets Admin / Supervisor bypass for today
 */
export function setSessionBypass(techName?: string, dateStr?: string): void {
  const date = dateStr || getJakartaDateString();
  try {
    sessionStorage.setItem(`faskampen_admin_bypass_${date}`, 'true');
    if (techName) {
      const sessionKey = getTodaySessionKey(techName, date);
      const sessionData: AttendanceSessionState = {
        hasAttended: false,
        isBypassed: true,
        isOffDuty: false,
      };
      localStorage.setItem(sessionKey, JSON.stringify(sessionData));
    }
  } catch (err) {
    console.error('Error setting bypass:', err);
  }
}

/**
 * Verifies supervisor / admin password for bypass
 */
export function verifyAdminPassword(password: string): boolean {
  if (!password) return false;
  const clean = password.trim().toLowerCase();
  return ADMIN_PASSWORDS.includes(clean);
}

/**
 * Verifies face liveness and anti-spoofing via server-side Gemini API
 */
export interface LivenessVerificationResult {
  isLive: boolean;
  confidence: number;
  rejectionReason: string;
  details?: string;
  detectedFace?: boolean;
}

export async function verifyFaceLiveness(
  imageDataUrl: string,
  technicianName?: string
): Promise<LivenessVerificationResult> {
  try {
    const response = await fetch('/api/attendance/verify-liveness', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageDataUrl,
        technician_name: technicianName || 'Teknisi',
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        isLive: false,
        confidence: 0,
        rejectionReason: errData.rejectionReason || errData.error || 'Gagal memverifikasi keaslian wajah teknisi.',
        details: errData.error,
      };
    }

    const data = await response.json();
    return {
      isLive: Boolean(data.isLive),
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.9,
      rejectionReason: data.rejectionReason || '',
      details: data.details,
      detectedFace: data.detectedFace !== undefined ? data.detectedFace : true,
    };
  } catch (error: any) {
    console.error('Error in verifyFaceLiveness:', error);
    // Network or client connection problem
    return {
      isLive: false,
      confidence: 0,
      rejectionReason: 'Gagal terhubung ke server verifikasi wajah. Periksa koneksi internet Anda.',
      details: error.message,
    };
  }
}

/**
 * Returns all saved attendance history
 */
export function getAllAttendanceHistory(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(ATTENDANCE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}
