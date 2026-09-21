import { Equipment, PreventiveEntry, CorrectiveReport, ShiftType, Location, EquipmentType } from '../types';
import { formatIndonesianDate, formatTimeShort } from '../utils/timeFormat';
import { isDummyOrRemovedTechnician } from '../utils/entityLookup';

/**
 * Escapes characters that have special meaning in Telegram HTML parser:
 * & -> &amp;
 * < -> &lt;
 * > -> &gt;
 */
export function escapeTgHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface TelegramSubscriber {
  chat_id: string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  name: string;
  username?: string;
  first_seen: string;
  last_active: string;
  last_message?: string;
  is_active: boolean;
  notes?: string;
}

export interface TelegramConfig {
  bot_token?: string;
  chat_id: string;
  broadcast_to_all_subscribers: boolean;
  auto_notify_preventive?: boolean;
  auto_notify_corrective: boolean;
  auto_notify_attendance?: boolean;
  auto_notify_recurring_fault: boolean;
  enable_bot: boolean;
}

const STORAGE_KEY = 'faskampen_telegram_config';

/**
 * Default Telegram settings
 */
export function getStoredTelegramConfig(): TelegramConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        broadcast_to_all_subscribers: true,
        auto_notify_preventive: true,
        auto_notify_attendance: true,
        auto_notify_corrective: true,
        auto_notify_recurring_fault: true,
        enable_bot: true,
        ...parsed,
        chat_id: parsed.chat_id || '-5531204015',
      };
    }
  } catch (_) {}

  return {
    bot_token: '',
    chat_id: '-5531204015',
    broadcast_to_all_subscribers: true,
    auto_notify_preventive: true,
    auto_notify_corrective: true,
    auto_notify_attendance: true,
    auto_notify_recurring_fault: true,
    enable_bot: true,
  };
}

/**
 * Save Telegram settings to local storage and sync with server
 */
export function saveTelegramConfig(config: TelegramConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    // Asynchronously update server token and all automation settings to server JSON file
    saveServerTelegramToken({
      token: config.bot_token,
      chat_id: config.chat_id,
      broadcast_to_all_subscribers: config.broadcast_to_all_subscribers,
      auto_notify_corrective: config.auto_notify_corrective,
      auto_notify_recurring_fault: config.auto_notify_recurring_fault,
    }).catch(() => {});
  } catch (err) {
    console.error('Failed to save Telegram config:', err);
  }
}

/**
 * Save Telegram Bot Token, Chat ID, and automation toggles to server background configuration file
 */
