import React, { useState, useMemo } from 'react';
import { HistoricalReportSummary } from '../../services/reportService';
import { ShiftType } from '../../types';
import {
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  Wrench,
  Users,
  FileText,
  Download,
  Send,
  Eye,
  Clock,
  ChevronRight,
  ShieldAlert,
  CalendarRange,
  RotateCcw,
  Database,
} from 'lucide-react';

/**
 * Safely formats timestamp strings (ISO datetime or time strings) into readable HH.mm format
 */
function formatSafeSubmissionTime(raw?: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'Invalid Date' || trimmed.includes('1899')) return null;

  // If already in HH:mm or HH.mm format
  if (/^\d{1,2}[:.]\d{2}([:.]\d{2})?$/.test(trimmed)) {
    return trimmed.slice(0, 5).replace(':', '.');
  }

  // Try parsing ISO or datetime string with Jakarta timezone
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(':', '.');
  }

  // Fallback regex match for HH:mm
  const match = trimmed.match(/(\d{2})[:.](\d{2})/);
  if (match) {
    return `${match[1]}.${match[2]}`;
  }

  return null;
}

interface HistoricalReportListSectionProps {
  historicalReports: HistoricalReportSummary[];
  selectedDate?: string;
  selectedShift?: ShiftType;
  onSelectReport: (rawDate: string, shift: ShiftType) => void;
  onDownloadPdfDirect?: (rawDate: string, shift: ShiftType) => void;
  onResetToCurrentSession?: () => void;
  isCurrentSessionSelected?: boolean;
}

