import { getPeriodKey } from './periodUtils';

export interface PdfArchivePathAndFilename {
  folderPath: string;
  fileName: string;
  periodKey: string;
  intervalName: string;
}

/**
 * Returns standardized folder path and file name for Google Drive PDF Cloud Archive (laporan/...)
 */
export function getReportPdfArchivePathAndFilename(
  dateStr: string,
  shiftStr: string,
  targetFrequencyId: number = 1
): PdfArchivePathAndFilename {
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  let yearNum = 2026;
  let monthIdx = 7; // August (0-indexed)
  let dayNum = 10;

  if (dateStr) {
    const cleanDate = dateStr.replace(/^(Minggu|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu)[,\s]*/i, '').trim();

    if (cleanDate.includes('-')) {
      const parts = cleanDate.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          yearNum = parseInt(parts[0], 10) || 2026;
          monthIdx = parseInt(parts[1], 10) - 1;
          dayNum = parseInt(parts[2], 10) || 10;
        } else {
          // DD-MM-YYYY
          dayNum = parseInt(parts[0], 10) || 10;
          monthIdx = parseInt(parts[1], 10) - 1;
          yearNum = parseInt(parts[2], 10) || 2026;
        }
      }
    } else {
      const parts = cleanDate.split(/\s+/);
      if (parts.length >= 3) {
        dayNum = parseInt(parts[0], 10) || 10;
        const m = parts[1];
        if (!isNaN(Number(m))) {
          monthIdx = parseInt(m, 10) - 1;
        } else {
          const matchedMonthIdx = monthNames.findIndex(mn => mn.toLowerCase() === m.toLowerCase());
          if (matchedMonthIdx !== -1) monthIdx = matchedMonthIdx;
        }
        yearNum = parseInt(parts[2], 10) || 2026;
      }
    }
  }

  if (monthIdx < 0 || monthIdx > 11) monthIdx = 7;
  const monthNumStr = String(monthIdx + 1).padStart(2, '0');
  const monthNameStr = monthNames[monthIdx];
  const dayNumStr = String(dayNum).padStart(2, '0');
  const isoDateStr = `${yearNum}-${monthNumStr}-${dayNumStr}`;

  // Shift formatting
  let shiftName = 'Pagi';
  let shiftCode = 'PS';
  const sUpper = (shiftStr || '').toUpperCase();
  if (sUpper.includes('MALAM') || sUpper === 'M') {
    shiftName = 'Malam';
    shiftCode = 'M';
  } else if (sUpper.includes('PAGI') || sUpper === 'PS') {
    shiftName = 'Pagi';
    shiftCode = 'PS';
  }

  const periodKey = getPeriodKey(targetFrequencyId, isoDateStr);

  const root = '!Kantor/1. Laporan';
  let folderPath = '';
  let fileName = '';
  let intervalName = 'Harian';

  const monthFolder = `${monthNumStr}. ${monthNameStr}`;

  switch (targetFrequencyId) {
    case 1: { // Laporan Harian
      intervalName = 'Harian';
      folderPath = `${root}/1. Laporan Harian/${yearNum}/${monthFolder}`;
      fileName = `${dayNumStr} ${monthNameStr} ${yearNum} (${shiftCode}).pdf`;
      break;
    }
    case 2: { // Laporan Mingguan
      intervalName = 'Mingguan';
      let weekNumStr = '33';
      const wMatch = periodKey.match(/W(\d+)/i);
      if (wMatch) {
        weekNumStr = parseInt(wMatch[1], 10).toString();
      }
      folderPath = `${root}/2. Laporan Mingguan/${yearNum}/${monthFolder}`;
      fileName = `${dayNumStr} ${monthNameStr} ${yearNum} (${shiftCode}).pdf`;
      break;
    }
    case 3: { // Laporan Bulanan
      intervalName = 'Bulanan';
      folderPath = `${root}/3. Laporan Bulanan/${yearNum}/${monthFolder}`;
      fileName = `${dayNumStr} ${monthNameStr} ${yearNum} (${shiftCode}).pdf`;
      break;
    }
    case 4: { // Laporan Triwulan
      intervalName = 'Triwulan';
      folderPath = `${root}/4. Laporan Triwulan/${yearNum}`;
      fileName = `${dayNumStr} ${monthNameStr} ${yearNum} (${shiftCode}).pdf`;
      break;
    }
    case 5: { // Laporan Semesteran
      intervalName = 'Semesteran';
      folderPath = `${root}/5. Laporan Semesteran/${yearNum}`;
      fileName = `${dayNumStr} ${monthNameStr} ${yearNum} (${shiftCode}).pdf`;
      break;
    }
    case 6: { // Laporan Tahunan
      intervalName = 'Tahunan';
      folderPath = `${root}/6. Laporan Tahunan/${yearNum}`;
      fileName = `${dayNumStr} ${monthNameStr} ${yearNum} (${shiftCode}).pdf`;
      break;
    }
    default: {
      folderPath = `${root}/1. Laporan Harian/${yearNum}/${monthFolder}`;
      fileName = `${dayNumStr} ${monthNameStr} ${yearNum} (${shiftCode}).pdf`;
      break;
    }
  }

  return {
    folderPath,
    fileName,
    periodKey,
    intervalName,
  };
}