export async function saveServerTelegramToken(params: {
  token?: string;
  chat_id?: string;
  broadcast_to_all_subscribers?: boolean;
  auto_notify_corrective?: boolean;
  auto_notify_recurring_fault?: boolean;
}): Promise<{ success: boolean; config?: any; error?: string }> {
  try {
    const res = await fetch('/api/telegram/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Debounce timer & fingerprint cache for syncing operational state
let operationalStateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncedOperationalFingerprint: string | null = null;
let pendingOperationalResolvers: Array<(val: { success: boolean; skipped?: boolean }) => void> = [];

/**
 * Computes a deterministic fingerprint representing the critical operational state
 * to identify whether meaningful changes occurred before triggering network requests.
 */
function getOperationalStateFingerprint(params: {
  operationalDate?: string;
  shift?: string;
  technicianNames?: string[];
  equipments?: Equipment[];
  correctiveReports?: CorrectiveReport[];
}): string {
  const date = params.operationalDate || '';
  const shift = params.shift || '';
  const techs = (params.technicianNames || []).slice().sort().join(',');
  const eqSummary = (params.equipments || [])
    .map((e) => `${e.id}:${(e as any).status || ''}:${(e as any).is_active ?? ''}`)
    .join(';');
  const crSummary = (params.correctiveReports || [])
    .map((c) => `${c.id}:${c.result || ''}:${c.updated_at || c.created_at || ''}`)
    .join(';');
  return `${date}|${shift}|${techs}|${eqSummary}|${crSummary}`;
}

async function executeSyncOperationalState(
  params: {
    operationalDate?: string;
    shift?: string;
    technicianNames?: string[];
    equipments?: Equipment[];
    correctiveReports?: CorrectiveReport[];
  },
  fingerprint: string
): Promise<{ success: boolean; skipped?: boolean }> {
  try {
    const res = await fetch('/api/telegram/operational-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (json?.success) {
      lastSyncedOperationalFingerprint = fingerprint;
    }
    return json;
  } catch (err) {
    return { success: false };
  }
}

/**
 * Sync live operational state (equipments, active corrective reports, shift, technician)
 * so bot commands (/alat, /brief) always have current real-time data.
 *
 * Refactored with trailing debounce (1200ms) and signature comparison to eliminate
 * redundant API calls and only push to Telegram backend when finalized state has meaningful changes.
 */
export async function syncOperationalStateToServer(
  params: {
    operationalDate?: string;
    shift?: string;
    technicianNames?: string[];
    equipments?: Equipment[];
    correctiveReports?: CorrectiveReport[];
  },
  options?: { immediate?: boolean; debounceMs?: number }
): Promise<{ success: boolean; skipped?: boolean }> {
  const currentFingerprint = getOperationalStateFingerprint(params);

  // If identical to what was already successfully synced, skip network call completely
  if (currentFingerprint === lastSyncedOperationalFingerprint) {
    return { success: true, skipped: true };
  }

  // If immediate requested, flush without waiting
  if (options?.immediate) {
    if (operationalStateDebounceTimer) {
      clearTimeout(operationalStateDebounceTimer);
      operationalStateDebounceTimer = null;
    }
    return executeSyncOperationalState(params, currentFingerprint);
  }

  // Otherwise, debounce rapid subsequent updates (default 1200ms)
  return new Promise((resolve) => {
    pendingOperationalResolvers.push(resolve);

    if (operationalStateDebounceTimer) {
      clearTimeout(operationalStateDebounceTimer);
    }

    const delay = options?.debounceMs ?? 1200;
    operationalStateDebounceTimer = setTimeout(async () => {
      operationalStateDebounceTimer = null;
      const result = await executeSyncOperationalState(params, currentFingerprint);
      const resolvers = pendingOperationalResolvers;
      pendingOperationalResolvers = [];
      resolvers.forEach((r) => r(result));
    }, delay);
  });
}

/**
 * Check Bot Status from server or custom token
 */
export async function checkTelegramBotStatus(customToken?: string): Promise<{
  configured: boolean;
  bot_id?: number;
  bot_name?: string;
  bot_username?: string;
  defaultChatId?: string;
  serverConfig?: {
    chat_id?: string;
    broadcast_to_all_subscribers?: boolean;
    auto_notify_corrective?: boolean;
    auto_notify_recurring_fault?: boolean;
  };
  error?: string;
}> {
  try {
    const url = customToken
      ? `/api/telegram/status?token=${encodeURIComponent(customToken)}`
      : '/api/telegram/status';
    const res = await fetch(url);
    return await res.json();
  } catch (err: any) {
    return {
      configured: false,
      error: err.message || 'Gagal menghubungi server API Telegram',
    };
  }
}

/**
 * Send test message to Telegram
 */
export async function testTelegramBotConnection(
  token?: string,
  chatId?: string
): Promise<{ success: boolean; bot?: any; message?: string; error?: string }> {
  try {
    if (token) {
      saveServerTelegramToken({ token, chat_id: chatId }).catch(() => {});
    }
    const res = await fetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token || undefined,
        chat_id: chatId || undefined,
      }),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Koneksi ke server gagal',
    };
  }
}

/**
 * Fetch all registered Telegram subscribers
 */
export async function fetchTelegramSubscribers(): Promise<{
  success: boolean;
  subscribers: TelegramSubscriber[];
  total: number;
  activeCount: number;
  error?: string;
}> {
  try {
    const res = await fetch('/api/telegram/subscribers');
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      subscribers: [],
      total: 0,
      activeCount: 0,
      error: err.message || 'Gagal memuat subscriber',
    };
  }
}

/**
 * Trigger sync with Telegram getUpdates to auto-detect new users/groups who pressed /start
 */
