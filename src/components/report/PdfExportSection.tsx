import React from 'react';
import { Download } from 'lucide-react';
import { StructuredReportData, ReportEvidenceItem } from '../../types';
import { formatTimeRange } from '../../utils/timeFormat';
import { extractValidPhotoUrls, getSingleCollagePhotoUrl } from '../../utils/evidenceUtils';
import { INTERVAL_NAMES } from './types';
import logoNararya from '../../assets/logopt.png';

interface PdfExportSectionProps {
  structuredData: StructuredReportData;
  submittedFrequencyIds: number[];
  selectedPdfFreqId: number;
  setSelectedPdfFreqId: (freqId: number) => void;
  isGeneratingPDF: boolean;
  onGeneratePdf: (action: 'download' | 'share', freqId?: number) => void;
}

export const PdfExportSection: React.FC<PdfExportSectionProps> = ({
  structuredData,
  submittedFrequencyIds,
  selectedPdfFreqId,
  setSelectedPdfFreqId,
  isGeneratingPDF,
  onGeneratePdf,
}) => {
  const preventivePdfRows = structuredData.entries_by_type.flatMap((group) =>
    group.entries
      .filter((e) => !selectedPdfFreqId || e.checklist_frequency_id === selectedPdfFreqId)
      .map((e) => ({
        kind: 'preventive' as const,
        equipment_name: e.equipment_name,
        type_code: group.type_code,
        view_type: e.view_type,
        notes: e.notes,
        evidences: e.evidences || [],
        problem_description: '',
        action_taken: '',
        result: '',
        result_text: '',
        time_range: '',
        checklist_frequency_id: e.checklist_frequency_id,
        equipment_id: e.equipment_id,
      }))
  );

  const includeCorrective = !selectedPdfFreqId || selectedPdfFreqId === 1;
  const correctivePdfRows = includeCorrective
    ? (structuredData.corrective_entries || []).map((c) => ({
        kind: 'corrective' as const,
        equipment_name: c.equipment_name,
        type_code: c.type_code,
        view_type: 'single' as const,
        notes: c.notes,
        evidences: c.evidences || [],
        problem_description: c.problem_description,
        action_taken: c.action_taken,
        result: c.result,
        result_text: c.result_text,
        time_range: c.time_range,
      }))
    : [];

  const allPdfRows = [...preventivePdfRows, ...correctivePdfRows];

  const formatDayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    if (days.some((day) => dateStr.startsWith(day))) {
      return dateStr;
    }
    const months = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];

    let d: Date | null = null;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    } else {
      d = new Date(dateStr);
    }

    if (!d || isNaN(d.getTime())) {
      const now = new Date();
      return `${days[now.getDay()]}, ${dateStr}`;
    }

    return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const renderCorrectiveUraian = (problemText: string, actionText: string) => {
    const formatListItems = (text: string) => {
      if (!text || !text.trim()) return [];
      return (
        text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => line.replace(/^[\s\-\*•\d\.\)]+/, '').trim() || line)
      );
    };

    const problemItems = formatListItems(problemText);
    const actionItems = formatListItems(actionText);

    return (
      <div style={{ textAlign: 'left', fontSize: '9.5px', lineHeight: '1.25', color: '#000000', padding: '2px 0' }}>
        <div style={{ fontWeight: 'bold' }}>Kerusakan :</div>
        <ul style={{ margin: '1px 0 4px 0', paddingLeft: '12px', listStyleType: 'disc' }}>
          {problemItems.length > 0 ? (
            problemItems.map((item, idx) => <li key={idx}>{item}</li>)
          ) : (
            <li>-</li>
          )}
        </ul>
        <div style={{ fontWeight: 'bold', marginTop: '3px' }}>Tindakan :</div>
        <ul style={{ margin: '1px 0 0 0', paddingLeft: '12px', listStyleType: 'disc' }}>
          {actionItems.length > 0 ? (
            actionItems.map((item, idx) => <li key={idx}>{item}</li>)
          ) : (
            <li>-</li>
          )}
        </ul>
      </div>
    );
  };

  const rawTechs =
    structuredData.technicians && structuredData.technicians.length > 0
      ? structuredData.technicians
      : ['LUTHFIANDA MUZAKI SULAEMAN'];

  const CHUNK_SIZE = 6;
  const pageChunks: (typeof allPdfRows)[] = [];
  for (let i = 0; i < allPdfRows.length; i += CHUNK_SIZE) {
    pageChunks.push(allPdfRows.slice(i, i + CHUNK_SIZE));
  }
  if (pageChunks.length === 0) {
    pageChunks.push([]);
  }

  return (
    <>
      {/* print:hidden Card List to trigger specific Interval PDF exports */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs mb-6 print:hidden space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">
            Export Laporan PDF Resmi per Interval
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {submittedFrequencyIds.map((freqId) => {
            const freqName = INTERVAL_NAMES[freqId] || 'PENGUJIAN';
            const isSelected = selectedPdfFreqId === freqId;
            return (
              <div
                key={freqId}
                className={`p-4 border rounded-2xl transition-all space-y-3 flex flex-col justify-between ${
                  isSelected
                    ? 'border-slate-800 bg-slate-50/50 ring-1 ring-slate-800'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 text-sm block">
                      Preventive {freqName}
                    </span>
                    {freqId === 1 && (
                      <span className="text-[10px] text-emerald-600 font-bold block">
                        + Corrective Maintenance
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-800 text-white rounded">
                      Preview Aktif
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedPdfFreqId(freqId);
                      onGeneratePdf('download', freqId);
                    }}
                    disabled={isGeneratingPDF}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export PDF</span>
                  </button>

                  <button
                    onClick={() => setSelectedPdfFreqId(freqId)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        id="pdf-report-document"
        className="bg-white p-2.5 sm:px-3.5 sm:py-4 max-w-[760px] mx-auto shadow-sm border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-none space-y-4 box-border"
        style={{
          backgroundColor: '#ffffff',
          color: '#000000',
          fontFamily: "'Times New Roman', Times, serif",
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        {pageChunks.map((chunk, pageIndex) => {
          return (
            <div
              key={pageIndex}
              className="pdf-page"
              style={{
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                width: '100%',
                pageBreakAfter: pageIndex < pageChunks.length - 1 ? 'always' : 'auto',
                breakAfter: pageIndex < pageChunks.length - 1 ? 'page' : 'auto',
                paddingBottom: pageIndex < pageChunks.length - 1 ? '10px' : '0',
              }}
            >
              {/* Header Table (Logo + Title) */}
              <table
                style={{
                  width: '100%',
                  tableLayout: 'fixed',
                  borderCollapse: 'collapse',
                  border: '0.5px solid #000000',
                  fontSize: '11px',
                  color: '#000000',
                  backgroundColor: '#ffffff',
                  fontFamily: "'Times New Roman', Times, serif",
                }}
              >
                <tbody>
                  <tr>
                    {/* Compact Logo Column */}
                    <td
                      style={{
                        width: '18%',
                        border: '0.5px solid #000000',
                        padding: '3px 4px',
                        verticalAlign: 'middle',
                        textAlign: 'center',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
                        <img
                          src={logoNararya}
                          alt="Logo PT Nararya Teknologi Indonesia"
                          style={{
                            height: '14mm',
                            maxHeight: '60px',
                            width: 'auto',
                            maxWidth: '80%',
                            objectFit: 'contain',
                            display: 'block',
                            margin: '0 auto',
                          }}
                        />
                      </div>
                    </td>

                    {/* Title Column */}
                    <td
                      style={{
                        width: '82%',
                        border: '0.5px solid #000000',
                        padding: '6px 8px',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 'bold',
                          fontSize: '18px',
                          color: '#000000',
                          letterSpacing: '0.02em',
                          textTransform: 'uppercase',
                          fontFamily: "'Times New Roman', Times, serif",
                          lineHeight: '1.1',
                        }}
                      >
                        PT. NARARYA TEKNOLOGI INDONESIA
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Operational Info Table */}
              <table
                style={{
                  width: '100%',
                  tableLayout: 'fixed',
                  borderCollapse: 'collapse',
                  border: '0.5px solid #000000',
                  borderTop: 'none',
                  fontSize: '11px',
                  color: '#000000',
                  backgroundColor: '#ffffff',
                  fontFamily: "'Times New Roman', Times, serif",
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        width: '18%',
                        border: '0.5px solid #000000',
                        padding: '1.5mm 6px',
                        fontWeight: 'bold',
                        backgroundColor: '#ffffff',
                        fontSize: '11px',
                        boxSizing: 'border-box',
                      }}
                    >
                      Hari / Tanggal
                    </td>
                    <td
                      style={{
                        width: '42%',
                        border: '0.5px solid #000000',
                        padding: '1.5mm 6px',
                        fontSize: '11px',
                        boxSizing: 'border-box',
                      }}
                    >
                      : {formatDayDate(structuredData.operational_date)}
                    </td>
                    <td
                      style={{
                        width: '12%',
                        border: '0.5px solid #000000',
                        padding: '1.5mm 6px',
                        fontWeight: 'bold',
                        backgroundColor: '#ffffff',
                        fontSize: '11px',
                        boxSizing: 'border-box',
                      }}
                    >
                      Shift
                    </td>
                    <td
                      style={{
                        width: '28%',
                        border: '0.5px solid #000000',
                        padding: '1.5mm 6px',
                        fontWeight: 'bold',
                        color: '#000000',
                        fontSize: '11px',
                        boxSizing: 'border-box',
                      }}
                    >
                      : {structuredData.shift ? structuredData.shift.toUpperCase() : 'PAGI'}
                    </td>
                  </tr>

                  {Array.from({ length: Math.max(1, Math.ceil(rawTechs.length / 2)) }).map((_, r, arr) => {
                    const leftIdx = r * 2;
                    const rightIdx = r * 2 + 1;
                    const leftTech = rawTechs[leftIdx];
                    const rightTech = rawTechs[rightIdx];

                    return (
                      <tr key={r}>
                        {r === 0 && (
                          <td
                            rowSpan={arr.length}
                            style={{
                              width: '18%',
                              border: '0.5px solid #000000',
                              padding: '1.5mm 6px',
                              fontWeight: 'bold',
                              backgroundColor: '#ffffff',
                              verticalAlign: 'middle',
                              fontSize: '11px',
                              boxSizing: 'border-box',
                            }}
                          >
                            Teknisi On Duty
                          </td>
                        )}
                        <td
                          style={{
                            width: '42%',
                            border: '0.5px solid #000000',
                            padding: '1.5mm 6px',
                            fontSize: '11px',
                            verticalAlign: 'middle',
                            boxSizing: 'border-box',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ width: '10px', flexShrink: 0 }}>{r === 0 ? ':' : ''}</span>
                            <span>
                              {rawTechs.length > 1
                                ? `${leftIdx + 1}. ${leftTech}`
                                : leftTech}
                            </span>
                          </div>
                        </td>
                        <td
                          colSpan={2}
                          style={{
                            width: '40%',
                            border: '0.5px solid #000000',
                            padding: '1.5mm 6px',
                            fontSize: '11px',
                            verticalAlign: 'middle',
                            boxSizing: 'border-box',
                          }}
                        >
                          {rightTech ? (
                            <span>{`${rightIdx + 1}. ${rightTech}`}</span>
                          ) : (
                            <span>&nbsp;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Main Inspection Equipment Table */}
              <table
                style={{
                  width: '100%',
                  tableLayout: 'fixed',
                  borderCollapse: 'collapse',
                  border: '0.5px solid #000000',
                  borderTop: 'none',
                  fontSize: '11px',
                  textAlign: 'left',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  fontFamily: "'Times New Roman', Times, serif",
                  boxSizing: 'border-box',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#ffffff', color: '#000000', fontWeight: 'bold', textAlign: 'center' }}>
                    <th style={{ padding: '2mm 2px', border: '0.5px solid #000000', width: '4%', color: '#000000', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}>No</th>
                    <th style={{ padding: '2mm 3px', border: '0.5px solid #000000', width: '11%', color: '#000000', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}>Tipe Alat</th>
                    <th style={{ padding: '2mm 3px', border: '0.5px solid #000000', width: '13%', color: '#000000', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}>Jenis Kegiatan</th>
                    <th style={{ padding: '2mm 2px', border: '0.5px solid #000000', width: '6%', color: '#000000', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}>Waktu</th>
                    <th style={{ padding: '2mm 3px', border: '0.5px solid #000000', width: '15%', color: '#000000', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}>Uraian Kegiatan</th>
                    <th style={{ padding: '2mm 3px', border: '0.5px solid #000000', width: '23%', color: '#000000', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}>Notes</th>
                    <th style={{ padding: '2mm 3px', border: '0.5px solid #000000', width: '28%', color: '#000000', fontSize: '11px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}>Dokumentasi</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((row, itemIdx) => {
                    const globalIdx = pageIndex * CHUNK_SIZE + itemIdx;

                    const rawEvidences = row.evidences || [];
                    // Strictly display HANYA 1 FOTO KOLASE in the Dokumentasi column
                    const displayCollageUrl = getSingleCollagePhotoUrl(rawEvidences);

                    let defaultNote = `${row.type_code} bisa digunakan dengan normal`;
                    if (row.type_code === 'XRAY') defaultNote = 'Xray bisa digunakan dengan normal';
                    if (row.type_code === 'WTMD') defaultNote = 'WTMD bisa digunakan dengan normal';
                    if (row.type_code === 'HHMD') defaultNote = 'HHMD bisa digunakan dengan normal';

                    const eqNameUpper = row.equipment_name.toUpperCase();
                    const typeUpper = row.type_code.toUpperCase();
                    const displayEquipmentName = eqNameUpper.includes(typeUpper)
                      ? eqNameUpper
                      : `${typeUpper} ${eqNameUpper}`;

                    const formattedEquipmentName = displayEquipmentName.split(' ').join('\n');

                    const isPreventiveRow = row.kind === 'preventive';

                    let rowTimeStr = formatTimeRange(structuredData.start_time, structuredData.end_time);
                    if (row.kind === 'corrective' && row.time_range) {
                      rowTimeStr = row.time_range.includes('-') || row.time_range.includes('WIB')
                        ? row.time_range
                        : `${row.time_range} WIB`;
                    }

                    return (
                      <tr key={itemIdx} style={{ backgroundColor: '#ffffff' }}>
                        <td style={{ padding: '1.5mm 2px', border: '0.5px solid #000000', textAlign: 'center', fontWeight: 'normal', verticalAlign: 'middle', fontSize: '11px', boxSizing: 'border-box' }}>
                          {globalIdx + 1}
                        </td>
                        <td style={{ padding: '1.5mm 3px', border: '0.5px solid #000000', fontWeight: 'normal', textTransform: 'uppercase', verticalAlign: 'middle', textAlign: 'center', color: '#000000', whiteSpace: 'pre-line', fontSize: '10.5px', lineHeight: '1.25', wordBreak: 'break-word', boxSizing: 'border-box' }}>
                          {formattedEquipmentName}
                        </td>
                        <td style={{ padding: '1.5mm 3px', border: '0.5px solid #000000', fontWeight: 'normal', verticalAlign: 'middle', textAlign: 'center', fontSize: '10.5px', boxSizing: 'border-box' }}>
                          {isPreventiveRow
                            ? `Preventive Maintenance ${INTERVAL_NAMES[row.checklist_frequency_id || selectedPdfFreqId || 1] || 'Harian'}`
                            : 'Corrective Maintenance'}
                        </td>

                        {/* Waktu column */}
                        <td
                          style={{
                            padding: '1.5mm 2px',
                            border: '0.5px solid #000000',
                            fontWeight: 'normal',
                            verticalAlign: 'middle',
                            textAlign: 'center',
                            fontSize: '10.5px',
                            boxSizing: 'border-box',
                            backgroundColor: '#ffffff',
                          }}
                        >
                          {rowTimeStr}
                        </td>

                        {/* Uraian Kegiatan */}
                        <td style={{ padding: '1.5mm 3px', border: '0.5px solid #000000', fontWeight: 'normal', verticalAlign: 'middle', textAlign: isPreventiveRow ? 'center' : 'left', fontSize: '10.5px', boxSizing: 'border-box' }}>
                          {isPreventiveRow
                            ? 'Melakukan Pembersihan dan Check List'
                            : renderCorrectiveUraian(row.problem_description, row.action_taken)}
                        </td>

                        {/* Notes */}
                        <td style={{ padding: '1.5mm 3px', border: '0.5px solid #000000', fontWeight: 'normal', verticalAlign: 'middle', textAlign: 'center', fontSize: '10.5px', boxSizing: 'border-box' }}>
                          {isPreventiveRow ? (
                            row.notes || defaultNote
                          ) : (
                            <div style={{ textAlign: 'left', fontSize: '10px', lineHeight: '1.3', color: '#000000' }}>
                              {row.result_text || row.notes || 'Equipment sudah dapat digunakan kembali dengan normal.'}
                            </div>
                          )}
                        </td>

                        {/* Dokumentasi: HANYA 1 FOTO KOLASE */}
                        <td style={{ padding: '2px', border: '0.5px solid #000000', textAlign: 'center', verticalAlign: 'middle', boxSizing: 'border-box' }}>
                          {displayCollageUrl ? (
                            <img
                              src={displayCollageUrl}
                              alt="Dokumentasi Kolase"
                              style={{
                                width: '100%',
                                height: '100%',
                                minHeight: '75px',
                                maxHeight: '140px',
                                objectFit: 'cover',
                                border: 'none',
                                boxSizing: 'border-box',
                                display: 'block',
                                margin: '0 auto',
                              }}
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: '10px', color: '#888888' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Official Signature Footer - ONLY on the LAST page */}
              {pageIndex === pageChunks.length - 1 && (
                <div
                  className="signature-block"
                  style={{
                    marginTop: '18px',
                    padding: '4px 0',
                    border: 'none',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    textAlign: 'center',
                    fontSize: '11px',
                    color: '#000000',
                    backgroundColor: '#ffffff',
                    fontFamily: "'Times New Roman', Times, serif",
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 'bold', fontSize: '11px', color: '#000000', margin: 0 }}>Pelaksana</p>
                    <p style={{ fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', color: '#000000', marginTop: '2px', marginBottom: 0 }}>
                      PT. NARARYA TEKNOLOGI INDONESIA
                    </p>
                    <div style={{ height: '64px' }}></div>
                    <p style={{ fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', color: '#000000', fontSize: '11px', letterSpacing: '0.02em', margin: 0 }}>
                      LUTHFIANDA MUZAKI SULAEMAN
                    </p>
                  </div>

                  <div>
                    <p style={{ fontWeight: 'bold', fontSize: '11px', color: '#000000', margin: 0 }}>Pengawas Pekerjaan</p>
                    <p style={{ fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', color: '#000000', marginTop: '2px', marginBottom: 0 }}>
                      FACILITY MAINTENANCE - ELEKTRONIKA
                    </p>
                    <div style={{ height: '64px' }}></div>
                    <p style={{ fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', color: '#000000', fontSize: '11px', letterSpacing: '0.02em', margin: 0 }}>
                      RIZKO ENDRA NUGRAHA
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};
