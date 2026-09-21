import React, { useState, useEffect } from 'react';
import { Role, ShiftType, NavigationTab } from '../types';
import { formatIndonesianDate } from '../utils/timeFormat';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  LayoutDashboard,
  CheckSquare,
  Wrench,
  FileText,
  Database,
  LogOut,
  Menu,
  X,
  UserCheck,
  Shield,
  Key,
  Cloud,
  CloudOff,
  RefreshCw,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
  Cpu,
  ListCheck,
  Send,
  Camera,
  QrCode,
  Activity,
  History,
  FileSpreadsheet,
} from 'lucide-react';
import { ReportSubTab } from './report/types';

interface SidebarProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  masterSubTab?: 'equipment' | 'location' | 'type' | 'checklist' | 'technician' | 'telegram';
  setMasterSubTab?: (subTab: 'equipment' | 'location' | 'type' | 'checklist' | 'technician' | 'telegram') => void;
  role: Role;
  shift: ShiftType;
  operationalDate: string;
  technicianNames: string[];
  onLogout: () => void;
  onOpenShiftModal: () => void;
  onOpenSupervisorLogin: () => void;
  onLogoutSupervisor?: () => void;
  syncStatus?: 'synced' | 'syncing' | 'offline' | 'error';
  lastSyncTime?: string | null;
  onManualSync?: () => void;
  activeDatasetId?: string;
  onOpenTelegramModal?: () => void;
  onOpenAttendanceModal?: () => void;
  onOpenQrScanner?: () => void;
  onOpenQrPrint?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen?: (open: boolean) => void;
  activeReportSubTab?: ReportSubTab;
  onSelectReportSubTab?: (subTab: ReportSubTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  masterSubTab = 'equipment',
  setMasterSubTab,
  role,
  shift,
  operationalDate,
  technicianNames,
  onLogout,
  onOpenShiftModal,
  onOpenSupervisorLogin,
  onLogoutSupervisor,
  syncStatus = 'synced',
  lastSyncTime = null,
  onManualSync,
  activeDatasetId = 'default',
  onOpenTelegramModal,
  onOpenAttendanceModal,
  onOpenQrScanner,
  onOpenQrPrint,
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse: controlledToggleCollapse,
  isMobileMenuOpen: controlledIsMobileMenuOpen,
  setIsMobileMenuOpen: controlledSetIsMobileMenuOpen,
  activeReportSubTab,
  onSelectReportSubTab,
}) => {
  const [internalMobileMenuOpen, setInternalMobileMenuOpen] = useState(false);
  const isMobileMenuOpen = controlledIsMobileMenuOpen !== undefined ? controlledIsMobileMenuOpen : internalMobileMenuOpen;
  const setIsMobileMenuOpen = controlledSetIsMobileMenuOpen || setInternalMobileMenuOpen;

  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const isCollapsed = controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalCollapsed;

  const [isMasterOpen, setIsMasterOpen] = useState(() => {
    return activeTab === 'master' || activeTab === 'schedule';
  });

  useEffect(() => {
    if (activeTab === 'master' || activeTab === 'schedule') {
      setIsMasterOpen(true);
    }
  }, [activeTab]);

  const toggleCollapse = () => {
    if (controlledToggleCollapse) {
      controlledToggleCollapse();
    } else {
      setInternalCollapsed((prev) => {
        const next = !prev;
        localStorage.setItem('sidebar_collapsed', String(next));
        return next;
      });
    }
  };

  const isCloudMissing = !isSupabaseConfigured();

  const isMasterActive = activeTab === 'master' || activeTab === 'schedule';

  const handleSelectTab = (tab: NavigationTab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const handleSelectMasterSubItem = (
    type: 'schedule' | 'equipment' | 'location' | 'type' | 'checklist' | 'technician' | 'telegram'
  ) => {
    if (type === 'schedule') {
      setActiveTab('schedule');
    } else {
      if (setMasterSubTab) setMasterSubTab(type);
      setActiveTab('master');
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden sticky top-0 z-40 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-800 text-white border-b border-blue-900/40 px-3 py-2 flex items-center justify-between shadow-xs">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-1.5 text-blue-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          aria-label={isMobileMenuOpen ? "Tutup Navigasi" : "Buka Navigasi"}
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/15 text-white border border-white/20">
            Shift {shift}
          </span>
        </div>
      </div>

      {/* Backdrop for Mobile */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-16 md:w-20' : 'w-64'
        } ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Top Section */}
        <div className="p-3 border-b border-slate-200 flex flex-col gap-2">
          {/* Collapse Toggle Button (Desktop) */}
          <div className={`hidden md:flex items-center ${isCollapsed ? 'justify-center' : 'justify-end'} px-1`}>
            <button
              onClick={toggleCollapse}
              title={isCollapsed ? 'Buka Sidebar' : 'Ciutkan Sidebar'}
              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {/* User Session Status Box */}
          {isCollapsed ? (
            <div
              className="p-2 bg-slate-50 rounded-lg border border-slate-200 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-100 transition"
              title={`Sesi: ${role === 'supervisor' ? 'Supervisor' : `Teknisi (${technicianNames.join(', ') || 'Belum'})`}\nShift ${shift} - ${formatIndonesianDate(operationalDate)}`}
              onClick={toggleCollapse}
            >
              {role === 'supervisor' ? (
                <Shield className="w-4 h-4 text-amber-600 mb-0.5" />
              ) : (
                <UserCheck className="w-4 h-4 text-emerald-600 mb-0.5" />
              )}
              <span className="text-[9px] font-bold text-slate-700">S{shift}</span>
            </div>
          ) : (
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Sesi On-Duty
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    role === 'supervisor'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  }`}
                >
                  {role === 'supervisor' ? 'Supervisor' : 'Teknisi'}
                </span>
              </div>

              <p className="text-xs font-bold text-slate-900 truncate" title={technicianNames.join(', ')}>
                {technicianNames.length > 0
                  ? technicianNames.join(', ')
                  : role === 'supervisor'
                  ? 'Supervisor On-Duty'
                  : 'Belum ditentukan'}
              </p>

              <div className="flex items-center justify-between text-[10px] text-slate-600 mt-1.5 pt-1.5 border-t border-slate-200 font-medium">
                <span className="font-semibold text-slate-700">Shift {shift}</span>
                <span>{formatIndonesianDate(operationalDate)}</span>
              </div>

              {/* Cloud Sync Status Indicator */}
              <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex flex-col gap-1 text-[10px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {isCloudMissing ? (
                      <CloudOff className="w-3.5 h-3.5 text-rose-500" />
                    ) : syncStatus === 'syncing' ? (
                      <RefreshCw className="w-3.5 h-3.5 text-slate-600 animate-spin" />
                    ) : syncStatus === 'synced' ? (
                      <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <CloudOff className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    <span
                      className={`font-semibold ${
                        isCloudMissing
                          ? 'text-rose-700'
                          : syncStatus === 'syncing'
                          ? 'text-slate-700'
                          : syncStatus === 'synced'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {isCloudMissing
                        ? 'Config Parsial'
                        : syncStatus === 'syncing'
                        ? 'Sinkronisasi...'
                        : syncStatus === 'synced'
                        ? 'Tersinkron Cloud'
                        : 'Lokal (Offline)'}
                    </span>
                  </div>
                  {!isCloudMissing && onManualSync && (
                    <button
                      onClick={onManualSync}
                      title="Sinkronkan data dengan Cloud"
                      className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Menu Links */}
        <div className={`flex-1 ${isCollapsed ? 'px-1.5' : 'px-2'} py-2.5 space-y-1 overflow-y-auto`}>
          {!isCollapsed && (
            <p className="px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Menu Operasional
            </p>
          )}

          {/* Dashboard (if supervisor) */}
          {role === 'supervisor' && (
            <button
              onClick={() => handleSelectTab('dashboard')}
              title="Dashboard"
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 font-bold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className={`w-4 h-4 ${activeTab === 'dashboard' ? 'text-white' : 'text-slate-500'}`} />
                {!isCollapsed && <span>Dashboard Status</span>}
              </div>
            </button>
          )}

          {/* Preventif */}
          <button
            onClick={() => handleSelectTab('preventive')}
            title="Inspeksi Preventif"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'preventive'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 font-bold'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckSquare className={`w-4 h-4 ${activeTab === 'preventive' ? 'text-white' : 'text-slate-500'}`} />
              {!isCollapsed && <span>Inspeksi Preventif</span>}
            </div>
          </button>

          {/* Corrective */}
          <button
            onClick={() => handleSelectTab('corrective')}
            title="Laporan Corrective"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'corrective'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 font-bold'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Wrench className={`w-4 h-4 ${activeTab === 'corrective' ? 'text-white' : 'text-slate-500'}`} />
              {!isCollapsed && <span>Laporan Corrective</span>}
            </div>
          </button>

          {/* Reports */}
          <button
            onClick={() => {
              handleSelectTab('reports');
              if (onSelectReportSubTab) {
                onSelectReportSubTab('wa');
              }
            }}
            title="Laporan & Ekspor"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'reports' && activeReportSubTab !== 'history'
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText className={`w-4 h-4 ${activeTab === 'reports' && activeReportSubTab !== 'history' ? 'text-white' : 'text-slate-500'}`} />
              {!isCollapsed && <span>Laporan Resmi</span>}
            </div>
          </button>

          {/* Arsip Laporan per Tanggal */}
          <button
            onClick={() => {
              handleSelectTab('reports');
              if (onSelectReportSubTab) {
                onSelectReportSubTab('history');
              }
            }}
            title="Arsip Laporan per Tanggal"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'reports' && activeReportSubTab === 'history'
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <History className={`w-4 h-4 ${activeTab === 'reports' && activeReportSubTab === 'history' ? 'text-white' : 'text-blue-600'}`} />
              {!isCollapsed && <span>Arsip Laporan</span>}
            </div>
            {!isCollapsed && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                activeTab === 'reports' && activeReportSubTab === 'history'
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                Histori
              </span>
            )}
          </button>

          {/* Profil & Riwayat Mesin (Timeline & Spesifikasi Alat) */}
          <button
            onClick={() => handleSelectTab('timeline')}
            title="Profil & Riwayat Mesin"
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25 font-bold'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Activity className={`w-4 h-4 ${activeTab === 'timeline' ? 'text-white' : 'text-slate-500'}`} />
              {!isCollapsed && <span>Profil & Riwayat Mesin</span>}
            </div>
            {!isCollapsed && (
              <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold uppercase">
                Profil
              </span>
            )}
          </button>

          {/* Scan QR Mesin Button */}
          {onOpenQrScanner && (
            <button
              onClick={() => {
                onOpenQrScanner();
                setIsMobileMenuOpen(false);
              }}
              title="Scan QR Mesin"
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-colors cursor-pointer text-slate-700 hover:bg-blue-50 hover:text-blue-700`}
            >
              <div className="flex items-center gap-2.5">
                <Camera className="w-4 h-4 text-blue-600" />
                {!isCollapsed && <span>Scan QR Mesin</span>}
              </div>
              {!isCollapsed && (
                <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold uppercase">
                  Scanner
                </span>
              )}
            </button>
          )}

          {/* Cetak Label QR Mesin Button */}
          {onOpenQrPrint && (
            <button
              onClick={() => {
                onOpenQrPrint();
                setIsMobileMenuOpen(false);
              }}
              title="Cetak Label QR Mesin"
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-colors cursor-pointer text-slate-700 hover:bg-indigo-50 hover:text-indigo-700`}
            >
              <div className="flex items-center gap-2.5">
                <QrCode className="w-4 h-4 text-indigo-600" />
                {!isCollapsed && <span>Cetak Label QR Mesin</span>}
              </div>
              {!isCollapsed && (
                <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold uppercase">
                  Cetak
                </span>
              )}
            </button>
          )}

          {/* Master Data Dropdown Header - Supervisor Only */}
          {role === 'supervisor' && (
            <div className="pt-1.5 border-t border-slate-100 mt-2">
              <button
                onClick={() => {
                  if (isCollapsed) {
                    toggleCollapse();
                    setIsMasterOpen(true);
                  } else {
                    setIsMasterOpen(!isMasterOpen);
                  }
                }}
                title="Master Data & Pengaturan"
                className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isMasterActive && !isMasterOpen
                    ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Database className={`w-4 h-4 ${isMasterActive ? 'text-blue-600' : 'text-slate-500'}`} />
                  {!isCollapsed && <span>Master Data</span>}
                </div>
                {!isCollapsed && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold uppercase">
                      Admin
                    </span>
                    {isMasterOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                )}
              </button>

              {/* Dropdown Items */}
              {isMasterOpen && !isCollapsed && (
                <div className="mt-1 ml-3 pl-2.5 border-l-2 border-blue-200 space-y-1">
                  {/* 1. Jadwal Shift */}
                  <button
                    onClick={() => handleSelectMasterSubItem('schedule')}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      activeTab === 'schedule'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <Calendar className={`w-3.5 h-3.5 ${activeTab === 'schedule' ? 'text-white' : 'text-slate-500'}`} />
                    <span>Jadwal Shift Teknisi</span>
                  </button>

                  {/* 2. Equipment */}
                  <button
                    onClick={() => handleSelectMasterSubItem('equipment')}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      activeTab === 'master' && masterSubTab === 'equipment'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <Wrench className={`w-3.5 h-3.5 ${activeTab === 'master' && masterSubTab === 'equipment' ? 'text-white' : 'text-slate-500'}`} />
                    <span>Daftar Unit Equipment</span>
                  </button>

                  {/* 3. Lokasi */}
                  <button
                    onClick={() => handleSelectMasterSubItem('location')}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      activeTab === 'master' && masterSubTab === 'location'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <MapPin className={`w-3.5 h-3.5 ${activeTab === 'master' && masterSubTab === 'location' ? 'text-white' : 'text-slate-500'}`} />
                    <span>Lokasi Penempatan</span>
                  </button>

                  {/* 4. Jenis Mesin */}
                  <button
                    onClick={() => handleSelectMasterSubItem('type')}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      activeTab === 'master' && masterSubTab === 'type'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <Cpu className={`w-3.5 h-3.5 ${activeTab === 'master' && masterSubTab === 'type' ? 'text-white' : 'text-slate-500'}`} />
                    <span>Jenis Fasilitas Alat</span>
                  </button>

                  {/* 5. Master Checklist */}
                  <button
                    onClick={() => handleSelectMasterSubItem('checklist')}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      activeTab === 'master' && masterSubTab === 'checklist'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <ListCheck className={`w-3.5 h-3.5 ${activeTab === 'master' && masterSubTab === 'checklist' ? 'text-white' : 'text-slate-500'}`} />
                    <span>Item Parameter Checklist</span>
                  </button>

                  {/* 6. Teknisi & Akun Pengguna */}
                  <button
                    onClick={() => handleSelectMasterSubItem('technician')}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      activeTab === 'master' && masterSubTab === 'technician'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <UserCheck className={`w-3.5 h-3.5 ${activeTab === 'master' && masterSubTab === 'technician' ? 'text-white' : 'text-slate-500'}`} />
                    <span>Teknisi &amp; Akun User</span>
                  </button>

                  {/* 7. Pengaturan Telegram Bot & Chat ID */}
                  <button
                    onClick={() => handleSelectMasterSubItem('telegram')}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                      activeTab === 'master' && masterSubTab === 'telegram'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <Send className={`w-3.5 h-3.5 ${activeTab === 'master' && masterSubTab === 'telegram' ? 'text-white' : 'text-slate-500'}`} />
                    <span>Pengaturan Telegram</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Sidebar Action Footer */}
        <div className={`p-2.5 border-t border-slate-200 bg-slate-50 space-y-1.5 ${isCollapsed ? 'px-1.5' : 'p-2.5'}`}>
          {onOpenAttendanceModal && (
            <button
              onClick={() => {
                onOpenAttendanceModal();
                setIsMobileMenuOpen(false);
              }}
              title="Presensi Teknisi (Masuk / Pulang)"
              className={`w-full flex items-center justify-center gap-2 ${isCollapsed ? 'p-2' : 'px-3 py-1.5'} bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold rounded-lg text-xs transition-colors cursor-pointer`}
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              {!isCollapsed && <span>Presensi Masuk / Pulang</span>}
            </button>
          )}

          {onOpenTelegramModal && (
            <button
              onClick={() => {
                onOpenTelegramModal();
                setIsMobileMenuOpen(false);
              }}
              title="Pengaturan Bot Telegram"
              className={`w-full flex items-center justify-center gap-2 ${isCollapsed ? 'p-2' : 'px-3 py-1.5'} bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-semibold rounded-lg text-xs transition-colors cursor-pointer`}
            >
              <Send className="w-3.5 h-3.5 text-sky-600" />
              {!isCollapsed && <span>Bot Telegram</span>}
            </button>
          )}

          {role === 'supervisor' ? (
            <button
              onClick={onLogoutSupervisor}
              title="Keluar Mode Supervisor"
              className={`w-full flex items-center justify-center gap-2 ${isCollapsed ? 'p-2' : 'px-3 py-1.5'} bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold rounded-lg text-xs transition-colors cursor-pointer`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-700" />
              {!isCollapsed && <span>Keluar Supervisor</span>}
            </button>
          ) : (
            <button
              onClick={onOpenSupervisorLogin}
              title="Akses Supervisor"
              className={`w-full flex items-center justify-center gap-2 ${isCollapsed ? 'p-2' : 'px-3 py-1.5'} bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold rounded-lg text-xs transition-colors cursor-pointer shadow-2xs`}
            >
              <Key className="w-3.5 h-3.5 text-slate-700" />
              {!isCollapsed && <span>Akses Supervisor</span>}
            </button>
          )}

          <button
            onClick={onLogout}
            title="Keluar Sesi"
            className={`w-full flex items-center justify-center gap-2 ${isCollapsed ? 'p-2' : 'px-3 py-1.5'} text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 font-semibold rounded-lg text-xs transition-colors cursor-pointer`}
          >
            <LogOut className="w-3.5 h-3.5" />
            {!isCollapsed && <span>Keluar Sistem</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