export async function syncTelegramUpdates(token?: string): Promise<{
  success: boolean;
  newDetectedCount: number;
  totalSubscribers: number;
  subscribers: TelegramSubscriber[];
  message: string;
  error?: string;
}> {
  try {
    const config = getStoredTelegramConfig();
    const effectiveToken = token || config.bot_token || undefined;
    const res = await fetch('/api/telegram/sync-updates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: effectiveToken }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        newDetectedCount: 0,
        totalSubscribers: 0,
        subscribers: [],
        message: '',
        error: errData.error || errData.message || `HTTP ${res.status}: Gagal sinkronisasi`,
      };
    }
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      newDetectedCount: 0,
      totalSubscribers: 0,
      subscribers: [],
      message: '',
      error: err.message || 'Gagal sinkronisasi pembaruan',
    };
  }
}

/**
 * Add or update subscriber
 */
export async function updateTelegramSubscriber(
  subscriber: Partial<TelegramSubscriber> & { chat_id: string }
): Promise<{ success: boolean; subscribers: TelegramSubscriber[]; error?: string }> {
  try {
    const res = await fetch('/api/telegram/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscriber),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      subscribers: [],
      error: err.message || 'Gagal memperbarui subscriber',
    };
  }
}

/**
 * Remove a subscriber
 */
