import React, { useState } from 'react';
import { ShieldCheck, Key, AlertCircle, Loader2, X, Lock } from 'lucide-react';
import { signInSupervisorWithPassword } from '../services/authService';

interface SupervisorLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export const SupervisorLoginModal: React.FC<SupervisorLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Password supervisor wajib diisi.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const res = await signInSupervisorWithPassword(password);
      // Immediately clear password from local component state
      setPassword('');

      if (!res.success) {
        setError(res.error || 'Password supervisor salah atau akses tidak tersedia.');
        return;
      }

      setError('');
      onLoginSuccess();
      onClose();
    } catch (_err: any) {
      setPassword('');
      setError('Password supervisor salah atau akses tidak tersedia.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-lg max-w-sm w-full border border-slate-300 shadow-xl overflow-hidden">
        {/* Header with Identitas: Luthfi — Supervisor */}
        <div className="p-5 text-center border-b border-slate-200 bg-slate-50 relative">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-700 p-1.5 rounded transition-colors cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="w-11 h-11 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-amber-500/20">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded text-[11px] font-bold mb-1">
            <span>Otoritas Pengawas</span>
          </div>

          {/* Identitas: Luthfi — Supervisor */}
          <h2 className="text-base font-bold text-slate-900 leading-tight">
            Luthfi — Supervisor
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Masukkan kata sandi supervisor untuk membuka hak akses penuh
          </p>
        </div>

        {/* Form with single Password input */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-800 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-slate-500" /> Kata Sandi
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="Masukkan kata sandi..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors placeholder:text-slate-400"
                autoFocus
                required
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs border border-slate-300 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-amber-600/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-200" />
                  <span>Masuk Supervisor</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
