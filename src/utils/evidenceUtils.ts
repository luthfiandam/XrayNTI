import { ReportEvidenceItem, PreventiveEvidence } from '../types';

/**
 * Resolves the primary URL / file path for an evidence item.
 * Supports string URLs, PreventiveEvidence objects, and structured ReportEvidenceItems.
 */
export function getEvidenceUrl(
  ev: ReportEvidenceItem | PreventiveEvidence | string | undefined | null
): string {
  if (!ev) return '';
  if (typeof ev === 'string') return ev.trim();
  return (
    ev.file_path?.trim() ||
    (ev as { drive_url?: string }).drive_url?.trim() ||
    (ev as { url?: string }).url?.trim() ||
    (ev as { dataUrl?: string }).dataUrl?.trim() ||
    ''
  );
}

/**
 * Extracts an array of non-empty photo URLs from a list of evidence items.
 */
export function extractValidPhotoUrls(
  evidences?: (ReportEvidenceItem | PreventiveEvidence | string)[] | null
): string[] {
  if (!evidences || !Array.isArray(evidences)) return [];
  return evidences
    .map(getEvidenceUrl)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
}

/**
 * Resolves exactly 1 photo for official PDF and report documentation table.
 * Strictly prioritizes the Collage photo (is_collage or caption containing 'kolase').
 * If no explicit collage is found, falls back to the last evidence photo or single photo.
 * Always returns at most ONE URL string (or empty string if none).
 */
export function getSingleCollagePhotoUrl(
  evidences?: (ReportEvidenceItem | PreventiveEvidence | string)[] | null
): string {
  if (!evidences || !Array.isArray(evidences) || evidences.length === 0) return '';

  // 1. Look for explicit collage item
  const collageItem = evidences.find((ev) => {
    if (typeof ev === 'object' && ev !== null) {
      const cap = ((ev as any).caption || '').toLowerCase();
      const path = ((ev as any).file_path || (ev as any).drive_url || '').toLowerCase();
      return (ev as any).is_collage === true || cap.includes('kolase') || path.includes('kolase');
    }
    return typeof ev === 'string' && ev.toLowerCase().includes('kolase');
  });

  if (collageItem) {
    return getEvidenceUrl(collageItem);
  }

  // 2. Fallback: if multiple photos exist, take the last photo or single photo
  const valid = extractValidPhotoUrls(evidences);
  if (valid.length > 0) {
    return valid[valid.length - 1];
  }

  return '';
}

