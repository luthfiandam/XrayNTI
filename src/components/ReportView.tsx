import React, { useState, useMemo } from 'react';
import { StructuredReportData } from '../types';
import { generateWhatsAppReportText, getHistoricalReportList } from '../services/reportService';
import { generatePhotoCollageFile, CollageItem } from '../utils/collageService';
import { shareReport, openWhatsAppFallback } from '../utils/webShareUtils';
import { downloadReportPdf, shareReportPdf } from '../pdf/pdfService';
import { getReportPdfArchivePathAndFilename } from '../utils/pdfArchiveUtils';
import { formatTimeRange } from '../utils/timeFormat';
import { toCanonicalShiftCode } from '../utils/contextFilter';
import { getEvidenceUrl } from '../utils/evidenceUtils';
import { toast } from './Toast';
import {
  ReportViewProps,
  ReportSubTab,
  ReportSubTabNavigation,
  WhatsAppReportSection,
  ExcelExportSection,
  PdfExportSection,
  HistoricalReportListSection,
} from './report';

export { type ReportViewProps };

/**
 * ReportView
 * Orchestrates multi-format reporting: WhatsApp Text & Collages, CSV/Excel Export,
 * Official Print/PDF Export, and Historical Reports archive.
 * References: src/assets/logopt.png
 */
