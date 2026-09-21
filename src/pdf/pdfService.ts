import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { StructuredReportData } from '../types';
import { ShiftReportPdfDocument } from './PdfDocument';
import { getReportPdfArchivePathAndFilename } from '../utils/pdfArchiveUtils';
import { uploadPdfToDrive, GasApiResponse, PdfUploadResult } from '../services/cloudService';

/**
 * Generates a vector PDF Blob from report data using @react-pdf/renderer
 */
export async function generateReportPdfBlob(
  structuredData: StructuredReportData,
  targetFrequencyId?: number
): Promise<Blob> {
  const docElement = React.createElement(ShiftReportPdfDocument, { structuredData, targetFrequencyId });
  const pdfInstance = pdf(docElement as any);
  const blob = await pdfInstance.toBlob();
  return blob;
}

/**
 * Downloads the generated PDF directly in browser
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Client-side vector PDF download + non-blocking Google Drive Cloud Archive
 */
export async function downloadReportPdf(
  structuredData: StructuredReportData,
  targetFrequencyId?: number
): Promise<{ cloudResult?: GasApiResponse<PdfUploadResult>; fileName: string }> {
  const archiveInfo = getReportPdfArchivePathAndFilename(
    structuredData.operational_date,
    structuredData.shift,
    targetFrequencyId || 1
  );

  const blob = await generateReportPdfBlob(structuredData, targetFrequencyId);

  // Trigger local browser download immediately
  downloadBlob(blob, archiveInfo.fileName);

  // Trigger non-blocking Google Drive cloud archive
  let cloudResult: GasApiResponse<PdfUploadResult> | undefined;
  try {
    cloudResult = await uploadPdfToDrive(blob, archiveInfo.folderPath, archiveInfo.fileName, {
      interval: archiveInfo.intervalName,
      period_key: archiveInfo.periodKey,
      shift: structuredData.shift,
      operational_date: structuredData.operational_date,
    });
  } catch (err) {
    console.warn('Cloud PDF upload warning:', err);
  }

  return { cloudResult, fileName: archiveInfo.fileName };
}

/**
 * Shares PDF via Web Share API or falls back to direct download + non-blocking Google Drive Cloud Archive
 */
export async function shareReportPdf(
  structuredData: StructuredReportData,
  targetFrequencyId?: number
): Promise<{ shared: boolean; method: 'web-share' | 'download'; cloudResult?: GasApiResponse<PdfUploadResult> }> {
  const archiveInfo = getReportPdfArchivePathAndFilename(
    structuredData.operational_date,
    structuredData.shift,
    targetFrequencyId || 1
  );

  const blob = await generateReportPdfBlob(structuredData, targetFrequencyId);
  const file = new File([blob], archiveInfo.fileName, { type: 'application/pdf' });

  let shared = false;
  let method: 'web-share' | 'download' = 'download';

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: 'Laporan Maintenance',
        text: `Laporan Maintenance ${structuredData.operational_date}`,
      });
      shared = true;
      method = 'web-share';
    } catch {
      downloadBlob(blob, archiveInfo.fileName);
      method = 'download';
    }
  } else {
    downloadBlob(blob, archiveInfo.fileName);
    method = 'download';
  }

  // Trigger non-blocking Google Drive cloud archive
  let cloudResult: GasApiResponse<PdfUploadResult> | undefined;
  try {
    cloudResult = await uploadPdfToDrive(blob, archiveInfo.folderPath, archiveInfo.fileName, {
      interval: archiveInfo.intervalName,
      period_key: archiveInfo.periodKey,
      shift: structuredData.shift,
      operational_date: structuredData.operational_date,
    });
  } catch (err) {
    console.warn('Cloud PDF upload warning:', err);
  }

  return { shared, method, cloudResult };
}

/**
 * Fallback generator using Express Puppeteer server endpoint if needed
 */
export async function generatePdfPuppeteerFallback(
  htmlContent: string,
  filename: string
): Promise<Blob> {
  const response = await fetch('/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: htmlContent, filename }),
  });

  if (!response.ok) {
    throw new Error(`Puppeteer server error ${response.status}`);
  }

  return await response.blob();
}