export async function deleteTelegramSubscriber(
  chatId: string
): Promise<{ success: boolean; subscribers: TelegramSubscriber[]; error?: string }> {
  try {
    const res = await fetch(`/api/telegram/subscribers/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      subscribers: [],
      error: err.message || 'Gagal menghapus subscriber',
    };
  }
}

/**
 * Configure Telegram Webhook
 */
export async function setTelegramWebhook(
  webhookUrl: string,
  token?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const config = getStoredTelegramConfig();
    const effectiveToken = token || config.bot_token || undefined;
    const res = await fetch('/api/telegram/set-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_url: webhookUrl,
        token: effectiveToken,
      }),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Gagal mengatur webhook Telegram',
    };
  }
}

/**
 * Send photo (with caption) via Telegram Bot API (supports single recipient or broadcast)
 */
export async function sendTelegramPhoto(params: {
  photo: string;
  caption?: string;
  chatId?: string;
  token?: string;
  parseMode?: 'HTML' | 'Markdown';
  broadcastAll?: boolean;
}): Promise<{
  success: boolean;
  messageId?: number;
  broadcast?: boolean;
  sentCount?: number;
  totalTargets?: number;
  error?: string;
}> {
  try {
    const config = getStoredTelegramConfig();
    const effectiveToken = params.token || config.bot_token || undefined;
    const effectiveChatId = params.chatId || config.chat_id || undefined;
    const shouldBroadcast =
      params.broadcastAll !== undefined
        ? params.broadcastAll
        : config.broadcast_to_all_subscribers;

    const res = await fetch('/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photo: params.photo,
        caption: params.caption,
        message: params.caption,
        chat_id: effectiveChatId,
        token: effectiveToken,
        broadcast_all: shouldBroadcast,
        parse_mode: params.parseMode || 'HTML',
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Gagal mengirim foto presensi ke Telegram',
      };
    }

    return {
      success: true,
      messageId: data.messageId,
      broadcast: data.broadcast,
      sentCount: data.sentCount,
      totalTargets: data.totalTargets,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Gagal menghubungi server Telegram',
    };
  }
}

/**
 * Send message via Telegram Bot API (supports single recipient or broadcast)
 */
export async function sendTelegramMessage(params: {
  message: string;
  chatId?: string;
  token?: string;
  parseMode?: 'HTML' | 'Markdown';
  broadcastAll?: boolean;
}): Promise<{
  success: boolean;
  messageId?: number;
  broadcast?: boolean;
  sentCount?: number;
  totalTargets?: number;
  error?: string;
}> {
  try {
    const config = getStoredTelegramConfig();
    const effectiveToken = params.token || config.bot_token || undefined;
    const effectiveChatId = params.chatId || config.chat_id || undefined;
    const shouldBroadcast =
      params.broadcastAll !== undefined
        ? params.broadcastAll
        : config.broadcast_to_all_subscribers;

    const res = await fetch('/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.message,
        chat_id: effectiveChatId,
        token: effectiveToken,
        broadcast_all: shouldBroadcast,
        parse_mode: params.parseMode || 'HTML',
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Gagal mengirim pesan ke Telegram',
      };
    }

    return {
      success: true,
      messageId: data.messageId,
      broadcast: data.broadcast,
      sentCount: data.sentCount,
      totalTargets: data.totalTargets,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Terjadi kesalahan jaringan saat mengirim ke Telegram',
    };
  }
}

/**
 * Generate Telegram Direct Share Link (Deep Link fallback)
 */
export function getTelegramShareUrl(plainText: string): string {
  return `https://t.me/share/url?url=&text=${encodeURIComponent(plainText)}`;
}

/**
 * Convert HTML formatted Telegram message to clean plain text for fallback sharing
 */
export function convertHtmlToPlainText(html: string): string {
  return html
    .replace(/<b>(.*?)<\/b>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '_$1_')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre>(.*?)<\/pre>/gi, '```\n$1\n```')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

/**
 * Format Daily Briefing for Telegram (HTML)
 */
export function formatDailyBriefTelegramHtml(params: {
  operationalDate: string;
  shift: ShiftType | string;
  technicianNames: string[];
  equipments: Equipment[];
  preventiveEntries: PreventiveEntry[];
  correctiveReports: CorrectiveReport[];
}): string {
  const {
    operationalDate,
    shift,
    technicianNames,
    equipments,
    preventiveEntries,
    correctiveReports,
  } = params;

  const safeTechNames = (technicianNames || [])
    .filter((name) => !isDummyOrRemovedTechnician(name))
    .map((name) => escapeTgHtml(name));

  const dateFormatted = escapeTgHtml(formatIndonesianDate(operationalDate, { includeDayName: true }));
  const shiftUpper = escapeTgHtml((shift || 'Pagi').toUpperCase());

  const totalUnits = equipments.length;
  const inspectedEqIds = new Set(
    preventiveEntries
      .filter((e) => e.operational_date === operationalDate && e.shift === shift)
      .map((e) => Number(e.equipment_id))
  );

  const inspectedCount = inspectedEqIds.size;
  const completionRate = totalUnits > 0 ? Math.round((inspectedCount / totalUnits) * 100) : 0;
  const pendingUnits = equipments.filter((eq) => !inspectedEqIds.has(eq.id));

  const activeCorrectives = correctiveReports.filter(
    (c) =>
      (c.corrective_date === operationalDate || (c as any).operational_date === operationalDate) &&
      c.result !== 'Resolved'
  );
  const resolvedCorrectives = correctiveReports.filter(
    (c) =>
      (c.corrective_date === operationalDate || (c as any).operational_date === operationalDate) &&
      c.result === 'Resolved'
  );

  let msg = `🛫 <b>DAILY OPERATIONAL BRIEFING</b>\n`;
  msg += `<i>Operasional Pemeliharaan Peralatan</i>\n\n`;

  msg += `📅 <b>Tanggal:</b> ${dateFormatted}\n`;
  msg += `⏰ <b>Shift Kerja:</b> ${shiftUpper}\n`;
  msg += `👷 <b>Personel Jaga:</b> ${safeTechNames.length > 0 ? safeTechNames.join(', ') : '-'}\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 <b>STATUS KESIAPAN ALAT (READINESS)</b>\n`;
  msg += `• Total Peralatan: <b>${totalUnits} Unit</b>\n`;
  msg += `• Selesai Inspeksi: <b>${inspectedCount} / ${totalUnits} (${completionRate}%)</b>\n`;
  msg += `• Gangguan Aktif: <b>${activeCorrectives.length} Unit</b>\n`;
  msg += `• Gangguan Terselesaikan: <b>${resolvedCorrectives.length} Unit</b>\n\n`;

  if (activeCorrectives.length > 0) {
    msg += `🚨 <b>PERALATAN DALAM PENANGANAN (DOWNTIME / TROUBLE):</b>\n`;
    activeCorrectives.forEach((c, idx) => {
      const eq = equipments.find((e) => e.id === Number(c.equipment_id));
      const eqName = escapeTgHtml(eq ? eq.name : `ID #${c.equipment_id}`);
      const code = escapeTgHtml(c.corrective_code || 'CR-NEW');
      const desc = escapeTgHtml(c.problem_description || '-');
      const action = escapeTgHtml(c.action_taken || 'Sedang dikerjakan');
      const stat = escapeTgHtml(c.result || (c as any).status || 'Proses');
      msg += `  ${idx + 1}. <b>${eqName}</b> (${code})\n`;
      msg += `     ⚠️ <i>Kendala:</i> ${desc}\n`;
      msg += `     🛠️ <i>Tindakan:</i> ${action}\n`;
      msg += `     ⏳ <i>Status:</i> <code>${stat}</code>\n`;
    });
    msg += `\n`;
  } else {
    msg += `✅ <b>Semua Unit Beroperasi Normal / Nihil Gangguan Kritis</b>\n\n`;
  }

  if (pendingUnits.length > 0 && pendingUnits.length <= 10) {
    msg += `⏳ <b>Unit Belum Diinspeksi Shift Ini:</b>\n`;
    pendingUnits.forEach((u) => {
      msg += `  • ${escapeTgHtml(u.name)} (Lokasi ID: ${u.location_id})\n`;
    });
    msg += `\n`;
  } else if (pendingUnits.length > 10) {
    msg += `⏳ <b>Belum Diinspeksi:</b> ${pendingUnits.length} unit peralatan dalam antrian.\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 <i>Dikirim otomatis via Sistem Pemeliharaan Bandara</i>`;

  return msg;
}

/**
 * Format Corrective Alert for Telegram (HTML)
 */
export function formatCorrectiveTelegramHtml(params: {
  report: Omit<Partial<CorrectiveReport>, 'shift'> & {
    shift?: ShiftType | string;
    operational_date?: string;
    status?: string;
    time_start?: string;
    time_end?: string;
  };
  equipment?: Equipment;
  technicianNames?: string[];
  isNew?: boolean;
}): string {
  const { report, equipment, technicianNames, isNew = true } = params;

  const safeTechs = (technicianNames || [])
    .filter((name) => !isDummyOrRemovedTechnician(name))
    .map((name) => escapeTgHtml(name));

  const code = escapeTgHtml(report.corrective_code || 'LAPORAN BARU');
  const eqName = escapeTgHtml(equipment?.name || `Equipment #${report.equipment_id}`);
  const brand = equipment?.brand ? ` (${escapeTgHtml(equipment.brand)})` : '';
  const location = equipment?.location_id ? ` • Lokasi ID: ${equipment.location_id}` : '';
  const dateStr = escapeTgHtml(formatIndonesianDate(report.corrective_date || report.operational_date || ''));
  const startTime = report.start_time || report.time_start;
  const endTime = report.end_time || report.time_end;
  const timeRange = startTime && endTime ? `${escapeTgHtml(formatTimeShort(startTime))} - ${escapeTgHtml(formatTimeShort(endTime))}` : '-';
  const techs = safeTechs.length > 0 ? safeTechs.join(', ') : 'Tim Teknisi Jaga';
  const finalStatus = escapeTgHtml(report.result || report.status || 'Resolved');

  let msg = isNew ? `🚨 <b>LAPORAN KERUSAKAN BARU (CORRECTIVE)</b>\n` : `🛠️ <b>PEMBARUAN LAPORAN PERBAIKAN</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏷️ <b>Kode Laporan:</b> <code>${code}</code>\n`;
  msg += `🖥️ <b>Peralatan:</b> <b>${eqName}</b>${brand}${location}\n`;
  msg += `📅 <b>Tanggal & Shift:</b> ${dateStr} (Shift ${escapeTgHtml(report.shift || 'Pagi')})\n`;
  msg += `⏰ <b>Waktu Pengerjaan:</b> ${timeRange}\n`;
  msg += `👷 <b>Teknisi:</b> ${techs}\n\n`;

  msg += `⚠️ <b>Uraian Kerusakan:</b>\n`;
  msg += `<i>${escapeTgHtml(report.problem_description || '-')}</i>\n\n`;

  msg += `🔧 <b>Tindakan Perbaikan:</b>\n`;
  msg += `<i>${escapeTgHtml(report.action_taken || 'Dalam proses pengerjaan')}</i>\n\n`;

  const statusEmoji = (report.result || report.status) === 'Resolved' ? '✅' : '⏳';
  msg += `📌 <b>Status Akhir:</b> ${statusEmoji} <b>${finalStatus}</b>\n`;

  if (report.notes) {
    msg += `📝 <b>Catatan Tambahan:</b> ${escapeTgHtml(report.notes)}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 <i>Notifikasi Sistem Operasional Bandara</i>`;

  return msg;
}

/**
 * Format Recurring Fault Alert for Telegram (HTML)
 */
export function formatRecurringFaultTelegramHtml(params: {
  equipmentName: string;
  faultKeyword: string;
  occurrencesCount: number;
  days: number;
  recommendation: string;
}): string {
  const { equipmentName, faultKeyword, occurrencesCount, days, recommendation } = params;

  let msg = `⚠️ <b>PERINGATAN KERUSAKAN BERULANG (RECURRING FAULT)</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🖥️ <b>Mesin:</b> <b>${escapeTgHtml(equipmentName)}</b>\n`;
  msg += `🔥 <b>Pola Kerusakan:</b> <code>${escapeTgHtml(faultKeyword)}</code>\n`;
  msg += `📈 <b>Frekuensi:</b> Terdeteksi <b>${occurrencesCount} kali</b> dalam kurun <b>${days} hari terakhir</b>\n\n`;

  msg += `📋 <b>Rekomendasi Tindakan Teknis:</b>\n`;
  msg += `<i>${escapeTgHtml(recommendation)}</i>\n\n`;

  msg += `💡 <i>Disarankan untuk melakukan inspeksi mendalam (Overhaul/Calibration) atau penggantian modul terkait guna mencegah unserviceable berulang saat jam operasional penerbangan.</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 <i>Sistem Otomatis Pemantauan Keandalan Peralatan</i>`;

  return msg;
}

/**
 * Format Preventive Maintenance Alert for Telegram (HTML)
 */
export function formatPreventiveTelegramHtml(params: {
  entry: PreventiveEntry;
  equipment?: Equipment;
  equipmentType?: EquipmentType;
  location?: Location;
  technicianNames: string[];
}): string {
  const { entry, equipment, equipmentType, location, technicianNames } = params;

  const safeTechs = (technicianNames || [])
    .filter((name) => !isDummyOrRemovedTechnician(name))
    .map((name) => escapeTgHtml(name));

  const eqName = escapeTgHtml(equipment?.name || `Unit #${entry.equipment_id}`);
  const eqCode = equipment?.equipment_code ? ` (${escapeTgHtml(equipment.equipment_code)})` : '';
  const typeName = escapeTgHtml(equipmentType?.name || equipment?.type || 'Peralatan');
  const locName = escapeTgHtml(location?.name || 'Area Bandara');
  const dateStr = escapeTgHtml(formatIndonesianDate(entry.operational_date || ''));
  const shiftStr = escapeTgHtml(entry.shift === 'Malam' ? 'Malam' : 'Pagi');
  const statusIcon = entry.status === 'OK' ? '✅' : '⚠️';
  const techList = safeTechs.length > 0 ? safeTechs.join(', ') : 'Tim Teknisi Jaga';

  let msg = `📋 <b>LAPORAN PREVENTIVE MAINTENANCE SELESAI</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🖥️ <b>Peralatan:</b> <b>${eqName}</b>${eqCode}\n`;
  msg += `⚙️ <b>Kategori:</b> ${typeName}\n`;
  msg += `📍 <b>Lokasi:</b> ${locName}\n`;
  msg += `📅 <b>Tanggal & Shift:</b> ${dateStr} (Shift ${shiftStr})\n`;
  msg += `👷 <b>Teknisi Pelaksana:</b> ${techList}\n`;
  msg += `📌 <b>Status Hasil:</b> ${statusIcon} <b>${escapeTgHtml(entry.status || 'OK')}</b>\n\n`;

  // Checklist counts
  if (entry.checklist_results && entry.checklist_results.length > 0) {
    const totalItems = entry.checklist_results.length;
    const okItems = entry.checklist_results.filter((c) => {
      const s = String(c.status || '').trim().toUpperCase();
      return (
        s === 'OK' ||
        s === 'BAIK' ||
        s === 'NORMAL' ||
        s === 'SESUAI' ||
        s === 'BERSIH' ||
        s === 'BERFUNGSI' ||
        s === 'PASS' ||
        s === 'TRUE' ||
        s === 'YA'
      );
    }).length;
    const ngItems = totalItems - okItems;
    msg += `📊 <b>Hasil Poin Cek:</b> ${okItems}/${totalItems} Poin OK`;
    if (ngItems > 0) {
      msg += ` (⚠️ ${ngItems} Temuan)`;
    }
    msg += `\n`;
  }

  // Measurements if any
  if (entry.measurements && entry.measurements.length > 0) {
    msg += `⚡ <b>Parameter Pengukuran:</b>\n`;
    entry.measurements.forEach((m) => {
      msg += `  • Gen ${escapeTgHtml(m.generator)}: +${m.positive_high_voltage} kV / ${m.negative_high_voltage} kV | Htr: ${m.heater_current} mA | And: ${m.anode_current} mA\n`;
    });
  }

  if (entry.notes) {
    msg += `📝 <b>Catatan:</b> ${escapeTgHtml(entry.notes)}\n`;
  }

  if (entry.evidences && entry.evidences.length > 0) {
    const folderUrl =
      entry.folder_url ||
      (entry as any).drive_folder_url ||
      (entry as any).folder_drive_url;

    if (folderUrl && folderUrl.startsWith('http')) {
      const safeFolderUrl = escapeTgHtml(folderUrl);
      msg += `📸 <b>Dokumentasi:</b> <a href="${safeFolderUrl}">Buka Folder Google Drive (${entry.evidences.length} foto)</a>\n`;
    } else {
      const driveLinks = entry.evidences.filter((e) => e.drive_url || e.url);
      if (driveLinks.length > 0) {
        const linkUrl = escapeTgHtml(driveLinks[0].drive_url || driveLinks[0].url || '');
        msg += `📸 <b>Dokumentasi:</b> <a href="${linkUrl}">Buka Dokumentasi Foto (${entry.evidences.length} foto)</a>\n`;
      } else {
        msg += `📸 <b>Dokumentasi:</b> ${entry.evidences.length} bukti foto tersimpan.\n`;
      }
    }
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 <i>Notifikasi Sistem Pemeliharaan Bandara</i>`;

  return msg;
}

/**
 * Format Attendance (Presensi) Alert for Telegram (HTML)
 * Formats message matching user pattern:
 * halo! {nama} sudah absen masuk!
 * {foto}
 * Jam Absen Masuk : {jam}
 */
export function formatAttendanceTelegramHtml(params: {
  technicianName: string;
  attendanceType?: 'masuk' | 'pulang';
  shift: string;
  date: string;
  time: string;
  locationName?: string;
  gpsCoords?: { latitude: number; longitude: number; accuracy?: number };
  distanceMeters?: number;
  status: 'ontime' | 'late' | 'bypassed' | 'off_duty';
  notes?: string;
}): string {
  const {
    technicianName,
    attendanceType = 'masuk',
    shift,
    date,
    time,
    locationName = 'Bandara Halim Perdanakusuma',
    distanceMeters,
    status,
    notes,
  } = params;

  const safeTechName = escapeTgHtml(isDummyOrRemovedTechnician(technicianName) ? 'Teknisi' : technicianName);
  const dateStr = escapeTgHtml(formatIndonesianDate(date, { includeDayName: true }));
  const isMasuk = attendanceType !== 'pulang';
  const actionText = isMasuk ? 'absen masuk' : 'absen pulang';
  const jamLabel = isMasuk ? 'Jam Absen Masuk' : 'Jam Absen Pulang';

  let msg = `halo! <b>${safeTechName}</b> sudah ${actionText}!\n\n`;
  msg += `🕒 <b>${jamLabel} :</b> <b>${escapeTgHtml(time)} WIB</b>\n`;
  msg += `📅 <b>Tanggal :</b> ${dateStr}\n`;
  msg += `⏰ <b>Shift Kerja :</b> Shift ${escapeTgHtml(shift)}\n`;
  msg += `📍 <b>Lokasi :</b> ${escapeTgHtml(locationName)}`;

  if (distanceMeters !== undefined) {
    msg += ` (~${Math.round(distanceMeters)}m)`;
  }
  msg += `\n`;

  if (status === 'late') {
    msg += `⚠️ <b>Status :</b> Terlambat\n`;
  } else if (status === 'bypassed') {
    msg += `⚠️ <b>Status :</b> Izin / Disetujui Supervisor\n`;
  }

  if (notes && !notes.toLowerCase().includes('absen masuk valid') && !notes.toLowerCase().includes('absen pulang selesai')) {
    msg += `📝 <b>Catatan :</b> ${escapeTgHtml(notes)}\n`;
  }

  return msg;
}
