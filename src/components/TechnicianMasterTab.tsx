import React, { useState, useMemo, useEffect } from 'react';
import { Technician, Role } from '../types';
import { isSupabaseConfigured, getSupabaseUrl } from '../lib/supabase';
import {
  syncTechnicianToSupabase,
  checkTechniciansTableStatus,
  getTechniciansTableSql,
} from '../services/supabaseMasterDataService';
import {
  Users,
  UserPlus,
  Search,
  Key,
  Shield,
  ShieldCheck,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Lock,
  Mail,
  User,
  Hash,
  RefreshCw,
  Info,
  Database,
  Copy,
  Check,
  Code,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface TechnicianMasterTabProps {
  technicians: Technician[];
  onAddTechnician: (tech: Omit<Technician, 'id'>) => void;
  onUpdateTechnician: (id: number, tech: Partial<Technician>) => void;
  onDeleteTechnician: (id: number) => void;
  onToggleTechnicianActive: (id: number) => void;
  onToast: (msg: string) => void;
}

export const TechnicianMasterTab: React.FC<TechnicianMasterTabProps> = ({
  technicians,
  onAddTechnician,
  onUpdateTechnician,
  onDeleteTechnician,
  onToggleTechnicianActive,
  onToast,
}) => {
  // -------------------------------------------------------------
  // Form State: Add New Technician / User
  // -------------------------------------------------------------
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('TechnicianPassword123!');
  const [role, setRole] = useState<Role>('technician');
  const [active, setActive] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // -------------------------------------------------------------
  // Filter & Search State
  // -------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // -------------------------------------------------------------
  // Modal States: Edit Technician & Change Password
  // -------------------------------------------------------------
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [changePasswordTech, setChangePasswordTech] = useState<Technician | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [deleteConfirmTech, setDeleteConfirmTech] = useState<Technician | null>(null);

  // Visible password preview per technician ID
  const [revealedPasswordId, setRevealedPasswordId] = useState<number | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [tableMissing, setTableMissing] = useState<boolean | null>(null);
  const [showSqlGuide, setShowSqlGuide] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Check table status on initial mount
  useEffect(() => {
    let isMounted = true;
    checkTechniciansTableStatus().then((res) => {
      if (isMounted) {
        if (!res.exists && res.message?.includes('belum dibuat')) {
          setTableMissing(true);
        } else {
          setTableMissing(false);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopySql = () => {
    const sql = getTechniciansTableSql();
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    onToast('Script SQL tabel technicians berhasil disalin ke clipboard!');
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Bulk sync all technicians to Supabase
  const handleSyncAllToSupabase = async () => {
    if (!isSupabaseConfigured()) {
      onToast('Supabase belum terkonfigurasi. Data tersimpan di memori browser.');
      return;
    }
    setIsSyncingAll(true);

    // 1. Check if the table exists first
    const status = await checkTechniciansTableStatus();
    if (!status.exists && status.message?.includes('belum dibuat')) {
      setTableMissing(true);
      setShowSqlGuide(true);
      setIsSyncingAll(false);
      onToast('Tabel "technicians" belum ada di Supabase. Jalankan SQL di bawah terlebih dahulu.');
      return;
    }

    setTableMissing(false);
    let successCount = 0;
    try {
      for (const tech of technicians) {
        const ok = await syncTechnicianToSupabase(tech);
        if (ok) successCount++;
      }
      if (successCount === technicians.length) {
        onToast(`Berhasil menyinkronkan seluruh ${successCount} akun teknisi ke tabel 'technicians' di Supabase!`);
      } else {
        onToast(`Tersinkron ${successCount}/${technicians.length} akun teknisi ke Supabase.`);
      }
    } catch {
      onToast('Gagal menyinkronkan data ke Supabase. Periksa izin akses tabel.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Auto-generate suggested code & email when name changes
  const handleNameChange = (val: string) => {
    setName(val);
    const cleanName = val.trim().toLowerCase().replace(/\s+/g, '');
    if (cleanName && !email) {
      setEmail(`${cleanName}@bandara.id`);
    }
  };

  // -------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------
  const handleCreateTechnician = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      onToast('Nama teknisi / user wajib diisi.');
      return;
    }

    const nextCode = code.trim() || `TECH-0${technicians.length + 1}`;
    const cleanEmail = email.trim().toLowerCase() || `${cleanName.toLowerCase().replace(/\s+/g, '')}@bandara.id`;
    const cleanPass = password.trim() || 'TechnicianPassword123!';

    onAddTechnician({
      name: cleanName,
      code: nextCode.toUpperCase(),
      email: cleanEmail,
      password: cleanPass,
      role,
      active,
    });

    onToast(`User "${cleanName}" (${role === 'supervisor' ? 'Supervisor' : 'Teknisi'}) berhasil ditambahkan!`);

    // Reset Form
    setName('');
    setCode('');
    setEmail('');
    setPassword('TechnicianPassword123!');
    setRole('technician');
    setActive(true);
    setShowPassword(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTech) return;

    const cleanName = editingTech.name.trim();
    if (!cleanName) {
      onToast('Nama teknisi tidak boleh kosong.');
      return;
    }

    onUpdateTechnician(editingTech.id, {
      name: cleanName,
      code: (editingTech.code || `TECH-0${editingTech.id}`).trim().toUpperCase(),
      email: (editingTech.email || '').trim().toLowerCase(),
      role: editingTech.role || 'technician',
      active: editingTech.active,
    });

    onToast(`Data user "${cleanName}" berhasil diperbarui!`);
    setEditingTech(null);
  };

  const handleSaveNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changePasswordTech) return;

    const cleanPass = newPassword.trim();
    if (!cleanPass) {
      onToast('Kata sandi baru tidak boleh kosong.');
      return;
    }

    if (cleanPass.length < 6) {
      onToast('Kata sandi minimal terdiri dari 6 karakter.');
      return;
    }

    onUpdateTechnician(changePasswordTech.id, {
      password: cleanPass,
    });

    onToast(`Kata sandi untuk "${changePasswordTech.name}" berhasil diubah!`);
    setChangePasswordTech(null);
    setNewPassword('');
    setShowNewPassword(false);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmTech) return;
    onDeleteTechnician(deleteConfirmTech.id);
    onToast(`User "${deleteConfirmTech.name}" berhasil dihapus.`);
    setDeleteConfirmTech(null);
  };

  // -------------------------------------------------------------
  // Filtered List
  // -------------------------------------------------------------
  const filteredTechnicians = useMemo(() => {
    return technicians.filter((t) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.code && t.code.toLowerCase().includes(q)) ||
        (t.email && t.email.toLowerCase().includes(q));

      const matchRole = roleFilter === 'ALL' || (t.role || 'technician') === roleFilter;
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && t.active) ||
        (statusFilter === 'INACTIVE' && !t.active);

      return matchSearch && matchRole && matchStatus;
    });
  }, [technicians, search, roleFilter, statusFilter]);

  // Statistics
  const totalCount = technicians.length;
  const activeCount = technicians.filter((t) => t.active).length;
  const supervisorCount = technicians.filter((t) => t.role === 'supervisor').length;
  const technicianCount = technicians.filter((t) => (t.role || 'technician') === 'technician').length;

  return (
    <div className="space-y-4">
      {/* Quick Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Pengguna</p>
            <p className="text-base font-black text-slate-900">{totalCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Akun Aktif</p>
            <p className="text-base font-black text-emerald-600">{activeCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Supervisor</p>
            <p className="text-base font-black text-amber-600">{supervisorCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
            <User className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Teknisi</p>
            <p className="text-base font-black text-indigo-600">{technicianCount}</p>
          </div>
        </div>
      </div>

      {/* Supabase Database Connection & Status Banner */}
      <div className="space-y-2">
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-4 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Database Supabase: Tabel <code className="text-indigo-300 font-mono text-[11px] bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-500/40">public.technicians</code>
                </h4>
                {tableMissing === true ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    Tabel Belum Dibuat di Supabase
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Tersinkronisasi Otomatis
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 mt-1 max-w-2xl leading-relaxed">
                {tableMissing === true
                  ? 'Tabel "technicians" belum ada di Supabase. Akun tersimpan di memori browser. Jalankan script SQL berikut di Supabase SQL Editor agar tersimpan permanen di cloud.'
                  : 'Setiap penambahan teknisi baru, pembaruan data, dan penggantian kata sandi langsung disimpan ke database Supabase dan memori lokal.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-1 md:pt-0 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSqlGuide(!showSqlGuide)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
            >
              <Code className="w-3.5 h-3.5 text-indigo-400" />
              <span>{showSqlGuide ? 'Sembunyikan SQL' : 'Lihat SQL Tabel'}</span>
              {showSqlGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={handleSyncAllToSupabase}
              disabled={isSyncingAll}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Kirim dan perbarui semua akun teknisi ke tabel Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>{isSyncingAll ? 'Menyinkronkan...' : 'Sinkronkan Semua ke Supabase'}</span>
            </button>
          </div>
        </div>

        {/* Informative SQL Guide Box when Table is Missing or User wants to see SQL */}
        {(tableMissing === true || showSqlGuide) && (
          <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 text-xs space-y-3 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-amber-900 text-xs">
                    Cara Mengaktifkan Tabel <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">public.technicians</code> di Supabase:
                  </h5>
                  <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                    Pesan log <em>"Could not find the table 'public.technicians' in the schema cache"</em> menandakan tabel teknisi belum dibuat di database Supabase Anda. Cukup salin script SQL di bawah ini, buka <strong>Supabase Dashboard &gt; SQL Editor</strong>, tempel (paste), lalu klik <strong>Run</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopySql}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Tersalin!' : 'Salin SQL'}</span>
              </button>
            </div>

            <div className="relative">
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-48 border border-slate-800 selection:bg-indigo-500">
                {getTechniciansTableSql()}
              </pre>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-200/60 text-[11px] text-amber-900">
              <span>Setelah menjalankan SQL di Supabase, klik tombol di sebelah kanan untuk memverifikasi.</span>
              <button
                type="button"
                onClick={handleSyncAllToSupabase}
                disabled={isSyncingAll}
                className="flex items-center gap-1 px-3 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingAll ? 'animate-spin' : ''}`} />
                <span>Periksa Ulang &amp; Sinkronkan Sekarang</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Layout: Form & List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Form: Tambah Teknisi / User Baru */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-indigo-600" />
              Tambah Teknisi / User Baru
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Supervisor dapat mendaftarkan teknisi baru beserta email dan kata sandi login.
            </p>
          </div>

          <form onSubmit={handleCreateTechnician} className="space-y-3 text-xs">
            {/* Nama Lengkap */}
            <div>
              <label className="font-bold text-slate-700 block mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Nama Lengkap *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Contoh: Luthfi, Zaky, Yoan"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                required
              />
            </div>

            {/* Kode Teknisi */}
            <div>
              <label className="font-bold text-slate-700 block mb-1 flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                Kode Teknisi / ID
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`Otomatis: TECH-0${technicians.length + 1}`}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Email / Username Login */}
            <div>
              <label className="font-bold text-slate-700 block mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Email / Username Login *
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contoh: zaky@bandara.id atau zaky"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            {/* Kata Sandi (Password) */}
            <div>
              <label className="font-bold text-slate-700 block mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-slate-400" />
                  Kata Sandi (Password) *
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Min. 6 karakter</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password teknisi"
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Role & Status */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="font-bold text-slate-700 block mb-1 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  Peran (Role) *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="technician">Teknisi</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Status Akun</label>
                <div className="flex items-center h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-semibold text-slate-700">{active ? 'Aktif' : 'Nonaktif'}</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Simpan Teknisi Baru</span>
              </button>
            </div>
          </form>

          {/* Supervisor Information Box */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1 mt-2">
            <div className="flex items-center gap-1 font-bold text-slate-800">
              <Info className="w-3.5 h-3.5 text-indigo-500" />
              <span>Panduan Login Teknisi:</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              Setelah disimpan, teknisi dapat langsung masuk melalui layar <strong>Login Teknisi (Email &amp; Sandi)</strong> menggunakan email dan kata sandi yang telah diatur di atas.
            </p>
          </div>
        </div>

        {/* List: Daftar Teknisi & Pengguna */}
        <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
          {/* Header & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600" />
                Daftar Teknisi &amp; Akun Pengguna ({filteredTechnicians.length})
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Kelola kredensial, role, dan izin akses masuk setiap personil teknis.
              </p>
            </div>

            {/* Filter Group */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Semua Peran</option>
                <option value="technician">Teknisi Saja</option>
                <option value="supervisor">Supervisor Saja</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Semua Status</option>
                <option value="ACTIVE">Hanya Aktif</option>
                <option value="INACTIVE">Hanya Nonaktif</option>
              </select>
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan nama, kode teknisi, atau email..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Table / List View */}
          {filteredTechnicians.length === 0 ? (
            <div className="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">Tidak ada data teknisi ditemukan</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Coba sesuaikan kata kunci pencarian atau filter peran yang dipilih.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-3">Personil</th>
                    <th className="py-2.5 px-3">Kode ID</th>
                    <th className="py-2.5 px-3">Email Akun</th>
                    <th className="py-2.5 px-3">Kata Sandi</th>
                    <th className="py-2.5 px-3 text-center">Peran</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTechnicians.map((t) => {
                    const isRevealed = revealedPasswordId === t.id;
                    const techRole = t.role || 'technician';
                    const isSupervisor = techRole === 'supervisor';
                    const initials = t.name
                      .split(' ')
                      .map((n) => n.charAt(0))
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Personil & Avatar */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 ${
                                isSupervisor
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              }`}
                            >
                              {initials}
                            </div>
                            <span className="font-bold text-slate-900">{t.name}</span>
                          </div>
                        </td>

                        {/* Kode ID */}
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            {t.code || `TECH-0${t.id}`}
                          </span>
                        </td>

                        {/* Email */}
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-slate-600 text-[11px]">
                            {t.email || `${t.name.toLowerCase().replace(/\s+/g, '')}@bandara.id`}
                          </span>
                        </td>

                        {/* Password Column */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                              {isRevealed ? (t.password || 'TechnicianPassword123!') : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setRevealedPasswordId(isRevealed ? null : t.id)}
                              className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                              title={isRevealed ? 'Sembunyikan sandi' : 'Lihat sandi'}
                            >
                              {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setChangePasswordTech(t);
                                setNewPassword('');
                                setShowNewPassword(false);
                              }}
                              className="text-indigo-600 hover:text-indigo-800 font-bold text-[10px] ml-1 p-0.5 hover:underline cursor-pointer flex items-center gap-0.5"
                              title="Ganti kata sandi"
                            >
                              <Key className="w-3 h-3" />
                              <span>Ubah</span>
                            </button>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-2.5 px-3 text-center">
                          {isSupervisor ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <ShieldCheck className="w-3 h-3" />
                              Supervisor
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                              <User className="w-3 h-3" />
                              Teknisi
                            </span>
                          )}
                        </td>

                        {/* Status Toggle */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => onToggleTechnicianActive(t.id)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                              t.active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                            }`}
                            title="Klik untuk ubah status aktif/nonaktif"
                          >
                            {t.active ? (
                              <>
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                <span>Aktif</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3 text-slate-400" />
                                <span>Nonaktif</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* Action Buttons */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingTech({ ...t })}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                              title="Edit Data Personil"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmTech(t)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Hapus Personil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL: EDIT TEKNISI */}
      {/* ========================================================= */}
      {editingTech && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                Edit Data Teknisi / User
              </h4>
              <button
                type="button"
                onClick={() => setEditingTech(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  value={editingTech.name}
                  onChange={(e) => setEditingTech({ ...editingTech, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Kode Teknisi</label>
                <input
                  type="text"
                  value={editingTech.code || ''}
                  onChange={(e) => setEditingTech({ ...editingTech, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email / Username Login *</label>
                <input
                  type="text"
                  value={editingTech.email || ''}
                  onChange={(e) => setEditingTech({ ...editingTech, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Peran (Role)</label>
                  <select
                    value={editingTech.role || 'technician'}
                    onChange={(e) => setEditingTech({ ...editingTech, role: e.target.value as Role })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="technician">Teknisi</option>
                    <option value="supervisor">Supervisor</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Status Akun</label>
                  <div className="flex items-center h-[38px] px-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingTech.active}
                        onChange={(e) => setEditingTech({ ...editingTech, active: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="font-semibold text-slate-700">{editingTech.active ? 'Aktif' : 'Nonaktif'}</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTech(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition cursor-pointer shadow-xs"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: GANTI KATA SANDI TEKNISI */}
      {/* ========================================================= */}
      {changePasswordTech && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-600" />
                Ganti Kata Sandi Personil
              </h4>
              <button
                type="button"
                onClick={() => setChangePasswordTech(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <p className="font-bold text-slate-800">Personil: {changePasswordTech.name}</p>
              <p className="text-slate-500 font-mono text-[11px]">Email: {changePasswordTech.email}</p>
            </div>

            <form onSubmit={handleSaveNewPassword} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Kata Sandi Baru * (Min. 6 Karakter)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Masukkan sandi baru..."
                    className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setChangePasswordTech(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition cursor-pointer shadow-xs"
                >
                  Perbarui Kata Sandi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: KONFIRMASI HAPUS TEKNISI */}
      {/* ========================================================= */}
      {deleteConfirmTech && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Konfirmasi Hapus Personil</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Apakah Anda yakin ingin menghapus akun teknisi <strong>{deleteConfirmTech.name}</strong> ({deleteConfirmTech.code})? Personil ini tidak dapat login lagi ke sistem.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmTech(null)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-xs"
              >
                Ya, Hapus Personil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
