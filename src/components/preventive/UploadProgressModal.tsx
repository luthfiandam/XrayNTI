import React, { useEffect, useRef } from 'react';
import { Cloud, CheckCircle2, ShieldAlert, Sparkles, Smartphone } from 'lucide-react';

export interface UploadModalState {
  isOpen: boolean;
  stage: 'idle' | 'collage' | 'uploading' | 'saving' | 'complete' | 'error';
  currentPhotoIndex: number;
  totalPhotos: number;
  currentItemName?: string;
  percent: number;
  equipmentName?: string;
  equipmentCode?: string;
  errorMessage?: string;
}

interface UploadProgressModalProps {
  state: UploadModalState;
  onClose?: () => void;
}

export const UploadProgressModal: React.FC<UploadProgressModalProps> = ({ state, onClose }) => {
  const wakeLockRef = useRef<any>(null);

  // Screen WakeLock management: keep screen awake while upload is in progress
  useEffect(() => {
    if (!state.isOpen || state.stage === 'complete' || state.stage === 'error') {
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch (e) {
          // ignore
        }
        wakeLockRef.current = null;
      }
      return;
    }

    let isSubscribed = true;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && (navigator as any).wakeLock) {
          const lock = await (navigator as any).wakeLock.request('screen');
          if (isSubscribed) {
            wakeLockRef.current = lock;
            lock.addEventListener('release', () => {
              wakeLockRef.current = null;
            });
          }
        }
      } catch (err) {
        console.info('[WakeLock] Screen wake lock not acquired:', err);
      }
    };

    requestWakeLock();

    // Prevent tab close/navigation warning
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Laporan dan foto sedang diunggah. Mohon jangan menutup halaman ini.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isSubscribed = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch (e) {
          // ignore
        }
        wakeLockRef.current = null;
      }
    };
  }, [state.isOpen, state.stage]);

  if (!state.isOpen) return null;

  return (
    <div
      id="upload-progress-overlay"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6 text-white text-center relative">
        {/* Glow ambient background */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Animated Icon Radar */}
        <div className="relative mx-auto w-20 h-20 mb-4 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping opacity-75" />
          <div className="absolute inset-1 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 opacity-90 shadow-lg shadow-blue-500/30 flex items-center justify-center">
            {state.stage === 'complete' ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-300 animate-bounce" />
            ) : (
              <Cloud className="w-9 h-9 text-white animate-pulse" />
            )}
          </div>
        </div>

        {/* Equipment & Title Header */}
        <div className="mb-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-500/40 text-blue-300 text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{state.equipmentName || 'Peralatan X-Ray'}</span>
            {state.equipmentCode && <span className="text-blue-400">({state.equipmentCode})</span>}
          </div>
          <h3 className="text-lg font-bold text-slate-100">
            {state.stage === 'collage' && 'Menyiapkan Kolase Foto WA'}
            {state.stage === 'uploading' && 'Mengunggah Foto ke Google Drive'}
            {state.stage === 'saving' && 'Menyinkronkan Database & Laporan'}
            {state.stage === 'complete' && 'Laporan Berhasil Disimpan!'}
            {state.stage === 'error' && 'Terjadi Kendala Upload'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {state.stage === 'collage' && 'Menyatukan foto inspeksi menjadi 1 lembar kolase resmi...'}
            {state.stage === 'uploading' &&
              `Foto ${state.currentPhotoIndex} dari ${state.totalPhotos} sedang diproses...`}
            {state.stage === 'saving' && 'Menyimpan riwayat inspeksi & memperbarui status mesin...'}
            {state.stage === 'complete' && 'Semua dokumentasi berhasil tersimpan ke sistem.'}
            {state.stage === 'error' && (state.errorMessage || 'Gagal mengunggah foto.')}
          </p>
        </div>

        {/* Progress Bar with Percentage */}
        <div className="my-5 bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span className="text-slate-300 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block" />
              Progress Upload
            </span>
            <span className="text-blue-400 font-mono text-sm">{state.percent}%</span>
          </div>

          <div className="w-full bg-slate-700/80 h-3 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-sm shadow-blue-500/50"
              style={{ width: `${Math.max(5, state.percent)}%` }}
            />
          </div>

          {state.totalPhotos > 0 && state.stage === 'uploading' && (
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
              <span>{state.currentItemName || 'Memproses foto...'}</span>
              <span className="font-mono text-slate-300">
                {state.currentPhotoIndex}/{state.totalPhotos} Foto
              </span>
            </div>
          )}
        </div>

        {/* Critical Anti-Close / Anti-Sleep Notice */}
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 text-left mb-4 flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <span className="font-bold text-amber-300 block mb-0.5">PENTING - JANGAN TUTUP APLIKASI:</span>
            Mohon <strong>tetap di halaman ini</strong>, jangan berpindah tab, dan jangan matikan layar HP Anda hingga proses mencapai 100%.
          </div>
        </div>

        {/* Screen WakeLock Indicator */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          <span>Layar HP otomatis dijaga tetap menyala selama proses</span>
        </div>

        {/* Close Button if error */}
        {state.stage === 'error' && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Tutup & Coba Lagi
          </button>
        )}
      </div>
    </div>
  );
};
