import { uploadPhotoToDrive, isCloudConfigured } from './cloudService';
import { PreventiveEvidence } from '../types';
import { generateDriveFileName, sanitizeFileNamePart } from '../utils/watermark';
import { compressImage } from '../utils/imageCompressor';

export interface UploadResult {
  success: boolean;
  drive_url?: string;
  file_id?: string;
  file_name?: string;
  folder_url?: string;
  error?: string;
}

/**
 * Checks if a given string is a raw Base64 image data URI.
 */
export function isBase64DataUrl(str: unknown): boolean {
  if (typeof str !== 'string') return false;
  return str.startsWith('data:image/') || str.startsWith('data:application/pdf');
}

/**
 * Checks if a given string is a valid web or Google Drive URL.
 */
export function isDriveOrWebUrl(str: unknown): boolean {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Concurrency helper: processes items with an exact maximum concurrency limit.
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items || items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(limit, items.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

/**
 * Uploads a single photo to Google Drive.
 * If already a URL, returns it immediately (idempotent, no double upload).
 * Compresses raw Base64 images (1280px, 0.78 quality) and logs precise upload timing.
 */
export async function uploadEvidencePhoto(
  base64OrUrl: string,
  folderPath: string,
  fileName: string,
  photoType: string = 'evidence',
  index: number = 0,
  caption: string = ''
): Promise<UploadResult> {
  // If already a URL, no need to upload
  if (isDriveOrWebUrl(base64OrUrl)) {
    return {
      success: true,
      drive_url: base64OrUrl.trim(),
      file_name: fileName,
    };
  }

  if (!isBase64DataUrl(base64OrUrl)) {
    return {
      success: false,
      error: 'Data foto tidak valid (bukan URL dan bukan Base64 image).',
    };
  }

  if (!isCloudConfigured()) {
    return {
      success: false,
      error: 'Google Apps Script (VITE_GAS_API_URL) belum dikonfigurasi. Foto tidak dapat diunggah ke Google Drive.',
    };
  }

  // Pre-upload image optimization: Compress to max 1280px, quality 0.78 JPEG
  const tCompStart = performance.now();
  let uploadPayload = base64OrUrl;
  if (base64OrUrl.startsWith('data:image/')) {
    try {
      uploadPayload = await compressImage(base64OrUrl, 1280, 0.78);
      const tCompDuration = performance.now() - tCompStart;
      console.log(`[UploadTiming] photo ${index + 1} ("${caption || fileName}") compression: ${tCompDuration.toFixed(0)}ms`);
    } catch (compressErr) {
      console.warn('[EvidenceService] Pre-upload compression warning, proceeding with original data:', compressErr);
    }
  }

  const tUploadStart = performance.now();
  try {
    const res = await uploadPhotoToDrive(uploadPayload, folderPath, fileName, photoType);
    const tUploadDuration = performance.now() - tUploadStart;

    if (res.success && res.data?.drive_url) {
      console.log(`[UploadTiming] photo ${index + 1} ("${caption || fileName}") upload: ${tUploadDuration.toFixed(0)}ms (status: OK)`);
      return {
        success: true,
        drive_url: res.data.drive_url,
        file_id: res.data.file_id,
        file_name: res.data.file_name || fileName,
        folder_url: res.data.folder_url || (res as any).folder_url,
      };
    }

    console.warn(`[UploadTiming] photo ${index + 1} ("${caption || fileName}") upload: ${tUploadDuration.toFixed(0)}ms (status: FAILED - ${res.message})`);
    return {
      success: false,
      error: res.message || 'Gagal mengunggah foto ke Google Drive melalui Google Apps Script.',
    };
  } catch (err: any) {
    const tUploadDuration = performance.now() - tUploadStart;
    console.warn(`[UploadTiming] photo ${index + 1} ("${caption || fileName}") upload: ${tUploadDuration.toFixed(0)}ms (status: EXCEPTION - ${err?.message})`);
    return {
      success: false,
      error: err?.message || 'Terjadi kesalahan jaringan saat mengunggah ke Google Drive.',
    };
  }
}

/**
 * Uploads an array of Preventive evidences to Google Drive with limited concurrency (max 2).
 * Static delay removed; uses concurrent workers and provides granular performance logging.
 */
export async function processAndUploadPreventiveEvidences(
  evidences: PreventiveEvidence[],
  folderPath: string,
  options: {
    equipmentCode: string;
    locationName?: string;
    operationalDate?: string;
    timeStr?: string;
    collageFolderPath?: string;
  }
): Promise<{ success: boolean; evidences: PreventiveEvidence[]; folder_url?: string; warning?: string; error?: string }> {
  if (!evidences || evidences.length === 0) {
    return { success: true, evidences: [] };
  }

  const tBatchStart = performance.now();
  const cleanBaseFolder = folderPath.replace(/\/Foto (Preventif|Kolase)$/, '');
  const failures: string[] = [];
  let resolvedFolderUrl: string | undefined = undefined;

  // Concurrency limit = 2 (optimal throughput without hitting GAS script execution limits)
  const CONCURRENCY_LIMIT = 2;

  const processed = await runWithConcurrencyLimit(
    evidences,
    CONCURRENCY_LIMIT,
    async (item, i): Promise<PreventiveEvidence> => {
      const candidate = item.file_path || item.dataUrl || item.drive_url || item.url || '';
      const capLower = (item.caption || '').toLowerCase();
      const isCollage = (item as any).is_collage === true || capLower.includes('kolase');
      const itemCaption = item.caption || (isCollage ? 'Foto Kolase' : `Dokumentasi #${i + 1}`);

      // Target subfolder
      const targetFolder = isCollage
        ? (options.collageFolderPath || `${cleanBaseFolder}/Foto Kolase`)
        : `${cleanBaseFolder}/Foto Preventif`;

      // 1. If already a valid web / Drive URL, reuse immediately (no duplicate request)
      if (isDriveOrWebUrl(candidate)) {
        return {
          id: item.id || Date.now() + i,
          file_path: candidate,
          drive_url: candidate,
          file_id: item.file_id || '',
          caption: itemCaption,
          is_collage: isCollage,
        };
      }

      // 2. If Base64 image, compress & upload
      if (isBase64DataUrl(candidate)) {
        const fileName = isCollage
          ? `kolase_${sanitizeFileNamePart(options.equipmentCode || 'EQUIPMENT')}_${options.timeStr ? options.timeStr.replace(/[^0-9]/g, '') : Date.now()}.jpg`
          : generateDriveFileName(
              options.equipmentCode || options.locationName || 'EQUIPMENT',
              options.timeStr,
              options.operationalDate,
              i
            );

        try {
          const upload = await uploadEvidencePhoto(
            candidate,
            targetFolder,
            fileName,
            isCollage ? 'preventive_collage' : 'preventive_evidence',
            i,
            itemCaption
          );

          if (upload.success && upload.drive_url) {
            if (!resolvedFolderUrl && upload.folder_url) {
              resolvedFolderUrl = upload.folder_url;
            }
            return {
              id: item.id || Date.now() + i,
              file_path: upload.drive_url,
              drive_url: upload.drive_url,
              file_id: upload.file_id || '',
              caption: itemCaption,
              is_collage: isCollage,
            };
          } else {
            console.warn(`[EvidenceService] Drive upload failed for "${itemCaption}":`, upload.error);
            failures.push(`Foto "${itemCaption}": ${upload.error}`);
            return {
              id: item.id || Date.now() + i,
              file_path: '',
              drive_url: '',
              file_id: '',
              caption: itemCaption,
              is_collage: isCollage,
            };
          }
        } catch (uploadErr: any) {
          console.warn(`[EvidenceService] Upload exception for "${itemCaption}":`, uploadErr);
          failures.push(`Foto "${itemCaption}": ${uploadErr?.message || 'Error'}`);
          return {
            id: item.id || Date.now() + i,
            file_path: '',
            drive_url: '',
            file_id: '',
            caption: itemCaption,
            is_collage: isCollage,
          };
        }
      }

      // 3. Fallback for non-base64 empty / other candidates
      return {
        id: item.id || Date.now() + i,
        file_path: isDriveOrWebUrl(candidate) ? candidate : '',
        drive_url: isDriveOrWebUrl(candidate) ? candidate : '',
        file_id: item.file_id || '',
        caption: itemCaption,
        is_collage: isCollage,
      };
    }
  );

  const tBatchTotal = performance.now() - tBatchStart;
  console.log(`[UploadTiming] preventive batch total (${evidences.length} photos, concurrency ${CONCURRENCY_LIMIT}): ${tBatchTotal.toFixed(0)}ms`);

  return {
    success: failures.length === 0,
    evidences: processed,
    folder_url: resolvedFolderUrl,
    warning: failures.length > 0 ? failures.join('; ') : undefined,
  };
}

/**
 * Uploads an array of Corrective evidences (strings) to Google Drive with limited concurrency (max 2).
 * Static delay removed; ONLY stores Google Drive URLs in the processed output; NEVER falls back to base64.
 */
export async function processAndUploadCorrectiveEvidences(
  evidences: string[],
  folderPath: string,
  options: {
    locationOrEquipment: string;
    startTime?: string;
    correctiveDate?: string;
  }
): Promise<{ success: boolean; evidences: string[]; warning?: string; error?: string }> {
  if (!evidences || evidences.length === 0) {
    return { success: true, evidences: [] };
  }

  const tBatchStart = performance.now();
  const failures: string[] = [];
  const CONCURRENCY_LIMIT = 2;

  const processedResults = await runWithConcurrencyLimit(
    evidences,
    CONCURRENCY_LIMIT,
    async (ev, i): Promise<string | null> => {
      if (typeof ev !== 'string') return null;

      // If already a URL, return immediately (no duplicate request)
      if (isDriveOrWebUrl(ev)) {
        return ev.trim();
      }

      if (isBase64DataUrl(ev)) {
        const fileName = generateDriveFileName(
          options.locationOrEquipment || 'CORRECTIVE',
          options.startTime,
          options.correctiveDate,
          i
        );

        try {
          const upload = await uploadEvidencePhoto(
            ev,
            folderPath,
            fileName,
            'corrective_evidence',
            i,
            `Corrective #${i + 1}`
          );

          if (upload.success && upload.drive_url) {
            return upload.drive_url;
          } else {
            console.warn(`[EvidenceService] Corrective drive upload failed for #${i + 1}:`, upload.error);
            failures.push(`Evidence #${i + 1}: ${upload.error}`);
            return null;
          }
        } catch (uploadErr: any) {
          console.warn(`[EvidenceService] Corrective drive upload exception for #${i + 1}:`, uploadErr);
          failures.push(`Evidence #${i + 1}: ${uploadErr?.message || 'Error'}`);
          return null;
        }
      }

      return null;
    }
  );

  const cleanProcessed = processedResults.filter((url): url is string => Boolean(url));
  const tBatchTotal = performance.now() - tBatchStart;
  console.log(`[UploadTiming] corrective batch total (${evidences.length} photos, concurrency ${CONCURRENCY_LIMIT}): ${tBatchTotal.toFixed(0)}ms`);

  return {
    success: failures.length === 0,
    evidences: cleanProcessed,
    warning: failures.length > 0 ? failures.join('; ') : undefined,
  };
}

/**
 * Sanitizes Preventive evidences strictly for Supabase storage.
 * GUARANTEE: NEVER returns any Base64 data URLs. Only valid Google Drive / HTTP(S) links are kept.
 * Excludes any item without a valid web/Drive URL to prevent database table bloat.
 */
export function sanitizePreventiveEvidencesForSupabase(evidences: any[]): PreventiveEvidence[] {
  if (!Array.isArray(evidences)) return [];

  const cleanList: PreventiveEvidence[] = [];

  for (let i = 0; i < evidences.length; i++) {
    const item = evidences[i];
    if (!item || typeof item !== 'object') continue;

    // Search for valid HTTP(S) Google Drive link
    let validLink = '';
    const candidates = [item.drive_url, item.file_path, item.url];
    for (const c of candidates) {
      if (typeof c === 'string' && isDriveOrWebUrl(c)) {
        validLink = c.trim();
        break;
      }
    }

    // Only keep items that have an actual Google Drive link
    if (validLink) {
      cleanList.push({
        id: item.id || i + 1,
        file_path: validLink,
        drive_url: validLink,
        file_id: item.file_id || '',
        caption: item.caption || `Dokumentasi #${i + 1}`,
        is_collage: Boolean(item.is_collage),
      });
    }
  }

  return cleanList;
}

/**
 * Sanitizes Corrective evidences strictly for Supabase storage.
 * GUARANTEE: NEVER returns any Base64 data URLs. Only valid Google Drive / HTTP(S) links are kept.
 */
export function sanitizeCorrectiveEvidencesForSupabase(evidences: any[]): string[] {
  if (!Array.isArray(evidences)) return [];

  const cleanList: string[] = [];

  for (let i = 0; i < evidences.length; i++) {
    const item = evidences[i];
    let candidate = '';
    if (typeof item === 'string') {
      candidate = item.trim();
    } else if (item && typeof item === 'object') {
      candidate = (item.drive_url || item.file_path || item.url || '').trim();
    }

    if (candidate && isDriveOrWebUrl(candidate)) {
      cleanList.push(candidate);
    }
  }

  return cleanList;
}

/**
 * Defense-in-Depth Guard:
 * Strictly checks that no base64 string exists in evidences.
 */
export function assertNoBase64Evidences(evidences: any[]): void {
  if (!Array.isArray(evidences)) return;

  for (let i = 0; i < evidences.length; i++) {
    const item = evidences[i];
    let candidate = '';
    if (typeof item === 'string') {
      candidate = item;
    } else if (item && typeof item === 'object') {
      candidate = item.file_path || item.dataUrl || item.drive_url || item.url || '';
    }

    if (isBase64DataUrl(candidate)) {
      console.error(
        `[CRITICAL Evidence Guard] Detected forbidden Base64 string in evidence #${i + 1}! It must be stripped before database write.`
      );
    }
  }
}