export const ReportView: React.FC<ReportViewProps> = ({
  structuredData,
  preventiveEntries = [],
  correctiveReports = [],
  equipments = [],
  equipmentTypes = [],
  technicians = [],
  locations = [],
  currentSession,
  onSelectHistoricalReport,
  selectedHistoricalDate,
  selectedHistoricalShift,
  isHistoricalActive,
  onResetToCurrentSession,
  activeSubTab: externalSubTab,
  onSubTabChange,
}) => {
  const [internalSubTab, setInternalSubTab] = useState<ReportSubTab>('wa');
  const activeSubTab = externalSubTab || internalSubTab;
  const setActiveSubTab = (tab: ReportSubTab) => {
    setInternalSubTab(tab);
    if (onSubTabChange) onSubTabChange(tab);
  };
  const [copiedFreqId, setCopiedFreqId] = useState<number | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [selectedPdfFreqId, setSelectedPdfFreqId] = useState<number>(1);
  const [sharingFreqId, setSharingFreqId] = useState<number | null>(null);

  const historicalReports = useMemo(() => {
    return getHistoricalReportList(preventiveEntries, correctiveReports, technicians, currentSession);
  }, [preventiveEntries, correctiveReports, technicians, currentSession]);

  const submittedFrequencyIds: number[] = Array.from(
    new Set<number>(
      structuredData.entries_by_type.flatMap((g) =>
        g.entries
          .map((e) => e.checklist_frequency_id)
          .filter((id): id is number => typeof id === 'number')
      )
    )
  ).sort((a: number, b: number) => a - b);

  const handleCopyForInterval = (text: string, freqId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedFreqId(freqId);
    toast.success('Format WhatsApp Disalin', {
      message: 'Format teks laporan rutin shift telah disalin ke clipboard.',
      badge: 'Laporan Rutin',
    });
    setTimeout(() => {
      setCopiedFreqId(null);
    }, 2000);
  };

  const handleShareReportForInterval = async (text: string, freqId?: number) => {
    const targetFreqId = freqId || 1;
    setSharingFreqId(targetFreqId);
    toast.info('Menyiapkan Kolase Foto', {
      message: 'Memproses dokumentasi foto checklist & teks laporan...',
      duration: 2500,
      badge: 'Laporan Rutin',
    });
    try {
      const photosList: CollageItem[] = [];
      structuredData.entries_by_type.forEach((group) => {
        group.entries.forEach((item) => {
          if (!freqId || item.checklist_frequency_id === freqId) {
            if (item.evidences && item.evidences.length > 0) {
              item.evidences.forEach((ev, idx) => {
                const url = getEvidenceUrl(ev);
                if (url) {
                  photosList.push({
                    key: `${item.equipment_name}-${idx}`,
                    title: `${item.equipment_name}${item.evidences && item.evidences.length > 1 ? ` (${idx + 1})` : ''}`,
                    dataUrl: url,
                  });
                }
              });
            }
          }
        });
      });

      let collageFile: File | undefined = undefined;
      if (photosList.length > 0) {
        try {
          const archive = getReportPdfArchivePathAndFilename(
            structuredData.operational_date,
            structuredData.shift,
            targetFreqId
          );
          const fileName = archive.fileName.replace('.pdf', ' - Kolase.jpg');
          collageFile = await generatePhotoCollageFile(
            {
              photos: photosList,
              date: structuredData.operational_date,
              shift: structuredData.shift,
              technicians: structuredData.technicians,
            },
            fileName
          );
        } catch (colErr) {
          console.warn('[WebShare] Gagal membuat file kolase, melanjutkan share text-only:', colErr);
        }
      }

      await shareReport({
        title: `Laporan Checklist Shift ${structuredData.shift}`,
        text,
        files: collageFile ? [collageFile] : undefined,
      });
      toast.success('Laporan Siap Dibagikan', {
        message: 'Laporan checklist & kolase foto siap dikirimkan.',
        badge: 'WhatsApp',
      });
    } catch (err) {
      console.error('[WebShare] Error sharing report:', err);
      openWhatsAppFallback(text);
    } finally {
      setSharingFreqId(null);
    }
  };

  const handleShareCorrectiveReport = async (text: string) => {
    setSharingFreqId(999);
    toast.info('Menyiapkan Laporan Gangguan', {
      message: 'Memproses kolase foto perbaikan kerusakan...',
      duration: 2500,
      badge: 'Corrective',
    });
    try {
      const photosList: CollageItem[] = [];
      if (structuredData.corrective_entries && structuredData.corrective_entries.length > 0) {
        structuredData.corrective_entries.forEach((item) => {
          if (item.evidences && item.evidences.length > 0) {
            item.evidences.forEach((ev, idx) => {
              const url = getEvidenceUrl(ev);
              if (url) {
                photosList.push({
                  key: `${item.equipment_name}-${idx}`,
                  title: `${item.equipment_name}${item.evidences && item.evidences.length > 1 ? ` (${idx + 1})` : ''}`,
                  dataUrl: url,
                });
              }
            });
          }
        });
      }

      let collageFile: File | undefined = undefined;
      if (photosList.length > 0) {
        try {
          const canonicalShift = toCanonicalShiftCode(structuredData.shift);
          const fileName = `${structuredData.operational_date} (${canonicalShift}) - Kolase Corrective Maintenance.jpg`;
          collageFile = await generatePhotoCollageFile(
            {
              photos: photosList,
              date: structuredData.operational_date,
              shift: structuredData.shift,
              technicians: structuredData.technicians,
            },
            fileName
          );
        } catch (colErr) {
          console.warn('[WebShare] Gagal membuat file kolase corrective, melanjutkan share text-only:', colErr);
        }
      }

      await shareReport({
        title: 'Laporan Corrective Maintenance',
        text,
        files: collageFile ? [collageFile] : undefined,
      });
      toast.success('Laporan Gangguan Siap Dibagikan', {
        message: 'Laporan kerusakan & kolase foto perbaikan siap dikirimkan.',
        badge: 'WhatsApp',
      });
    } catch (err) {
      console.error('[WebShare] Error sharing corrective report:', err);
      openWhatsAppFallback(text);
    } finally {
      setSharingFreqId(null);
    }
  };

  const handleDownloadExcel = () => {
    let csv = `LAPORAN PREVENTIVE MAINTENANCE HARIAN PT. NARARYA TEKNOLOGI INDONESIA\n`;
    csv += `Tanggal,${structuredData.operational_date},Shift,${structuredData.shift}\n`;
    csv += `Jam,${formatTimeRange(structuredData.start_time, structuredData.end_time)}\n`;
    csv += `Teknisi,${structuredData.technicians.join('; ')}\n\n`;

    csv += `Sequence,Category,Equipment Name,View Type,Status,Notes\n`;

    structuredData.entries_by_type.forEach((group) => {
      group.entries.forEach((item) => {
        csv += `${item.sequence},${group.type_code},"${item.equipment_name}",${item.view_type || '-'},OK,"${item.notes.replace(/"/g, '""')}"\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Preventive_${structuredData.operational_date.replace(/ /g, '_')}_Shift_${structuredData.shift}.csv`;
    a.click();
    toast.success('Ekspor CSV Berhasil', {
      message: `File laporan spreadsheet untuk tanggal ${structuredData.operational_date} telah diunduh.`,
      badge: 'Ekspor Data',
    });
  };

  const handleGeneratePDF = async (action: 'download' | 'share', freqId?: number) => {
    const targetFreqId = freqId !== undefined ? freqId : selectedPdfFreqId;
    setActiveSubTab('pdf');
    setIsGeneratingPDF(true);
    toast.info('Memproses Dokumen PDF', {
      message: 'Sedang merender lembar kerja pemeliharaan resmi...',
      duration: 3000,
      badge: 'PDF Resmi',
    });
    try {
      if (action === 'share') {
        await shareReportPdf(structuredData, targetFreqId);
        toast.success('PDF Siap Dibagikan', {
          message: 'Dokumen lembar kerja pemeliharaan resmi siap dikirim.',
          badge: 'PDF Resmi',
        });
      } else {
        await downloadReportPdf(structuredData, targetFreqId);
        toast.success('PDF Laporan Terunduh', {
          message: 'Dokumen lembar kerja pemeliharaan resmi berhasil disimpan.',
          badge: 'PDF Resmi',
        });
      }
    } catch (reactPdfErr) {
      console.error('React-PDF vector generation failed:', reactPdfErr);
      const errorMsg = reactPdfErr instanceof Error ? reactPdfErr.message : String(reactPdfErr);
      toast.error('Gagal Membuat PDF', {
        message: errorMsg,
        badge: 'Gagal Ekspor',
      });
      alert(`Gagal membuat dokumen PDF: ${errorMsg}. Silakan coba kembali atau gunakan tombol Print jika ingin mencetak halaman langsung.`);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-Tab Selectors & Actions */}
      <ReportSubTabNavigation
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        isGeneratingPDF={isGeneratingPDF}
        onGeneratePdf={handleGeneratePDF}
        historicalCount={historicalReports.length}
      />

      {/* WhatsApp Preview Mode */}
      {activeSubTab === 'wa' && (
        <WhatsAppReportSection
          structuredData={structuredData}
          submittedFrequencyIds={submittedFrequencyIds}
          copiedFreqId={copiedFreqId}
          sharingFreqId={sharingFreqId}
          onCopyInterval={handleCopyForInterval}
          onShareInterval={handleShareReportForInterval}
          onShareCorrective={handleShareCorrectiveReport}
        />
      )}

      {/* Excel Table Mode */}
      {activeSubTab === 'excel' && (
        <ExcelExportSection
          structuredData={structuredData}
          submittedFrequencyIds={submittedFrequencyIds}
          onDownloadCsv={handleDownloadExcel}
        />
      )}

      {/* PDF Printable Document View */}
      {activeSubTab === 'pdf' && (
        <PdfExportSection
          structuredData={structuredData}
          submittedFrequencyIds={submittedFrequencyIds}
          selectedPdfFreqId={selectedPdfFreqId}
          setSelectedPdfFreqId={setSelectedPdfFreqId}
          isGeneratingPDF={isGeneratingPDF}
          onGeneratePdf={handleGeneratePDF}
        />
      )}

      {/* Historical Report Archives List */}
      {activeSubTab === 'history' && (
        <HistoricalReportListSection
          historicalReports={historicalReports}
          selectedDate={selectedHistoricalDate || structuredData.operational_date}
          selectedShift={selectedHistoricalShift || structuredData.shift}
          onSelectReport={(rawDate, shift) => {
            if (onSelectHistoricalReport) {
              onSelectHistoricalReport(rawDate, shift);
            }
            toast.info('Laporan Histori Dimuat', {
              message: `Menampilkan data laporan untuk tanggal ${rawDate} (${shift}). Seluruh format ekspor WhatsApp, Excel, dan PDF telah diperbarui.`,
              badge: 'Histori Laporan',
            });
            setActiveSubTab('wa');
          }}
          onDownloadPdfDirect={(rawDate, shift) => {
            if (onSelectHistoricalReport) {
              onSelectHistoricalReport(rawDate, shift);
            }
            setActiveSubTab('pdf');
            toast.info('Buka Tab PDF', {
              message: `Memuat lembar kerja pemeliharaan untuk tanggal ${rawDate} (${shift}). Klik tombol Download PDF untuk menyimpan file.`,
              badge: 'PDF Resmi',
            });
          }}
          onResetToCurrentSession={onResetToCurrentSession}
          isCurrentSessionSelected={!isHistoricalActive}
        />
      )}
    </div>
  );
};
