import React, { useState } from 'react';
import { Technician } from '../types';
import { AuthState } from '../types/auth';
import {
  ShieldCheck,
  AlertCircle,
  Shield,
  Lock,
  Mail,
  Loader2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  signInTechnicianWithCredentials,
  signInSupervisorFast,
} from '../services/authService';

interface LoginScreenProps {
  technicians: Technician[];
  authState: AuthState;
  onLoginTechnician: (selectedTechIds: number[]) => void;
  onLogout: () => void;
  isScheduleLoading?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  technicians,
  authState,
  onLoginTechnician,
  onLogout,
}) => {
  // Mode: 'technician' (default Email & Password) | 'supervisor' (Fast supervisor pass)
  const [loginMode, setLoginMode] = useState<'technician' | 'supervisor'>('technician');

  // Technician Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Supervisor Form Fields
  const [supervisorPass, setSupervisorPass] = useState('');

  // Loading & Error States
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // 1. Handle Standard Technician Email & Password Login
  const handleTechnicianLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setLoginError('Silakan masukkan email dan password.');
      return;
    }

    setLoginError('');
    setIsLoggingIn(true);

    try {
      const res = await signInTechnicianWithCredentials(cleanEmail, cleanPass);
      if (res.success && res.data) {
        // Find corresponding technician id from master data or default to first active
        const matchedTech = technicians.find(
          (t) =>
            t.id === res.data?.profile.technician_id ||
            t.name.toLowerCase() === res.data?.profile.display_name?.toLowerCase() ||
            cleanEmail.toLowerCase().includes(t.name.toLowerCase())
        );
        const techId = matchedTech ? matchedTech.id : (technicians[0]?.id || 1);
        onLoginTechnician([techId]);
      } else {
        setLoginError(res.error || 'Email atau password salah.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Terjadi kesalahan sistem saat otentikasi.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 2. Handle Supervisor Password Login
  const handleSupervisorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supervisorPass.trim()) {
      setLoginError('Password supervisor wajib diisi.');
      return;
    }

    setLoginError('');
    setIsLoggingIn(true);

    try {
      const res = await signInSupervisorFast(supervisorPass);
      if (res.success) {
        onLoginTechnician([]);
      } else {
        setLoginError(res.error || 'Password supervisor salah.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Terjadi kesalahan otentikasi supervisor.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans relative overflow-x-hidden">
      {/* Subtle radial ambient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.15),rgba(255,255,255,0))] pointer-events-none" />

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/80 overflow-hidden my-auto">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 p-5 sm:p-6 text-white text-center">
          <div className="w-12 h-12 mx-auto mb-2.5 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-inner">
            <ShieldCheck className="w-6 h-6 text-sky-200" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            MAINTENANCE OPERATIONS
          </h1>
          <p className="text-xs text-blue-100 font-medium mt-1">
            Sistem Pemeliharaan Peralatan Bandara
          </p>
        </div>

        {/* Error Notification */}
        {loginError && (
          <div className="mx-5 mt-4 p-3 bg-rose-950/70 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{loginError}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="p-5 sm:p-6">
          {loginMode === 'technician' ? (
            /* TECHNICIAN LOGIN: EMAIL & PASSWORD */
            <form onSubmit={handleTechnicianLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Akun
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@bandara.id atau email Anda"
                    required
                    autoFocus
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 px-4 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:from-sky-600 active:to-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-600/30 cursor-pointer"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi Akun...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk Akun</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Quick Supervisor Switch Link */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('supervisor');
                    setLoginError('');
                  }}
                  className="text-xs text-slate-400 hover:text-amber-400 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-500" />
                  <span>Login Khusus Supervisor (Password)</span>
                </button>
              </div>
            </form>
          ) : (
            /* SUPERVISOR LOGIN: FAST PASSWORD */
            <form onSubmit={handleSupervisorLogin} className="space-y-4">
              <div className="text-center mb-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-full text-xs font-semibold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Akses Khusus Supervisor</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kata Sandi Supervisor
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    value={supervisorPass}
                    onChange={(e) => setSupervisorPass(e.target.value)}
                    placeholder="Masukkan sandi supervisor"
                    required
                    autoFocus
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 active:from-amber-700 active:to-amber-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-900/30 cursor-pointer"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi Sandi...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-amber-300" />
                    <span>Masuk sebagai Supervisor</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('technician');
                    setLoginError('');
                  }}
                  className="text-xs text-slate-400 hover:text-sky-400 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5 text-sky-400" />
                  <span>Kembali ke Login Teknisi (Email & Sandi)</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
