import React, { useState, useMemo } from 'react';
import { CorrectiveReport, Equipment, EquipmentType, Location } from '../../types';
import { formatIndonesianDate, formatTimeRange } from '../../utils/timeFormat';
import {
  Search,
  Filter,
  Calendar,
  Wrench,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';

interface CorrectiveReportsTableProps {
  correctiveReports: CorrectiveReport[];
  equipments: Equipment[];
  equipmentTypes?: EquipmentType[];
  locations: Location[];
  onSelectReportForWa?: (report: CorrectiveReport, formattedWaText: string) => void;
}

export const CorrectiveReportsTable: React.FC<CorrectiveReportsTableProps> = ({
  correctiveReports,
  equipments,
  equipmentTypes = [],
  locations,
  onSelectReportForWa,
}) => {
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEquipmentId, setFilterEquipmentId] = useState<string>('all');
  const [filterLocationId, setFilterLocationId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);

  // Pagination States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Filtered Data Computation
  const filteredReports = useMemo(() => {
    return (correctiveReports || []).filter((report) => {
      // 1. Search term (code, problem, action, created_by, notes)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const eq = equipments.find((e) => e.id === report.equipment_id);
        const loc = locations.find((l) => l.id === report.location_id);

        const matchCode = report.corrective_code?.toLowerCase().includes(query);
        const matchProblem = report.problem_description?.toLowerCase().includes(query);
        const matchAction = report.action_taken?.toLowerCase().includes(query);
        const matchTech = (report.created_by || '').toLowerCase().includes(query) ||
          (report.technicians || []).some((t) => t.toLowerCase().includes(query));
        const matchEqName = eq?.name.toLowerCase().includes(query);
        const matchLocName = loc?.name.toLowerCase().includes(query);

        if (!matchCode && !matchProblem && !matchAction && !matchTech && !matchEqName && !matchLocName) {
          return false;
        }
      }

      // 2. Equipment Filter
      if (filterEquipmentId !== 'all') {
        if (report.equipment_id !== Number(filterEquipmentId)) {
          return false;
        }
      }

      // 3. Location Filter
      if (filterLocationId !== 'all') {
        if (report.location_id !== Number(filterLocationId)) {
          return false;
        }
      }

      // 4. Status / Result Filter
      if (filterStatus !== 'all') {
        if (report.result !== filterStatus) {
          return false;
        }
      }

      // 5. Date Range Filter
      const reportDate = report.corrective_date || (report.created_at ? report.created_at.slice(0, 10) : '');
      if (filterStartDate && reportDate) {
        if (reportDate < filterStartDate) return false;
      }
      if (filterEndDate && reportDate) {
        if (reportDate > filterEndDate) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort newest date & id first
      const dateA = a.corrective_date || a.created_at || '';
      const dateB = b.corrective_date || b.created_at || '';
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      return b.id - a.id;
    });
  }, [
    correctiveReports,
    searchTerm,
    filterEquipmentId,
    filterLocationId,
    filterStatus,
    filterStartDate,
    filterEndDate,
    equipments,
    locations,
  ]);

  // Reset pagination when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterEquipmentId, filterLocationId, filterStatus, filterStartDate, filterEndDate, pageSize]);

  // Pagination calculation
  const totalItems = filteredReports.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedReports = filteredReports.slice(startIndex, endIndex);

  // Active filter count
  const activeFilterCount = [
    filterEquipmentId !== 'all',
    filterLocationId !== 'all',
    filterStatus !== 'all',
    Boolean(filterStartDate),
    Boolean(filterEndDate),
    Boolean(searchTerm.trim()),
  ].filter(Boolean).length;

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterEquipmentId('all');
    setFilterLocationId('all');
    setFilterStatus('all');
    setFilterStartDate('');
    setFilterEndDate('');
    setCurrentPage(1);
  };

  // Helper to generate WA formatted text
  const buildWaText = (report: CorrectiveReport) => {
    const eq = (equipments || []).find((e) => e && e.id === report.equipment_id);
    const dateObj = new Date(report.corrective_date || Date.now());

    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];

    const dayName = days[dateObj.getDay()];
    const dateNum = String(dateObj.getDate()).padStart(2, '0');
    const monthName = months[dateObj.getMonth()];
    const year = dateObj.getFullYear();
    const dateFormatted = `${dayName}, ${dateNum} ${monthName} ${year}`;

    const techs = report.technicians && report.technicians.length > 0
      ? report.technicians
      : [report.created_by || 'Teknisi'];
    const techListFormatted = techs.map((t) => `- *${t}*`).join('\n');

    const actionLines = (report.action_taken || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => (line.startsWith('-') ? line : `- ${line}`))
      .join('\n');

    return `Corrective Maintenance
Tanggal : ${dateFormatted}
Jam : ${formatTimeRange(report.start_time || '', report.end_time || '')}

Teknisi: 
${techListFormatted}

Alat: ${eq?.name || 'Security Equipment'}
Kerusakan: ${report.problem_description}
Tindakan:
${actionLines || '- Melakukan perbaikan peralatan'}
Hasil : ${report.result_text || 'Mesin sudah bisa digunakan dengan normal 🙏🏻'}
Notes : ${report.notes || '-'}`;
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
      {/* Table Section Header */}
      <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-slate-900 text-base">
                Daftar &amp; Tabel Laporan Corrective
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {totalItems} Data
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Filter dan telusuri riwayat perbaikan peralatan per alat, lokasi, tanggal, atau status perbaikan.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {activeFilterCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Reset Semua Filter"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset ({activeFilterCount})</span>
              </button>
            )}

            <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tabel
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kartu
              </button>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 mt-4">
          {/* 1. Global Search */}
          <div className="lg:col-span-3 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari kode, kerusakan, teknisi..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
            />
          </div>

          {/* 2. Filter Equipment */}
          <div className="lg:col-span-3">
            <select
              value={filterEquipmentId}
              onChange={(e) => setFilterEquipmentId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
            >
              <option value="all">Semua Peralatan ({equipments.length})</option>
              {equipments.map((eq) => {
                const loc = locations.find((l) => l.id === eq.location_id);
                return (
                  <option key={eq.id} value={eq.id}>
                    {eq.name} ({loc?.name || 'Area'})
                  </option>
                );
              })}
            </select>
          </div>

          {/* 3. Filter Location */}
          <div className="lg:col-span-2">
            <select
              value={filterLocationId}
              onChange={(e) => setFilterLocationId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
            >
              <option value="all">Semua Lokasi ({locations.length})</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Filter Status */}
          <div className="lg:col-span-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
            >
              <option value="all">Semua Status Hasil</option>
              <option value="Resolved">Resolved (Selesai/Normal)</option>
              <option value="Temporary Fix">Temporary Fix (Sementara)</option>
              <option value="Pending Sparepart">Pending Sparepart</option>
            </select>
          </div>

          {/* 5. Date Range */}
          <div className="lg:col-span-2 flex items-center gap-1">
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              title="Tanggal Awal"
              className="w-1/2 px-2 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              title="Tanggal Akhir"
              className="w-1/2 px-2 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Table View */}
      {viewMode === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Kode &amp; Tanggal</th>
                <th className="py-3 px-4">Peralatan &amp; Lokasi</th>
                <th className="py-3 px-4">Kerusakan (Problem)</th>
                <th className="py-3 px-4">Tindakan Perbaikan</th>
                <th className="py-3 px-4 w-32 text-center">Status</th>
                <th className="py-3 px-4 w-28 text-center">Teknisi</th>
                <th className="py-3 px-4 w-24 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedReports.length > 0 ? (
                paginatedReports.map((report, idx) => {
                  const eq = equipments.find((e) => e.id === report.equipment_id);
                  const loc = locations.find((l) => l.id === report.location_id);
                  const isExpanded = expandedReportId === report.id;
                  const itemIndex = startIndex + idx + 1;

                  return (
                    <React.Fragment key={report.id}>
                      <tr className={`hover:bg-blue-50/40 transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}>
                        <td className="py-3 px-4 text-center font-bold text-slate-400">
                          {itemIndex}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-blue-700 text-[11px]">
                            {report.corrective_code}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 font-medium">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{formatIndonesianDate(report.corrective_date, { shortMonth: true })}</span>
                          </div>
                          {(report.start_time || report.end_time) && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {formatTimeRange(report.start_time || '', report.end_time || '')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900 text-xs">
                            {eq?.name || 'Equipment'}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{loc?.name || 'Area Bandara'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-slate-800 font-medium line-clamp-2 max-w-[200px]" title={report.problem_description}>
                            {report.problem_description}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-slate-700 font-normal line-clamp-2 max-w-[220px]" title={report.action_taken}>
                            {report.action_taken}
                          </p>
                          {report.evidences && report.evidences.length > 0 && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                              📷 {report.evidences.length} Foto
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-tight ${
                              report.result === 'Resolved'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : report.result === 'Temporary Fix'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {report.result}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-xs font-semibold text-slate-800 block truncate max-w-[100px]" title={report.created_by}>
                            {report.created_by || (report.technicians && report.technicians[0]) || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const text = buildWaText(report);
                                if (onSelectReportForWa) {
                                  onSelectReportForWa(report, text);
                                }
                              }}
                              title="Salin / Lihat Format WhatsApp"
                              className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                              title="Detail Laporan"
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'
                              }`}
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                          <td colSpan={8} className="p-4 sm:p-5">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-100">
                                    {report.corrective_code}
                                  </span>
                                  <span className="font-extrabold text-sm text-slate-900">{eq?.name}</span>
                                  <span className="text-xs text-slate-500">({loc?.name})</span>
                                </div>
                                <div className="text-xs text-slate-500 font-medium">
                                  Teknisi Bertugas: <strong className="text-slate-800">{(report.technicians || [report.created_by]).join(', ')}</strong>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                                    Uraian Kerusakan / Gejala:
                                  </span>
                                  <p className="text-slate-800 font-medium whitespace-pre-line leading-relaxed">
                                    {report.problem_description}
                                  </p>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                                    Tindakan Perbaikan &amp; Sparepart:
                                  </span>
                                  <p className="text-slate-800 font-medium whitespace-pre-line leading-relaxed">
                                    {report.action_taken}
                                  </p>
                                  {report.result_text && (
                                    <div className="mt-2 pt-2 border-t border-slate-200 text-slate-600">
                                      <strong className="text-slate-700">Hasil: </strong>
                                      <span>{report.result_text}</span>
                                    </div>
                                  )}
                                  {report.notes && report.notes !== '-' && (
                                    <div className="mt-1 text-slate-500 text-[11px]">
                                      <strong>Notes: </strong>
                                      <span>{report.notes}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Evidences Photos */}
                              {report.evidences && report.evidences.length > 0 && (
                                <div className="pt-2">
                                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider block mb-2">
                                    Dokumentasi Perbaikan ({report.evidences.length} Foto):
                                  </span>
                                  <div className="flex flex-wrap gap-2.5">
                                    {report.evidences.map((url, i) => (
                                      <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 hover:opacity-90 transition block shadow-2xs group relative"
                                      >
                                        <img
                                          src={url}
                                          alt={`Dokumentasi ${i + 1}`}
                                          className="w-full h-full object-cover"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 text-xs italic">
                    Tidak ditemukan data laporan corrective yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Cards View for Mobile or Compact */
        <div className="p-4 space-y-3">
          {paginatedReports.length > 0 ? (
            paginatedReports.map((report) => {
              const eq = equipments.find((e) => e.id === report.equipment_id);
              const loc = locations.find((l) => l.id === report.location_id);
              const waText = buildWaText(report);

              return (
                <div
                  key={report.id}
                  className="p-4 border border-slate-200 rounded-xl bg-white hover:border-blue-200 transition space-y-3 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                        {report.corrective_code}
                      </span>
                      <span className="font-extrabold text-sm text-slate-900">{eq?.name}</span>
                      <span className="text-xs text-slate-500">({loc?.name})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">
                        {formatIndonesianDate(report.corrective_date, { shortMonth: true })}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          report.result === 'Resolved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {report.result}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <strong className="text-slate-400 block mb-0.5 uppercase tracking-wider text-[10px]">
                        Kerusakan:
                      </strong>
                      <p className="text-slate-800 font-medium">{report.problem_description}</p>
                    </div>

                    <div>
                      <strong className="text-slate-400 block mb-0.5 uppercase tracking-wider text-[10px]">
                        Tindakan Perbaikan:
                      </strong>
                      <p className="text-slate-800 font-medium whitespace-pre-line">{report.action_taken}</p>
                    </div>
                  </div>

                  {report.evidences && report.evidences.length > 0 && (
                    <div className="pt-1">
                      <strong className="text-slate-400 block mb-1 text-[10px] uppercase tracking-wider">
                        Foto Dokumentasi ({report.evidences.length} Foto):
                      </strong>
                      <div className="flex flex-wrap gap-2">
                        {report.evidences.map((imgUrl, i) => (
                          <a
                            key={i}
                            href={imgUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 block bg-slate-100"
                          >
                            <img
                              src={imgUrl}
                              alt={`Evidence ${i + 1}`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                    <div>
                      Teknisi: <strong className="text-slate-800">{(report.technicians || [report.created_by]).join(', ')}</strong>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectReportForWa) {
                          onSelectReportForWa(report, waText);
                        }
                      }}
                      className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition inline-flex items-center gap-1.5 border border-emerald-200 cursor-pointer self-start sm:self-auto"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin / Lihat Format WA</span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              Tidak ditemukan data laporan corrective yang sesuai kriteria filter.
            </div>
          )}
        </div>
      )}

      {/* Pagination Footer */}
      <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span>Menampilkan</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value={5}>5 baris</option>
            <option value={10}>10 baris</option>
            <option value={20}>20 baris</option>
            <option value={50}>50 baris</option>
          </select>
          <span>
            dari <strong className="text-slate-900">{totalItems}</strong> laporan
          </span>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCurrentPage(1)}
            disabled={validCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            title="Halaman Pertama"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={validCurrentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            title="Halaman Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 py-1 font-bold text-xs text-slate-800">
            Hal. {validCurrentPage} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={validCurrentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            title="Halaman Berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage(totalPages)}
            disabled={validCurrentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            title="Halaman Terakhir"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
