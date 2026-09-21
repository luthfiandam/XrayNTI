import React, { useState, useEffect } from 'react';
import {
  Send,
  Bot,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  X,
  HelpCircle,
  Key,
  MessageSquare,
  RefreshCw,
  Bell,
  Sparkles,
  Users,
  Radio,
  Terminal,
  Check,
} from 'lucide-react';
import {
  getStoredTelegramConfig,
  saveTelegramConfig,
  checkTelegramBotStatus,
  testTelegramBotConnection,
  fetchTelegramSubscribers,
  syncTelegramUpdates,
  TelegramConfig,
} from '../services/telegramService';
import { toast } from './Toast';

interface TelegramBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated?: () => void;
}

export const TelegramBotModal: React.FC<TelegramBotModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [config, setConfig] = useState<TelegramConfig>(getStoredTelegramConfig());
  const [botStatus, setBotStatus] = useState<{
    configured: boolean;
    bot_name?: string;
    bot_username?: string;
    defaultChatId?: string;
    error?: string;
  } | null>(null);

  const [activeSubscribersCount, setActiveSubscribersCount] = useState<number>(0);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load status and subscribers count on open
  useEffect(() => {
    if (isOpen) {
      const stored = getStoredTelegramConfig();
      setConfig(stored);
      loadStatus(stored.bot_token);
      loadSubscribersCount();
    }
  }, [isOpen]);

  const loadStatus = async (customToken?: string) => {
    setIsLoadingStatus(true);
    setTestResult(null);
    try {
      const status = await checkTelegramBotStatus(customToken);
      setBotStatus(status);
      if (status.serverConfig) {
        setConfig((prev) => ({
          ...prev,
          chat_id: prev.chat_id || status.serverConfig?.chat_id || '',
          broadcast_to_all_subscribers:
            status.serverConfig?.broadcast_to_all_subscribers !== undefined
              ? status.serverConfig.broadcast_to_all_subscribers
              : prev.broadcast_to_all_subscribers,
          auto_notify_corrective:
            status.serverConfig?.auto_notify_corrective !== undefined
              ? status.serverConfig.auto_notify_corrective
              : prev.auto_notify_corrective,
          auto_notify_recurring_fault:
            status.serverConfig?.auto_notify_recurring_fault !== undefined
              ? status.serverConfig.auto_notify_recurring_fault
              : prev.auto_notify_recurring_fault,
        }));
      } else if (!config.chat_id && status.defaultChatId) {
        setConfig((prev) => ({ ...prev, chat_id: status.defaultChatId || '' }));
      }
    } catch (err: any) {
      setBotStatus({ configured: false, error: err.message });
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const loadSubscribersCount = async () => {
    try {
      const res = await fetchTelegramSubscribers();
      if (res.success) {
        setActiveSubscribersCount(res.activeCount || 0);
      }
    } catch (err) {
      console.warn('Gagal memuat jumlah subscriber:', err);
    }
  };

  const handleSave = () => {
    saveTelegramConfig(config);
    toast.success('Konfigurasi Telegram Disimpan', {
      message: 'Pengaturan Bot Telegram & preferensi siaran berhasil diperbarui.',
      badge: 'Telegram',
    });
    onConfigUpdated?.();
    onClose();
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testTelegramBotConnection(config.bot_token, config.chat_id);
      if (res.success) {
        setTestResult({
          success: true,
          message: res.message || 'Pesan tes berhasil terkirim ke Telegram!',
        });
        toast.success('Pesan Tes Terkirim', {
          message: 'Silakan periksa grup/chat Telegram Anda.',
          badge: 'Telegram',
        });
        loadStatus(config.bot_token);
        loadSubscribersCount();
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Gagal mengirim pesan tes.',
        });
        toast.error('Tes Telegram Gagal', {
          message: res.error || 'Periksa token bot atau Chat ID.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Terjadi kesalahan saat menguji bot.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const [isDetecting, setIsDetecting] = useState(false);

  const handleDetectChatId = async () => {
    if (!config.bot_token && !botStatus?.configured) {
      toast.error('Bot Token Kosong', {
        message: 'Masukkan Bot Token Anda terlebih dahulu.',
        badge: 'Telegram',
      });
      return;
    }
    setIsDetecting(true);
    try {
      const res = await syncTelegramUpdates(config.bot_token);
      if (res.success && res.subscribers && res.subscribers.length > 0) {
        const latest = res.subscribers[res.subscribers.length - 1];
        setConfig((prev) => ({ ...prev, chat_id: String(latest.chat_id) }));
        setActiveSubscribersCount(res.totalSubscribers || res.subscribers.length);
        toast.success('Chat ID Terdeteksi!', {
          message: `Berhasil mendapatkan Chat ID: ${latest.chat_id} (${latest.name || latest.username || 'Pengguna'}).`,
          badge: 'Telegram',
        });
      } else {
        toast.info('Belum Ada Pesan Masuk', {
          message: `Buka bot @${botStatus?.bot_username || 'Anda'} di Telegram, klik tombol START atau kirim pesan apa saja, lalu klik Deteksi lagi.`,
          badge: 'Telegram',
        });
      }
    } catch (err: any) {
      toast.error('Gagal Mendeteksi', {
        message: err.message || 'Pastikan Bot Token valid dan Anda sudah menekan /start di bot.',
        badge: 'Telegram',
      });
    } finally {
      setIsDetecting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold flex items-center gap-2">
                <span>Pengaturan Telegram Bot</span>
                <span className="text-[10px] bg-sky-400/30 text-white font-bold px-2 py-0.5 rounded-full border border-sky-300/30 uppercase tracking-wide">
                  Auto-Register
                </span>
              </h2>
              <p className="text-xs text-sky-100/90 font-medium">
                Siaran Daily Briefing, notifikasi kerusakan alat & perintah cek status otomatis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Status Bot Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                  botStatus?.configured
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">Status Bot:</span>
                  {isLoadingStatus ? (
                    <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Memeriksa...
                    </span>
                  ) : botStatus?.configured ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-extrabold text-[11px]">
                      <CheckCircle2 className="w-3 h-3" /> Terhubung
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-bold text-[11px]">
                      <AlertTriangle className="w-3 h-3" /> Belum Terhubung
                    </span>
                  )}
                </div>
                {botStatus?.configured && botStatus.bot_username && (
                  <div className="text-[11px] text-slate-600 font-medium mt-0.5 flex items-center gap-1.5">
                    <span>Username:</span>
                    <a
                      href={`https://t.me/${botStatus.bot_username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline font-bold inline-flex items-center gap-1"
                    >
                      @{botStatus.bot_username}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                )}
                {botStatus?.error && !botStatus.configured && (
                  <div className="text-[11px] text-red-600 mt-0.5">{botStatus.error}</div>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                loadStatus(config.bot_token);
                loadSubscribersCount();
              }}
              disabled={isLoadingStatus}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Form Credentials */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-blue-600" />
                  <span>Bot Token (Telegram API)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowHelp(!showHelp)}
                  className="text-blue-600 hover:text-blue-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>{showHelp ? 'Tutup Panduan' : 'Cara Dapat Token?'}</span>
                </button>
              </div>
              <input
                type="text"
                value={config.bot_token || ''}
                onChange={(e) => setConfig({ ...config, bot_token: e.target.value.trim() })}
                placeholder="cth: 123456789:AAFlmQ9xVvB9..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Token bot resmi dari @BotFather. Bila dikosongkan, server akan menggunakan default environment variable <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">TELEGRAM_BOT_TOKEN</code>.
              </p>
            </div>

            {/* Step-by-step Help Accordion */}
            {showHelp && (
              <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-xl space-y-2 text-sky-950 animate-in fade-in duration-150">
                <div className="font-extrabold text-sky-900 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  <span>Langkah Cepat Membuat Bot Telegram:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed text-sky-900/90 pl-1">
                  <li>
                    Buka Telegram dan cari bot resmi <b>@BotFather</b>.
                  </li>
                  <li>
                    Ketik perintah <code>/newbot</code>, tentukan nama tampilan bot lalu buat username berakhiran <code>bot</code>.
                  </li>
                  <li>
                    Salin <b>HTTP API Token</b> yang diberikan lalu tempelkan pada kolom di atas.
                  </li>
                  <li>
                    Selesai! Pengguna atau grup cukup membuka bot Anda dan mengetik <code>/start</code> lalu <code>/daftar</code>.
                  </li>
                </ol>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                  <span>Target Chat ID Penerima</span>
                </label>
                <button
                  type="button"
                  onClick={handleDetectChatId}
                  disabled={isDetecting || (!config.bot_token && !botStatus?.configured)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                  title="Deteksi Chat ID otomatis dari pengguna yang menekan START di bot"
                >
                  <RefreshCw className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} />
                  <span>{isDetecting ? 'Mendeteksi...' : 'Deteksi Chat ID Otomatis'}</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.chat_id}
                  onChange={(e) => setConfig({ ...config, chat_id: e.target.value.trim() })}
                  placeholder="cth: 123456789 (chat pribadi) atau -1001928374650 (grup)"
                  className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                />
              </div>

              {/* Bot Link & Quick Steps Banner */}
              <div className="mt-2 p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-1.5 text-[11px] text-amber-900">
                <div className="font-extrabold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Langkah agar Pesan Tes Berhasil Terkirim:</span>
                  </span>
                  {botStatus?.configured && botStatus.bot_username && (
                    <a
                      href={`https://t.me/${botStatus.bot_username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-md font-bold text-[10px] hover:bg-blue-700 transition shadow-2xs"
                    >
                      <span>Buka @{botStatus.bot_username}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <ol className="list-decimal list-inside space-y-1 text-amber-950/90 leading-relaxed text-[10.5px]">
                  <li>
                    <b>WAJIB:</b> Telegram melarang bot chat duluan. Buka bot Anda di Telegram lalu klik tombol <b>START</b> (atau ketik <code>/start</code>).
                  </li>
                  <li>
                    Klik tombol <b>"Deteksi Chat ID Otomatis"</b> di atas agar ID Anda terisi otomatis, ATAU cek ID pribadi Anda via bot <b>@userinfobot</b>.
                  </li>
                  <li>
                    Jika ingin kirim ke <b>Grup</b>: Undang bot ke grup Anda, beri izin kirim pesan, lalu masukkan ID grup (awalan <code>-100...</code>).
                  </li>
                </ol>
              </div>
            </div>
          </div>

          {/* Informative Automated Bot Flow Banner */}
          <div className="p-3.5 bg-gradient-to-br from-blue-50/80 to-indigo-50/70 border border-blue-200/80 rounded-xl space-y-2.5 text-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-blue-900 flex items-center gap-1.5 text-xs">
                <Terminal className="w-4 h-4 text-blue-600" />
                <span>Alur Otomatisasi & Perintah Bot Telegram</span>
              </span>
              <div className="flex items-center gap-1.5 bg-white/90 border border-blue-200 px-2 py-0.5 rounded-md text-[11px] font-extrabold text-blue-800 shadow-2xs">
                <Users className="w-3 h-3 text-blue-600" />
                <span>{activeSubscribersCount} Penerima Aktif</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100 shadow-2xs space-y-1">
                <div className="font-extrabold text-blue-950 flex items-center gap-1">
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-mono text-[10px]">/start</span>
                  <span>Sambutan & Navigasi</span>
                </div>
                <p className="text-slate-600 text-[10.5px] leading-tight">
                  Menampilkan menu utama dan tombol cepat. Pesan ini tetap tersimpan rapi tanpa dihapus otomatis.
                </p>
              </div>

              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100 shadow-2xs space-y-1">
                <div className="font-extrabold text-emerald-950 flex items-center gap-1">
                  <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-mono text-[10px]">/daftar</span>
                  <span>Pendaftaran Otomatis</span>
                </div>
                <p className="text-slate-600 text-[10.5px] leading-tight">
                  Mendaftarkan Chat ID ke sistem siaran. Jika sudah ada, bot membalas <i>"kamu sudah terdaftar"</i>.
                </p>
              </div>

              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100 shadow-2xs space-y-1">
                <div className="font-extrabold text-sky-950 flex items-center gap-1">
                  <span className="bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded font-mono text-[10px]">/alat</span>
                  <span>Cek Alat Per Kategori</span>
                </div>
                <p className="text-slate-600 text-[10.5px] leading-tight">
                  Ringkasan status: X-Ray, WTMD, HHMD, dan ETD (sekian rusak / sekian normal) beserta daftar unit terkendala.
                </p>
              </div>

              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100 shadow-2xs space-y-1">
                <div className="font-extrabold text-amber-950 flex items-center gap-1">
                  <span className="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-mono text-[10px]">/jadwal</span>
                  <span>Jadwal Pemeliharaan</span>
                </div>
                <p className="text-slate-600 text-[10.5px] leading-tight">
                  Agenda preventif fasilitas: Harian per shift (Pagi/Siang/Malam), Mingguan, Bulanan, dan Berkala (3B/6B/1T).
                </p>
              </div>

              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100 shadow-2xs space-y-1">
                <div className="font-extrabold text-rose-950 flex items-center gap-1">
                  <span className="bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-mono text-[10px]">/history</span>
                  <span>Riwayat Kerusakan</span>
                </div>
                <p className="text-slate-600 text-[10.5px] leading-tight">
                  Melihat riwayat kerusakan alat terkini, deskripsi kendala, tindakan perbaikan, dan teknisi yang menangani.
                </p>
              </div>

              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100 shadow-2xs space-y-1">
                <div className="font-extrabold text-indigo-950 flex items-center gap-1">
                  <span className="bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-mono text-[10px]">/brief</span>
                  <span>Ringkasan Shift</span>
                </div>
                <p className="text-slate-600 text-[10.5px] leading-tight">
                  Mengecek info tanggal operasional, shift berjalan, personel jaga & tingkat kesiapan fasilitas.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 space-y-1.5">
              <div className="font-extrabold text-[11px] flex items-center gap-1.5 text-slate-900">
                <span>💡 Navigasi & Keamanan Chat ID:</span>
              </div>
              <ul className="text-[10.5px] text-slate-600 list-disc list-inside space-y-0.5 leading-relaxed">
                <li><b>Tombol Kembali:</b> Setiap sub-menu interaktif kini dilengkapi tombol <b>[◀️ Kembali ke Menu Utama]</b>.</li>
                <li><b>Pesan /start Aman:</b> Pesan perintah dan sambutan /start tidak akan terhapus otomatis.</li>
                <li><b>Chat ID:</b> Bersifat <b>aman</b> dan bukan data rahasia (seperti nomor telepon atau alamat email untuk pengiriman notifikasi). Yang bersifat rahasia hanyalah <b>Bot Token</b> yang tersimpan aman di server aplikasi.</li>
              </ul>
            </div>
          </div>

          {/* Automated Notification Triggers */}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-blue-600" />
              <span>Otomatisasi Siaran (Broadcast)</span>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none p-2.5 rounded-xl bg-blue-50/50 border border-blue-100 hover:bg-blue-50 transition">
              <input
                type="checkbox"
                checked={config.broadcast_to_all_subscribers}
                onChange={(e) =>
                  setConfig({ ...config, broadcast_to_all_subscribers: e.target.checked })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5"
              />
              <div>
                <div className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-blue-600" />
                  <span>Siarkan ke Semua Penerima yang Mengetik /daftar</span>
                </div>
                <div className="text-[10px] text-blue-700/90 leading-relaxed mt-0.5">
                  Setiap Daily Briefing dan alert akan otomatis terkirim ke seluruh kontak/grup aktif tanpa perlu mengirim satu per satu.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none p-2 rounded-xl hover:bg-slate-50 transition">
              <input
                type="checkbox"
                checked={config.auto_notify_preventive !== false}
                onChange={(e) =>
                  setConfig({ ...config, auto_notify_preventive: e.target.checked })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5"
              />
              <div>
                <div className="font-bold text-slate-800 text-xs">
                  Notifikasi Otomatis saat Checklist Preventif Selesai Disubmit
                </div>
                <div className="text-[10px] text-slate-500">
                  Bot langsung mengirim ringkasan hasil inspeksi preventif, parameter kV/mA, dan teknisi pelaksana.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none p-2 rounded-xl hover:bg-slate-50 transition">
              <input
                type="checkbox"
                checked={config.auto_notify_corrective}
                onChange={(e) =>
                  setConfig({ ...config, auto_notify_corrective: e.target.checked })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5"
              />
              <div>
                <div className="font-bold text-slate-800 text-xs">
                  Notifikasi Otomatis saat Laporan Kerusakan (Corrective) Disimpan
                </div>
                <div className="text-[10px] text-slate-500">
                  Bot langsung mengirim rincian kerusakan begitu teknisi mengklik Simpan Laporan.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none p-2 rounded-xl hover:bg-slate-50 transition">
              <input
                type="checkbox"
                checked={config.auto_notify_attendance !== false}
                onChange={(e) =>
                  setConfig({ ...config, auto_notify_attendance: e.target.checked })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5"
              />
              <div>
                <div className="font-bold text-slate-800 text-xs">
                  Notifikasi Otomatis saat Teknisi Melakukan Presensi / Absen Shift
                </div>
                <div className="text-[10px] text-slate-500">
                  Bot otomatis melaporkan kehadiran personel (nama teknisi, shift, jam presensi & verifikasi lokasi bandara).
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none p-2 rounded-xl hover:bg-slate-50 transition">
              <input
                type="checkbox"
                checked={config.auto_notify_recurring_fault}
                onChange={(e) =>
                  setConfig({ ...config, auto_notify_recurring_fault: e.target.checked })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5"
              />
              <div>
                <div className="font-bold text-slate-800 text-xs">
                  Peringatan Kerusakan Berulang (Recurring Faults ≥ 3x / 30 hari)
                </div>
                <div className="text-[10px] text-slate-500">
                  Alert prioritas otomatis saat unit menunjukkan indikasi kegagalan komponen berulang.
                </div>
              </div>
            </label>
          </div>

          {/* Test Result Feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in duration-150 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">{testResult.message}</div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || (!config.bot_token && !botStatus?.configured)}
            className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
          >
            {isTesting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{isTesting ? 'Menguji...' : 'Kirim Pesan Tes'}</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              Simpan Pengaturan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
