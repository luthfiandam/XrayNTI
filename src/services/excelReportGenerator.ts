import ExcelJS from 'exceljs';
import { StructuredReportData } from '../types';
import { formatTimeRange } from '../utils/timeFormat';
import { getSingleCollagePhotoUrl } from '../utils/evidenceUtils';
import { INTERVAL_NAMES } from '../components/report/types';

export interface ExcelExportOptions {
  freqId?: number; // 0 or undefined for All
  includeCorrective?: boolean;
  logoUrl?: string;
  logoBase64?: string;
}

const formatDayDate = (dateStr: string): string => {
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

/**
 * Helper to fetch logo asset as base64 string for ExcelJS embed
 */
async function fetchLogoBase64(options?: ExcelExportOptions): Promise<string | null> {
  if (options?.logoBase64) {
    return options.logoBase64;
  }

  try {
    if (typeof window !== 'undefined') {
      const url = options?.logoUrl || '/src/assets/logopt.png';
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (result && result.includes(',')) {
            resolve(result.split(',')[1]);
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } else {
      // In Node.js environment
      try {
        const fs = await import('fs');
        const path = await import('path');
        const logoPath = path.join(process.cwd(), 'src', 'assets', 'logopt.png');
        if (fs.existsSync(logoPath)) {
          return fs.readFileSync(logoPath).toString('base64');
        }
      } catch {
        return null;
      }
    }
  } catch (err) {
    console.warn('[ExcelReport] Could not load logo for Excel embed:', err);
    return null;
  }
  return null;
}

/**
 * Generates an official Excel (.xlsx) report matching the PDF layout:
 * - Kop PT. Nararya Teknologi Indonesia
 * - Operational metadata (Hari/Tanggal, Shift, Teknisi On Duty)
 * - Structured table (No, Tipe Alat, Jenis Kegiatan, Waktu, Uraian Kegiatan, Notes, Dokumentasi)
 * - Hyperlinks to evidence photos in Google Drive
 * - Official sign-off block (Pelaksana & Pengawas Pekerjaan)
 */
export async function generateOfficialExcelReport(
  structuredData: StructuredReportData,
  options: ExcelExportOptions = {}
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PT. Nararya Teknologi Indonesia - NTI Maintenance';
  workbook.created = new Date();

  const freqId = options.freqId || 0;
  const freqName = freqId && INTERVAL_NAMES[freqId] ? INTERVAL_NAMES[freqId] : 'SEMUA';
  const sheetName = `Laporan ${freqName}`.substring(0, 31);
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  // Setup Column Widths
  worksheet.columns = [
    { key: 'colA', width: 6 },  // No
    { key: 'colB', width: 20 }, // Tipe Alat
    { key: 'colC', width: 26 }, // Jenis Kegiatan
    { key: 'colD', width: 18 }, // Waktu
    { key: 'colE', width: 34 }, // Uraian Kegiatan
    { key: 'colF', width: 30 }, // Notes
    { key: 'colG', width: 32 }, // Dokumentasi Foto
  ];

  // Try to embed company logo
  const logoBase64 = await fetchLogoBase64(options);
  if (logoBase64) {
    try {
      const imageId = workbook.addImage({
        base64: logoBase64,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0.1, row: 0.1 },
        ext: { width: 110, height: 42 },
      });
    } catch (e) {
      console.warn('[ExcelReport] Error inserting image into sheet:', e);
    }
  }

  // --- Row 1: Header PT Title ---
  worksheet.mergeCells('A1:G1');
  const cellA1 = worksheet.getCell('A1');
  cellA1.value = 'PT. NARARYA TEKNOLOGI INDONESIA';
  cellA1.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FF000000' } };
  cellA1.alignment = { vertical: 'middle', horizontal: 'center' };
  cellA1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).height = 36;

  // Apply border to A1:G1
  for (let c = 1; c <= 7; c++) {
    worksheet.getRow(1).getCell(c).border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  // --- Row 2: Subtitle ---
  worksheet.mergeCells('A2:G2');
  const cellA2 = worksheet.getCell('A2');
  cellA2.value = freqId
    ? `LAPORAN PREVENTIVE MAINTENANCE ${freqName.toUpperCase()}${freqId === 1 ? ' & CORRECTIVE MAINTENANCE' : ''}`
    : 'LAPORAN PREVENTIVE & CORRECTIVE MAINTENANCE';
  cellA2.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  cellA2.alignment = { vertical: 'middle', horizontal: 'center' };
  cellA2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  worksheet.getRow(2).height = 22;

  for (let c = 1; c <= 7; c++) {
    worksheet.getRow(2).getCell(c).border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  // --- Row 3: Operational Date & Shift ---
  worksheet.mergeCells('A3:B3');
  const cellA3 = worksheet.getCell('A3');
  cellA3.value = 'Hari / Tanggal';
  cellA3.font = { name: 'Times New Roman', size: 10.5, bold: true };
  cellA3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  worksheet.mergeCells('C3:D3');
  const cellC3 = worksheet.getCell('C3');
  cellC3.value = `: ${formatDayDate(structuredData.operational_date)}`;
  cellC3.font = { name: 'Times New Roman', size: 10.5 };
  cellC3.alignment = { vertical: 'middle', horizontal: 'left' };

  const cellE3 = worksheet.getCell('E3');
  cellE3.value = 'Shift';
  cellE3.font = { name: 'Times New Roman', size: 10.5, bold: true };
  cellE3.alignment = { vertical: 'middle', horizontal: 'left' };

  worksheet.mergeCells('F3:G3');
  const cellF3 = worksheet.getCell('F3');
  cellF3.value = `: ${(structuredData.shift || 'Pagi').toUpperCase()}`;
  cellF3.font = { name: 'Times New Roman', size: 10.5, bold: true };
  cellF3.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(3).height = 20;

  for (let c = 1; c <= 7; c++) {
    worksheet.getRow(3).getCell(c).border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  // --- Row 4: Technicians On Duty ---
  const rawTechs =
    structuredData.technicians && structuredData.technicians.length > 0
      ? structuredData.technicians
      : ['LUTHFIANDA MUZAKI SULAEMAN'];

  const techRowsCount = Math.max(1, Math.ceil(rawTechs.length / 2));
  let currentRowNum = 4;

  for (let r = 0; r < techRowsCount; r++) {
    const leftIdx = r * 2;
    const rightIdx = r * 2 + 1;
    const leftTech = rawTechs[leftIdx];
    const rightTech = rawTechs[rightIdx];

    worksheet.mergeCells(`A${currentRowNum}:B${currentRowNum}`);
    const cellA = worksheet.getCell(`A${currentRowNum}`);
    cellA.value = r === 0 ? 'Teknisi On Duty' : '';
    cellA.font = { name: 'Times New Roman', size: 10.5, bold: true };
    cellA.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    worksheet.mergeCells(`C${currentRowNum}:D${currentRowNum}`);
    const cellC = worksheet.getCell(`C${currentRowNum}`);
    cellC.value = leftTech ? `${r === 0 ? ': ' : '  '}${leftIdx + 1}. ${leftTech}` : ': -';
    cellC.font = { name: 'Times New Roman', size: 10.5 };
    cellC.alignment = { vertical: 'middle', horizontal: 'left' };

    worksheet.mergeCells(`E${currentRowNum}:G${currentRowNum}`);
    const cellE = worksheet.getCell(`E${currentRowNum}`);
    cellE.value = rightTech ? `${rightIdx + 1}. ${rightTech}` : '';
    cellE.font = { name: 'Times New Roman', size: 10.5 };
    cellE.alignment = { vertical: 'middle', horizontal: 'left' };

    worksheet.getRow(currentRowNum).height = 20;

    for (let c = 1; c <= 7; c++) {
      worksheet.getRow(currentRowNum).getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    }

    currentRowNum++;
  }

  // --- Table Header Row ---
  const headerRowNum = currentRowNum;
  const headerRow = worksheet.getRow(headerRowNum);
  headerRow.values = [
    'No',
    'Tipe Alat',
    'Jenis Kegiatan',
    'Waktu',
    'Uraian Kegiatan',
    'Notes',
    'Dokumentasi Foto',
  ];
  headerRow.height = 26;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Times New Roman', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  currentRowNum++;

  // Collect Table Rows (Preventive & Corrective)
  const preventiveRows = structuredData.entries_by_type.flatMap((group) =>
    group.entries
      .filter((e) => !freqId || e.checklist_frequency_id === freqId)
      .map((e) => ({
        kind: 'preventive' as const,
        equipment_name: e.equipment_name,
        type_code: group.type_code,
        notes: e.notes,
        evidences: e.evidences || [],
        checklist_frequency_id: e.checklist_frequency_id,
        time_range: formatTimeRange(structuredData.start_time, structuredData.end_time),
      }))
  );

  const includeCorrective = options.includeCorrective ?? (!freqId || freqId === 1);
  const correctiveRows = includeCorrective
    ? (structuredData.corrective_entries || []).map((c) => ({
        kind: 'corrective' as const,
        equipment_name: c.equipment_name,
        type_code: c.type_code,
        notes: c.notes,
        evidences: c.evidences || [],
        problem_description: c.problem_description,
        action_taken: c.action_taken,
        result: c.result,
        result_text: c.result_text,
        time_range: c.time_range ? `${c.time_range} WIB` : formatTimeRange(structuredData.start_time, structuredData.end_time),
        checklist_frequency_id: 1,
      }))
    : [];

  const allTableRows = [...preventiveRows, ...correctiveRows];

  if (allTableRows.length === 0) {
    // Empty state row
    worksheet.mergeCells(`A${currentRowNum}:G${currentRowNum}`);
    const emptyCell = worksheet.getCell(`A${currentRowNum}`);
    emptyCell.value = 'Tidak ada catatan checklist atau perbaikan pada filter ini.';
    emptyCell.font = { name: 'Times New Roman', size: 10, italic: true };
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(currentRowNum).height = 28;
    for (let c = 1; c <= 7; c++) {
      worksheet.getRow(currentRowNum).getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
    }
    currentRowNum++;
  } else {
    allTableRows.forEach((row, idx) => {
      const isPreventive = row.kind === 'preventive';
      const eqNameUpper = row.equipment_name.toUpperCase();
      const typeUpper = row.type_code.toUpperCase();
      const displayEqName = eqNameUpper.includes(typeUpper)
        ? eqNameUpper
        : `${typeUpper} ${eqNameUpper}`;

      const jenisKegiatan = isPreventive
        ? `Preventive Maintenance ${INTERVAL_NAMES[row.checklist_frequency_id || freqId || 1] || 'Harian'}`
        : 'Corrective Maintenance';

      let uraianKegiatan = 'Melakukan Pembersihan dan Check List';
      if (!isPreventive) {
        const corr = row as any;
        const prob = corr.problem_description ? `Kerusakan: ${corr.problem_description}` : '';
        const act = corr.action_taken ? `Tindakan: ${corr.action_taken}` : '';
        uraianKegiatan = [prob, act].filter(Boolean).join('\n\n') || '-';
      }

      let defaultNote = `${row.type_code} bisa digunakan dengan normal`;
      if (row.type_code === 'XRAY') defaultNote = 'Xray bisa digunakan dengan normal';
      if (row.type_code === 'WTMD') defaultNote = 'WTMD bisa digunakan dengan normal';
      if (row.type_code === 'HHMD') defaultNote = 'HHMD bisa digunakan dengan normal';

      let notesText = row.notes || defaultNote;
      if (!isPreventive) {
        const corr = row as any;
        notesText = corr.result_text || corr.notes || 'Equipment sudah dapat digunakan kembali dengan normal.';
      }

      // Documentation link
      const displayCollageUrl = getSingleCollagePhotoUrl(row.evidences || []);

      const rowValues = [
        idx + 1,
        displayEqName,
        jenisKegiatan,
        row.time_range,
        uraianKegiatan,
        notesText,
        displayCollageUrl ? 'Buka Foto Dokumentasi ↗' : '-',
      ];

      const r = worksheet.getRow(currentRowNum);
      r.values = rowValues;
      r.height = !isPreventive ? 55 : 36;

      // Alignments & Fonts
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      r.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
      r.getCell(5).alignment = { vertical: 'middle', horizontal: isPreventive ? 'center' : 'left', wrapText: true };
      r.getCell(6).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      r.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };

      for (let c = 1; c <= 7; c++) {
        const cell = r.getCell(c);
        cell.font = { name: 'Times New Roman', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
      }

      // Hyperlink for photo documentation cell
      if (displayCollageUrl) {
        const docCell = r.getCell(7);
        docCell.value = {
          text: 'Buka Foto Dokumentasi ↗',
          hyperlink: displayCollageUrl,
        };
        docCell.font = {
          name: 'Times New Roman',
          size: 10,
          color: { argb: 'FF2563EB' }, // Blue color
          underline: true,
        };
      }

      currentRowNum++;
    });
  }

  // --- Signature Block (Pelaksana & Pengawas Pekerjaan) ---
  currentRowNum++; // Blank row spacing
  worksheet.getRow(currentRowNum).height = 16;
  currentRowNum++;

  const sigStartRow = currentRowNum;

  // Title rows
  worksheet.mergeCells(`B${sigStartRow}:C${sigStartRow}`);
  const pelaksanaTitle = worksheet.getCell(`B${sigStartRow}`);
  pelaksanaTitle.value = 'Pelaksana';
  pelaksanaTitle.font = { name: 'Times New Roman', size: 11, bold: true };
  pelaksanaTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`E${sigStartRow}:F${sigStartRow}`);
  const pengawasTitle = worksheet.getCell(`E${sigStartRow}`);
  pengawasTitle.value = 'Pengawas Pekerjaan';
  pengawasTitle.font = { name: 'Times New Roman', size: 11, bold: true };
  pengawasTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  currentRowNum++;

  // Subtitle
  worksheet.mergeCells(`B${currentRowNum}:C${currentRowNum}`);
  const pelaksanaSub = worksheet.getCell(`B${currentRowNum}`);
  pelaksanaSub.value = 'PT. NARARYA TEKNOLOGI INDONESIA';
  pelaksanaSub.font = { name: 'Times New Roman', size: 10.5, bold: true };
  pelaksanaSub.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`E${currentRowNum}:F${currentRowNum}`);
  const pengawasSub = worksheet.getCell(`E${currentRowNum}`);
  pengawasSub.value = 'FACILITY MAINTENANCE - ELEKTRONIKA';
  pengawasSub.font = { name: 'Times New Roman', size: 10.5, bold: true };
  pengawasSub.alignment = { horizontal: 'center', vertical: 'middle' };

  // Space for physical / digital signature
  currentRowNum += 3;
  worksheet.getRow(currentRowNum).height = 30;

  // Name sign-off (Underlined)
  worksheet.mergeCells(`B${currentRowNum}:C${currentRowNum}`);
  const pelaksanaName = worksheet.getCell(`B${currentRowNum}`);
  pelaksanaName.value = rawTechs[0] ? rawTechs[0].toUpperCase() : 'LUTHFIANDA MUZAKI SULAEMAN';
  pelaksanaName.font = { name: 'Times New Roman', size: 11, bold: true, underline: true };
  pelaksanaName.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`E${currentRowNum}:F${currentRowNum}`);
  const pengawasName = worksheet.getCell(`E${currentRowNum}`);
  pengawasName.value = 'RIZKO ENDRA NUGRAHA';
  pengawasName.font = { name: 'Times New Roman', size: 11, bold: true, underline: true };
  pengawasName.alignment = { horizontal: 'center', vertical: 'middle' };

  // Write and return buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Trigger file download directly in user's browser
 */
export function downloadExcelFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
