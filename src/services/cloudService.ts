import { PreventiveEntry, CorrectiveReport, CloudDataset } from '../types';

export interface GasApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  folder_url?: string;
  folder_id?: string;
}

export interface PhotoUploadResult {
  file_id: string;
  file_name: string;
  drive_url: string;
  download_url?: string;
  folder_url?: string;
  folder_id?: string;
}

export interface PdfUploadResult {
  file_id: string;
  file_name: string;
  drive_url: string;
  download_url?: string;
  updated_at?: string;
}

export interface BatchPhotoItem {
  id?: string | number;
  base64Data: string;
  folderPath?: string;
  fileName?: string;
  photoType?: string;
}

export interface BatchPhotoUploadResult {
  total: number;
  duration_ms?: number;
  results: {
    id?: string | number;
    index: number;
    success: boolean;
    data?: PhotoUploadResult;
    message?: string;
  }[];
}

/**
 * Validates whether a string is a valid absolute Google Apps Script / HTTP(S) URL.
 */
export function isValidGasUrl(str?: string | null): boolean {
  if (!str) return false;
  const s = String(str).trim();
  if (
    !s ||
    s === 'undefined' ||
    s === 'null' ||
    s === '/' ||
    s === '""' ||
    s === "''" ||
    s.toLowerCase() === 'my_gas_api_url' ||
    s.toLowerCase() === 'your_gas_api_url'
  ) {
    return false;
  }
  try {
    const parsed = new URL(s);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname.length > 3;
  } catch {
    return false;
  }
}

/**
 * Returns the configured Google Apps Script Web App URL from environment or storage.
 */
export function getGasApiUrl(): string {
  const isProd = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production';

  // In production, strictly prioritize environment configuration to prevent untrusted overrides
  if (isProd) {
    if (process.env.VITE_GAS_API_URL && isValidGasUrl(process.env.VITE_GAS_API_URL)) {
      return process.env.VITE_GAS_API_URL.trim();
    }
    const metaEnv = (import.meta as Record<string, any>).env || {};
    if (metaEnv.VITE_GAS_API_URL && isValidGasUrl(metaEnv.VITE_GAS_API_URL)) {
      return metaEnv.VITE_GAS_API_URL.trim();
    }
  }

  // In non-production/development, allow localStorage or window override first for developer convenience
  if (typeof window !== 'undefined') {
    const localUrl = localStorage.getItem('VITE_GAS_API_URL');
    if (isValidGasUrl(localUrl)) return localUrl.trim();
    const winUrl = (window as any).VITE_GAS_API_URL;
    if (isValidGasUrl(winUrl)) return winUrl.trim();
  }

  const metaEnv = (import.meta as Record<string, any>).env || {};
  const metaUrl = metaEnv.VITE_GAS_API_URL;
  if (isValidGasUrl(metaUrl)) return metaUrl.trim();

  if (typeof process !== 'undefined' && process.env && process.env.VITE_GAS_API_URL) {
    const procUrl = process.env.VITE_GAS_API_URL;
    if (isValidGasUrl(procUrl)) return procUrl.trim();
  }

  return '';
}

/**
 * Allows setting or clearing a custom Google Apps Script Web App URL at runtime.
 */
export function setCustomGasApiUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (!url || !url.trim()) {
      localStorage.removeItem('VITE_GAS_API_URL');
    } else {
      localStorage.setItem('VITE_GAS_API_URL', url.trim());
    }
  }
}

/**
 * Checks whether the Google Apps Script integration is configured.
 */
export function isCloudConfigured(): boolean {
  const url = getGasApiUrl();
  return isValidGasUrl(url);
}

/**
 * Helper function to call the Google Apps Script Web App API using POST.
 * Uses text/plain header to avoid CORS preflight issues in Google Apps Script.
 * Includes AbortController timeout, retry policy for 429/5xx/network with backoff + jitter, and timing logs.
 */
