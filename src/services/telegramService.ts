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
    const res = await safeFetchJson('/api/telegram/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.isJson && res.data) {
      return res.data;
    }
    return { success: res.ok };
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
    const res = await safeFetchJson('/api/telegram/operational-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.isJson && res.data?.success) {
      lastSyncedOperationalFingerprint = fingerprint;
    }
    return res.data || { success: res.ok };
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
 * Safe JSON fetch helper to prevent SyntaxError on non-JSON/HTML responses
 */
async function safeFetchJson<T = any>(
  url: string,
  init?: RequestInit
): Promise<{ isJson: boolean; ok: boolean; status: number; data?: T }> {
  try {
    const res = await fetch(url, init);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') || res.status === 404) {
      return { isJson: false, ok: false, status: res.status };
    }
    const data = await res.json();
    return { isJson: true, ok: res.ok, status: res.status, data };
  } catch (e) {
    return { isJson: false, ok: false, status: 0 };
  }
}

/**
 * Convert Base64 data URL to Blob for direct Telegram upload
 */
function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    return new Blob([], { type: 'image/jpeg' });
  }
}

/**
 * Check Bot Status from server or custom token (supports direct Telegram API fallback on static hosts)
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
  const token = (customToken || getStoredTelegramConfig().bot_token || '').trim();

  // 1. Try server endpoint first
  const serverRes = await safeFetchJson<any>(
    customToken
      ? `/api/telegram/status?token=${encodeURIComponent(customToken)}`
      : '/api/telegram/status'
  );

  if (serverRes.isJson && serverRes.data) {
    return serverRes.data;
  }

  // 2. Direct client fallback via api.telegram.org (for GitHub Pages / static hosts)
  if (token) {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const tgData = await tgRes.json().catch(() => ({}));
      if (tgRes.ok && tgData.ok && tgData.result) {
        return {
          configured: true,
          bot_id: tgData.result.id,
          bot_name: tgData.result.first_name,
          bot_username: tgData.result.username,
        };
      }
      return {
        configured: false,
        error: tgData.description || 'Token bot tidak valid pada Telegram API (@BotFather).',
      };
    } catch (err: any) {
      return {
        configured: false,
        error: 'Tidak dapat menghubungi api.telegram.org: ' + err.message,
      };
    }
  }

  return {
    configured: false,
    error: 'Token bot belum diisi di Pengaturan Telegram.',
  };
}

/**
 * Send test message to Telegram
 */
