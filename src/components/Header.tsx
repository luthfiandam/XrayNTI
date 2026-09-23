import React from 'react';
import { ShiftType, Role } from '../types';
import { formatIndonesianDate } from '../utils/timeFormat';
import { Shield, Clock, Calendar, Users, Key, LogOut, ChevronRight } from 'lucide-react';

interface HeaderProps {
  shift: ShiftType;
  operationalDate: string;
  technicianNames: string[];
  role: Role;
  onOpenShiftModal: () => void;
  onOpenSupervisorLogin: () => void;
  onLogoutSupervisor: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard Status',
  preventive: 'Inspeksi Preventif',
  corrective: 'Laporan Corrective',
  report: 'Laporan Resmi & PDF',
  timeline: 'Profil & Riwayat Mesin',
  master: 'Master Data',
  schedule: 'Jadwal Shift Teknisi',
};

export const Header: React.FC<HeaderProps> = ({
  shift,
  operationalDate,
  technicianNames,
  role,
  onOpenShiftModal,
  onOpenSupervisorLogin,
  onLogoutSupervisor,
  activeTab,
}) => {
  const activeLabel = TAB_LABELS[activeTab] || 'Sistem Operasional';
  const formattedDate = formatIndonesianDate(operationalDate);
  const isPagi = String(shift).toUpperCase() === 'PAGI';
  const shiftText = isPagi ? 'Shift Pagi (07:00 - 15:00)' : 'Shift Malam (15:00 - 23:00)';

  return (
    <header className="bg-white border-b border-slate-200/90 sticky top-0 z-30 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 transition-all">
      {/* Zone 1: Contextual Breadcrumb Trail & Page Title */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <span className="shrink-0 text-slate-700 font-semibold tracking-tight">X-Ray Maintenance</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-900 font-semibold truncate">{activeLabel}</span>
        </div>
      </div>

      {/* Zone 2: Operational Shift Bar */}
      <div className="hidden md:flex items-center gap-3">
        <button
          onClick={onOpenShiftModal}
          title="Klik untuk ubah shift atau tanggal operasional"
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="font-mono text-slate-900 font-semibold">{formattedDate}</span>
          <span className="text-slate-300">|</span>
          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="font-semibold text-slate-800">{shift}</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200/80 px-2.5 py-1.5 rounded-lg max-w-[280px]">
          <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="truncate font-medium text-slate-800">
            {technicianNames.length > 0 ? technicianNames.join(', ') : 'Belum diset'}
          </span>
        </div>
      </div>

      {/* Zone 3: Role & Access Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {role === 'supervisor' ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-700 rounded-md text-xs font-semibold">
              <Shield className="w-3.5 h-3.5 text-amber-600" />
              <span>Supervisor Mode</span>
            </span>
            <button
              onClick={onLogoutSupervisor}
              title="Keluar dari Akses Supervisor"
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar SPV</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenSupervisorLogin}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Login Supervisor</span>
          </button>
        )}
      </div>
    </header>
  );
};