async function callGasApi<T>(
  payload: Record<string, any>,
  retries: number = 3,
  timeoutMs: number = 55000
): Promise<GasApiResponse<T>> {
  const url = getGasApiUrl();
  const action = payload.action || 'unknown';
  if (!url || !isValidGasUrl(url)) {
    return {
      success: false,
      message: 'VITE_GAS_API_URL belum dikonfigurasi. Aplikasi berjalan dalam mode lokal/offline.',
    };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timer);
      const reqDuration = performance.now() - t0;

      if (!response.ok) {
        console.warn(
          `[CloudSync] HTTP ${response.status} (${response.statusText}) for action '${action}' (attempt ${attempt + 1}/${retries + 1}, took ${reqDuration.toFixed(0)}ms)`
        );

        // Retry on HTTP 429 (Rate Limit), HTTP 5xx (Server Errors), HTTP 408 (Timeout), or transient HTTP 404 from Google Echo redirects.
        const isTransientGoogleError = response.status === 429 || response.status >= 500 || response.status === 404 || response.status === 408;
        if (attempt < retries && isTransientGoogleError) {
          const baseDelay = response.status === 429 ? 2500 : 1500;
          const jitter = Math.random() * 500;
          const delayMs = Math.min(baseDelay * Math.pow(1.8, attempt) + jitter, 10000);
          console.info(`[CloudSync] Retrying action '${action}' in ${delayMs.toFixed(0)}ms due to transient HTTP ${response.status}...`);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        return {
          success: false,
          message: response.status === 404
            ? 'Endpoint Google Apps Script tidak ditemukan (HTTP 404). Periksa URL deployment Web App.'
            : response.status === 429
            ? 'Terlalu banyak permintaan ke Google Apps Script (HTTP 429 Rate Limit). Silakan coba lagi sebentar lagi.'
            : `Endpoint Google Apps Script merespons dengan status ${response.status}.`,
        };
      }

      const rawText = await response.text();
      let result: GasApiResponse<T>;
      try {
        result = JSON.parse(rawText);
      } catch (parseErr) {
        console.warn(`[CloudSync] Non-JSON response for action '${action}':`, rawText.substring(0, 100));
        if (attempt < retries) {
          const delayMs = 1200 + Math.random() * 300;
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        return {
          success: false,
          message: 'Respons server bukan format JSON yang valid.',
        };
      }

      // Detect if Google Apps Script followed a 302 redirect to doGet() instead of executing doPost()
      if (
        result.message &&
        typeof result.message === 'string' &&
        result.message.includes('Please use POST for API requests')
      ) {
        console.warn(`[CloudSync] Action '${action}' was redirected to doGet by Google Apps Script (attempt ${attempt + 1}/${retries + 1}).`);
        if (attempt < retries) {
          const delayMs = 1200 + Math.random() * 300;
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        return {
          success: false,
          message: 'Request dialihkan oleh Google Apps Script (doGet). Silakan coba kembali.',
        };
      }

      const totalDuration = performance.now() - t0;
      if (!result.success) {
        console.warn(`[UploadTiming] callGasApi '${action}' returned failure in ${totalDuration.toFixed(0)}ms:`, result.message);
      } else {
        console.log(`[UploadTiming] callGasApi '${action}' succeeded in ${totalDuration.toFixed(0)}ms`);
      }

      return result;
    } catch (err: any) {
      clearTimeout(timer);
      const isAbort = err?.name === 'AbortError';
      const errMsg = isAbort ? `Request timeout setelah ${timeoutMs / 1000}s` : (err?.message || String(err));

      console.warn(`[CloudSync] Fetch exception for action '${action}' (attempt ${attempt + 1}/${retries + 1}):`, errMsg);

      if (attempt < retries) {
        const baseDelay = 1200;
        const jitter = Math.random() * 400;
        const delayMs = Math.min(baseDelay * Math.pow(2, attempt) + jitter, 8000);
        console.info(`[CloudSync] Retrying action '${action}' in ${delayMs.toFixed(0)}ms due to network/timeout exception...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return {
        success: false,
        message: isAbort ? 'Waktu permintaan habis (timeout). Periksa koneksi internet.' : (err?.message || 'Gagal terhubung ke Google Apps Script backend.'),
      };
    }
  }

  return {
    success: false,
    message: `Aksi '${action}' gagal setelah ${retries + 1} kali percobaan.`,
  };
}

/**
 * Health check endpoint for Google Apps Script Web App.
 */
export async function checkHealth(): Promise<GasApiResponse> {
  return callGasApi({ action: 'healthCheck' });
}

/**
 * Fetches available Datasets/Workspaces from Google Sheets.
 */
export async function fetchDatasets(): Promise<GasApiResponse<CloudDataset[]>> {
  return callGasApi<CloudDataset[]>({
    action: 'getDatasets',
  });
}

/**
 * Fetches Preventive Records from Google Sheets.
 * Optionally filtered by operational date, shift, and datasetId.
 */
export async function fetchPreventiveRecords(
  operationalDate?: string,
  shift?: string,
  datasetId?: string
): Promise<GasApiResponse<PreventiveEntry[]>> {
  return callGasApi<PreventiveEntry[]>({
    action: 'getPreventiveRecords',
    operationalDate,
    shift,
    datasetId,
  });
}

/**
 * Saves or updates a Preventive Record in Google Sheets and uploads photo evidences to Google Drive.
 */
export async function savePreventiveRecord(
  record: PreventiveEntry
): Promise<GasApiResponse<PreventiveEntry>> {
  return callGasApi<PreventiveEntry>({
    action: 'savePreventiveRecord',
    record,
  });
}

/**
 * Fetches Corrective Records from Google Sheets.
 * Optionally filtered by operational date, shift, and datasetId.
 */
export async function fetchCorrectiveRecords(
  operationalDate?: string,
  shift?: string,
  datasetId?: string
): Promise<GasApiResponse<CorrectiveReport[]>> {
  return callGasApi<CorrectiveReport[]>({
    action: 'getCorrectiveRecords',
    operationalDate,
    shift,
    datasetId,
  });
}

/**
 * Saves or updates a Corrective Record in Google Sheets and uploads photo evidences to Google Drive.
 */
export async function saveCorrectiveRecord(
  record: CorrectiveReport
): Promise<GasApiResponse<CorrectiveReport>> {
  return callGasApi<CorrectiveReport>({
    action: 'saveCorrectiveRecord',
    record,
  });
}

/**
 * Uploads a single photo to Google Drive via Google Apps Script.
 */
export async function uploadPhotoToDrive(
  base64Data: string,
  folderPath?: string,
  fileName?: string,
  photoType?: string
): Promise<GasApiResponse<PhotoUploadResult>> {
  return callGasApi<PhotoUploadResult>({
    action: 'uploadPhoto',
    base64Data,
    folderPath,
    fileName,
    photoType,
  });
}

/**
 * Uploads multiple photos in a single batch request to Google Drive via Google Apps Script.
 */
export async function uploadPhotosBatchToDrive(
  photos: BatchPhotoItem[],
  defaultFolderPath?: string
): Promise<GasApiResponse<BatchPhotoUploadResult>> {
  return callGasApi<BatchPhotoUploadResult>({
    action: 'uploadPhotosBatch',
    photos,
    folderPath: defaultFolderPath,
  });
}

/**
 * Converts a Blob to base64 Data URL string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Uploads or archives an exported PDF to Google Drive via Google Apps Script.
 */
export async function uploadPdfToDrive(
  blob: Blob,
  folderPath: string,
  fileName: string,
  metadata?: Record<string, any>
): Promise<GasApiResponse<PdfUploadResult>> {
  try {
    const base64Data = await blobToBase64(blob);
    return callGasApi<PdfUploadResult>({
      action: 'uploadPdf',
      base64Data,
      folderPath,
      fileName,
      metadata,
    });
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Gagal mengubah PDF ke format base64.',
    };
  }
}

/**
 * Deletes / trashes a folder and its contents in Google Drive via Google Apps Script.
 */
export async function deleteDriveFolder(folderPath: string): Promise<GasApiResponse<any>> {
  return callGasApi({
    action: 'deleteFolder',
    folderPath,
  });
}

/**
 * Deletes / trashes a file in Google Drive via Google Apps Script.
 */
export async function deleteDriveFile(fileIdOrUrl: string): Promise<GasApiResponse<any>> {
  return callGasApi({
    action: 'deleteFile',
    fileId: fileIdOrUrl,
  });
}

/**
 * Deletes a Preventive Record from Google Sheets and trashes its photo folder & evidence files in Google Drive.
 */
export async function deletePreventiveRecordFromGas(
  recordOrPayload: Record<string, any>
): Promise<GasApiResponse<any>> {
  return callGasApi({
    action: 'deletePreventiveRecord',
    record: recordOrPayload,
  });
}

/**
 * Deletes a Corrective Record from Google Sheets and trashes its photo folder & evidence files in Google Drive.
 */
export async function deleteCorrectiveRecordFromGas(
  recordOrPayload: Record<string, any>
): Promise<GasApiResponse<any>> {
  return callGasApi({
    action: 'deleteCorrectiveRecord',
    record: recordOrPayload,
  });
}