export async function testTelegramBotConnection(
  token?: string,
  chatId?: string
): Promise<{ success: boolean; bot?: any; message?: string; error?: string }> {
  const config = getStoredTelegramConfig();
  const effectiveToken = (token || config.bot_token || '').trim();
  const effectiveChatId = (chatId || config.chat_id || '').trim();

  if (effectiveToken) {
    saveServerTelegramToken({ token: effectiveToken, chat_id: effectiveChatId }).catch(() => {});
  }

  // Try server endpoint first
  const serverRes = await safeFetchJson<any>('/api/telegram/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: effectiveToken || undefined,
      chat_id: effectiveChatId || undefined,
    }),
  });

  if (serverRes.isJson && serverRes.data) {
    return serverRes.data;
  }

  // Direct client fallback
  if (!effectiveToken) {
    return {
      success: false,
      error: 'Token bot wajib diisi untuk melakukan tes koneksi.',
    };
  }
  if (!effectiveChatId) {
    return {
      success: false,
      error: 'Chat ID tujuan wajib diisi untuk melakukan tes koneksi.',
    };
  }

  try {
    const testMsg = `🤖 <b>Tes Koneksi Bot Berhasil!</b>\n\nSistem Pemeliharaan X-Ray Bandara Halim Perdanakusuma berhasil terhubung dengan bot Telegram ini.\n\n🕒 Waktu: <code>${new Date().toLocaleString('id-ID')}</code>`;
    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: effectiveChatId,
        text: testMsg,
        parse_mode: 'HTML',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return {
        success: true,
        message: 'Pesan tes berhasil dikirim langsung ke Telegram!',
      };
    }
    return {
      success: false,
      error: data.description || 'Gagal mengirim pesan tes ke Telegram API.',
    };
  } catch (e: any) {
    return {
      success: false,
      error: 'Gagal menghubungi Telegram API: ' + e.message,
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
  const serverRes = await safeFetchJson<any>('/api/telegram/subscribers');
  if (serverRes.isJson && serverRes.data) {
    return serverRes.data;
  }

  // Local storage fallback for static hosts
  try {
    const localRaw = localStorage.getItem('xray_telegram_subscribers');
    const subscribers: TelegramSubscriber[] = localRaw ? JSON.parse(localRaw) : [];
    const active = subscribers.filter((s) => s.is_active);
    return {
      success: true,
      subscribers,
      total: subscribers.length,
      activeCount: active.length,
    };
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
  const config = getStoredTelegramConfig();
  const effectiveToken = (token || config.bot_token || '').trim();

  // Try server endpoint
  const serverRes = await safeFetchJson<any>('/api/telegram/sync-updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: effectiveToken || undefined }),
  });

  if (serverRes.isJson && serverRes.data) {
    return serverRes.data;
  }

  // Direct client fallback to getUpdates
  if (!effectiveToken) {
    return {
      success: false,
      newDetectedCount: 0,
      totalSubscribers: 0,
      subscribers: [],
      message: '',
      error: 'Token bot wajib diisi untuk mendeteksi Chat ID secara otomatis.',
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/getUpdates`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      return {
        success: false,
        newDetectedCount: 0,
        totalSubscribers: 0,
        subscribers: [],
        message: '',
        error: data.description || 'Gagal mengambil pembaruan dari Telegram Bot.',
      };
    }

    const updates = data.result || [];
    const detectedChats = new Map<string, TelegramSubscriber>();

    updates.forEach((u: any) => {
      const msg = u.message || u.channel_post || u.my_chat_member?.chat;
      if (msg?.chat?.id) {
        const chatId = String(msg.chat.id);
        const name = msg.chat.title || [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Pengguna Telegram';
        detectedChats.set(chatId, {
          chat_id: chatId,
          name,
          username: msg.chat.username || msg.from?.username,
          type: (msg.chat.type === 'group' || msg.chat.type === 'supergroup') ? 'group' : (msg.chat.type === 'channel' ? 'channel' : 'private'),
          is_active: true,
          first_seen: new Date().toISOString(),
          last_active: new Date().toISOString(),
        });
      }
    });

    const subscriberList = Array.from(detectedChats.values());
    localStorage.setItem('xray_telegram_subscribers', JSON.stringify(subscriberList));

    return {
      success: true,
      newDetectedCount: subscriberList.length,
      totalSubscribers: subscriberList.length,
      subscribers: subscriberList,
      message: subscriberList.length > 0 ? `Berhasil mendeteksi ${subscriberList.length} chat/grup Telegram!` : 'Belum ada pesan baru. Pastikan Anda sudah membuka bot dan menekan /start di Telegram.',
    };
  } catch (err: any) {
    return {
      success: false,
      newDetectedCount: 0,
      totalSubscribers: 0,
      subscribers: [],
      message: '',
      error: err.message || 'Gagal menghubungi Telegram API',
    };
  }
}

/**
 * Add or update subscriber
 */
export async function updateTelegramSubscriber(
  subscriber: Partial<TelegramSubscriber> & { chat_id: string }
): Promise<{ success: boolean; subscribers: TelegramSubscriber[]; error?: string }> {
  const serverRes = await safeFetchJson<any>('/api/telegram/subscribers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscriber),
  });

  if (serverRes.isJson && serverRes.data) {
    return serverRes.data;
  }

  // Local fallback
  try {
    const raw = localStorage.getItem('xray_telegram_subscribers');
    let list: TelegramSubscriber[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((s) => s.chat_id === subscriber.chat_id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...subscriber };
    } else {
      list.push(subscriber as TelegramSubscriber);
    }
    localStorage.setItem('xray_telegram_subscribers', JSON.stringify(list));
    return { success: true, subscribers: list };
  } catch (err: any) {
    return { success: false, subscribers: [], error: err.message };
  }
}

/**
 * Remove a subscriber
 */
export async function deleteTelegramSubscriber(
  chatId: string
): Promise<{ success: boolean; subscribers: TelegramSubscriber[]; error?: string }> {
  const serverRes = await safeFetchJson<any>(`/api/telegram/subscribers/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });

  if (serverRes.isJson && serverRes.data) {
    return serverRes.data;
  }

  // Local fallback
  try {
    const raw = localStorage.getItem('xray_telegram_subscribers');
    let list: TelegramSubscriber[] = raw ? JSON.parse(raw) : [];
    list = list.filter((s) => s.chat_id !== chatId);
    localStorage.setItem('xray_telegram_subscribers', JSON.stringify(list));
    return { success: true, subscribers: list };
  } catch (err: any) {
    return { success: false, subscribers: [], error: err.message };
  }
}

/**
 * Configure Telegram Webhook
 */
export async function setTelegramWebhook(
  webhookUrl: string,
  token?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const config = getStoredTelegramConfig();
  const effectiveToken = (token || config.bot_token || '').trim();

  const serverRes = await safeFetchJson<any>('/api/telegram/set-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhook_url: webhookUrl,
      token: effectiveToken || undefined,
    }),
  });

  if (serverRes.isJson && serverRes.data) {
    return serverRes.data;
  }

  if (!effectiveToken) {
    return { success: false, error: 'Token bot belum diisi' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await res.json().catch(() => ({}));
    return {
      success: res.ok && data.ok,
      message: data.description,
      error: data.ok ? undefined : data.description,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
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
    const effectiveToken = (params.token || config.bot_token || '').trim();
    const effectiveChatId = (params.chatId || config.chat_id || '').trim();
    const shouldBroadcast =
      params.broadcastAll !== undefined
        ? params.broadcastAll
        : config.broadcast_to_all_subscribers;

    // Try server endpoint first
    const serverRes = await safeFetchJson<any>('/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photo: params.photo,
        caption: params.caption,
        message: params.caption,
        chat_id: effectiveChatId || undefined,
        token: effectiveToken || undefined,
        broadcast_all: shouldBroadcast,
        parse_mode: params.parseMode || 'HTML',
      }),
    });

    if (serverRes.isJson && serverRes.data) {
      if (serverRes.data.success) {
        return serverRes.data;
      }
    }

    // Direct client fallback to api.telegram.org
    if (!effectiveToken || !effectiveChatId) {
      return {
        success: false,
        error: 'Token bot atau Chat ID Telegram belum dikonfigurasi di menu Pengaturan.',
      };
    }

    const formData = new FormData();
    formData.append('chat_id', effectiveChatId);
    if (params.caption) {
      formData.append('caption', params.caption);
      formData.append('parse_mode', params.parseMode || 'HTML');
    }

    if (params.photo.startsWith('data:')) {
      const blob = dataUrlToBlob(params.photo);
      formData.append('photo', blob, 'attendance.jpg');
    } else {
      formData.append('photo', params.photo);
    }

    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return {
        success: true,
        messageId: data.result?.message_id,
        sentCount: 1,
        totalTargets: 1,
      };
    }

    return {
      success: false,
      error: data.description || 'Gagal mengirim foto ke Telegram API',
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
    const effectiveToken = (params.token || config.bot_token || '').trim();
    const effectiveChatId = (params.chatId || config.chat_id || '').trim();
    const shouldBroadcast =
      params.broadcastAll !== undefined
        ? params.broadcastAll
        : config.broadcast_to_all_subscribers;

    // Try server endpoint first
    const serverRes = await safeFetchJson<any>('/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.message,
        chat_id: effectiveChatId || undefined,
        token: effectiveToken || undefined,
        broadcast_all: shouldBroadcast,
        parse_mode: params.parseMode || 'HTML',
      }),
    });

    if (serverRes.isJson && serverRes.data) {
      if (serverRes.data.success) {
        return serverRes.data;
      }
    }

    // Direct client fallback to api.telegram.org
    if (!effectiveToken || !effectiveChatId) {
      return {
        success: false,
        error: 'Token bot atau Chat ID Telegram belum dikonfigurasi di menu Pengaturan.',
      };
    }

    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: effectiveChatId,
        text: params.message,
        parse_mode: params.parseMode || 'HTML',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return {
        success: true,
        messageId: data.result?.message_id,
        sentCount: 1,
        totalTargets: 1,
      };
    }

    return {
      success: false,
      error: data.description || 'Gagal mengirim pesan Telegram via client fallback',
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