export const HistoricalReportListSection: React.FC<HistoricalReportListSectionProps> = ({
  historicalReports,
  selectedDate = '',
  selectedShift = 'Pagi',
  onSelectReport,
  onDownloadPdfDirect,
  onResetToCurrentSession,
  isCurrentSessionSelected = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [shiftFilter, setShiftFilter] = useState<'ALL' | 'Pagi' | 'Siang' | 'Malam'>('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState<'ALL' | '7DAYS' | '30DAYS' | 'THIS_MONTH'>('ALL');

  // Filter logic - guaranteed newest to oldest (paling baru ke paling lama)
  const filteredReports = useMemo(() => {
    const list = historicalReports.filter((item) => {
      // 1. Search term match (date string, formatted date, or technician names)
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase().trim();
        const matchesDate = item.rawDate.toLowerCase().includes(term);
        const matchesFmtDate = item.formattedDate.toLowerCase().includes(term);
        const matchesTech = item.technicianNames.some((t) => t.toLowerCase().includes(term));
        if (!matchesDate && !matchesFmtDate && !matchesTech) {
          return false;
        }
      }

      // 2. Shift Filter
      if (shiftFilter !== 'ALL' && item.shift !== shiftFilter) {
        return false;
      }

      // 3. Date Range Filter
      if (dateRangeFilter !== 'ALL') {
        const reportDate = new Date(item.rawDate);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - reportDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (dateRangeFilter === '7DAYS' && diffDays > 7) return false;
        if (dateRangeFilter === '30DAYS' && diffDays > 30) return false;
        if (dateRangeFilter === 'THIS_MONTH') {
          if (
            reportDate.getMonth() !== today.getMonth() ||
            reportDate.getFullYear() !== today.getFullYear()
          ) {
            return false;
          }
        }
      }

      return true;
    });

    return list.sort((a, b) => {
      const timeA = new Date(a.rawDate).getTime();
      const timeB = new Date(b.rawDate).getTime();
      if (!isNaN(timeA) && !isNaN(timeB) && timeB !== timeA) {
        return timeB - timeA;
      }
      return b.rawDate.localeCompare(a.rawDate);
    });
  }, [historicalReports, searchTerm, shiftFilter, dateRangeFilter]);

  // Aggregate Stats
  const totalReportsCount = historicalReports.length;
  const totalPreventiveUnits = useMemo(
    () => historicalReports.reduce((sum, r) => sum + r.preventiveEquipmentsCount, 0),
    [historicalReports]
  );
  const totalCorrectiveCount = useMemo(
    () => historicalReports.reduce((sum, r) => sum + r.correctiveCount, 0),
    [historicalReports]
  );

  return (
    <div className="space-y-4">
      {/* Active Selected Date Notice Bar */}
      {!isCurrentSessionSelected && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-800 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                  Menampilkan Laporan Histori
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900 border border-amber-300">
                  {selectedShift}
                </span>
              </div>
              <p className="text-xs font-semibold text-amber-800 mt-0.5">
                Tanggal: <strong className="text-amber-950 font-bold">{selectedDate}</strong> (Seluruh tampilan export di tab atas menggunakan data histori tanggal ini)
              </p>
            </div>
          </div>

          {onResetToCurrentSession && (
            <button
              onClick={onResetToCurrentSession}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Kembali ke Sesi Shift Saat Ini</span>
            </button>
          )}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Laporan</p>
            <p className="text-lg font-extrabold text-slate-800 leading-none mt-0.5">{totalReportsCount}</p>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Sesi Terekam</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preventive Checked</p>
            <p className="text-lg font-extrabold text-slate-800 leading-none mt-0.5">{totalPreventiveUnits}</p>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Unit Alat</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Corrective Reports</p>
            <p className="text-lg font-extrabold text-slate-800 leading-none mt-0.5">{totalCorrectiveCount}</p>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Penanganan</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tampilan Filter</p>
            <p className="text-lg font-extrabold text-slate-800 leading-none mt-0.5">{filteredReports.length}</p>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Laporan Terpilih</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari tanggal (contoh: 2026-09-20), atau nama teknisi..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Shift Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {(['ALL', 'Pagi', 'Siang', 'Malam'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setShiftFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  shiftFilter === s
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s === 'ALL' ? 'Semua Shift' : `Shift ${s}`}
              </button>
            ))}
          </div>
        </div>

        {/* Date Range Preset Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Filter className="w-3 h-3" /> Rentang Waktu:
          </span>
          {[
            { id: 'ALL', label: 'Semua Tanggal' },
            { id: '7DAYS', label: '7 Hari Terakhir' },
            { id: '30DAYS', label: '30 Hari Terakhir' },
            { id: 'THIS_MONTH', label: 'Bulan Ini' },
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => setDateRangeFilter(preset.id as any)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                dateRangeFilter === preset.id
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Source Provenance Notice */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>
            <strong>Sumber Data:</strong> Supabase (Tabel <code className="text-slate-800 font-mono font-bold">preventive_records</code> &amp; <code className="text-slate-800 font-mono font-bold">corrective_records</code>). Dikelompokkan per tanggal operasional &amp; shift.
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-medium">
          Authoritative Source of Truth
        </span>
      </div>

      {/* Historical Reports Cards Grid */}
      {filteredReports.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
          <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700">Tidak Ada Laporan Ditemukan</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Tidak ada arsip laporan yang cocok dengan filter pencarian tanggal atau shift yang ditentukan.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredReports.map((item) => {
            const isSelected =
              item.rawDate === selectedDate && item.shift === selectedShift;

            return (
              <div
                key={item.dateKey}
                className={`bg-white rounded-2xl border transition-all p-4 flex flex-col justify-between gap-3 shadow-xs ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                        Shift {item.shift}
                      </span>

                      {item.isCurrentSession && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse">
                          ● Sesi Shift Saat Ini
                        </span>
                      )}

                      {isSelected && !item.isCurrentSession && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Sedang Dipilih
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-extrabold text-slate-900 leading-snug">
                      {item.formattedDate}
                    </h3>
                    <p className="text-[11px] font-medium text-slate-500">
                      Kode Operational Date: <code className="text-slate-700 font-mono font-bold">{item.rawDate}</code>
                    </p>
                  </div>

                  <button
                    onClick={() => onSelectReport(item.rawDate, item.shift)}
                    className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700'
                    }`}
                    title="Buka Laporan Tanggal Ini"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Detail</span>
                  </button>
                </div>

                {/* Metrics Breakdown */}
                {item.isCurrentSession && item.preventiveCount === 0 && item.correctiveCount === 0 ? (
                  <div className="bg-emerald-50/70 border border-emerald-200/80 p-2.5 rounded-xl text-xs flex items-center gap-2.5 text-emerald-800">
                    <Clock className="w-4 h-4 text-emerald-600 shrink-0 animate-pulse" />
                    <div>
                      <p className="font-bold text-emerald-950">Shift Sedang Berjalan</p>
                      <p className="text-[11px] text-emerald-700">Belum ada checklist atau laporan gangguan yang disubmit pada shift ini.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Preventive
                      </span>
                      <p className="font-extrabold text-slate-800">
                        {item.preventiveEquipmentsCount} Unit ({item.preventiveCount} Record)
                      </p>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-amber-600" /> Corrective
                      </span>
                      <p className="font-extrabold text-slate-800">
                        {item.correctiveCount} Laporan ({item.correctiveResolvedCount} Selesai)
                      </p>
                    </div>
                  </div>
                )}

                {/* Technicians & Timestamps Footer */}
                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 gap-2">
                  <div
                    className="flex items-center gap-1.5 min-w-0 max-w-[65%]"
                    title={`Teknisi Petugas: ${item.technicianNames.join(', ')}`}
                  >
                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-700 truncate">
                      {item.technicianNames.length === 1 && item.technicianNames[0] === 'Teknisi Tidak Tercatat' ? (
                        <span className="italic text-slate-400 font-normal">Teknisi Tidak Tercatat</span>
                      ) : (
                        item.technicianNames.join(', ')
                      )}
                    </span>
                  </div>

                  {(() => {
                    const formattedTime = formatSafeSubmissionTime(item.lastSubmittedAt);
                    if (!formattedTime) {
                      return item.isCurrentSession ? (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                          Belum submit checklist
                        </span>
                      ) : null;
                    }
                    return (
                      <div
                        className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-md shrink-0"
                        title={`Waktu kirim checklist/laporan terakhir pada shift ini: ${formattedTime} WIB`}
                      >
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Submit: {formattedTime} WIB</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onSelectReport(item.rawDate, item.shift)}
                    className="flex-1 py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs transition-all border border-blue-200/80 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Lihat & Ekspor Laporan</span>
                  </button>

                  {onDownloadPdfDirect && (
                    <button
                      onClick={() => onDownloadPdfDirect(item.rawDate, item.shift)}
                      className="py-1.5 px-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      title="Download Dokumen PDF Resmi"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
