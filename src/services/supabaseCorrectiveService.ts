import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { CorrectiveReport, Equipment, Location, ShiftType } from '../types';
import {
  processAndUploadCorrectiveEvidences,
  sanitizeCorrectiveEvidencesForSupabase,
  assertNoBase64Evidences,
} from './evidenceService';
import { buildDriveFolderPath } from '../utils/watermark';

export interface SupabaseCorrectiveRow {
  id?: number;
  event_id: string;
  corrective_code: string;
  dataset_id: string;
  equipment_id: number;
  equipment_code?: string;
  equipment_name: string;
  equipment_type: string;
  location_id?: number | null;
  location_name?: string;
  operational_date: string;
  shift: 'PS' | 'M';
  problem_description: string;
  action_taken: string;
  result: 'Resolved' | 'Pending Sparepart' | 'Temporary Fix';
  result_text?: string;
  start_time?: string;
  end_time?: string;
  technician_ids?: number[];
  technicians?: string[];
  created_by?: string;
  notes?: string;
  evidences?: any[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Normalizes any shift representation ('PAGI', 'MALAM', 'PS', 'M') to canonical PostgreSQL enum 'PS' | 'M'
 */
function toCanonicalShift(rawShift?: string): 'PS' | 'M' {
  if (!rawShift) return 'PS';
  const s = rawShift.toUpperCase().trim();
  if (s === 'M' || s === 'MALAM') return 'M';
  return 'PS';
}

/**
 * Normalizes result status to allowed check constraint in database
 */
function toCanonicalResult(rawResult?: string): 'Resolved' | 'Pending Sparepart' | 'Temporary Fix' {
  if (rawResult === 'Pending Sparepart' || rawResult === 'Temporary Fix' || rawResult === 'Resolved') {
    return rawResult;
  }
  return 'Resolved';
}

export async function fetchCorrectiveFromSupabase(
  datasetId: string = 'default'
): Promise<CorrectiveReport[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('corrective_records')
      .select('*')
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message?.toLowerCase().includes('permission denied')) {
        console.info('[SupabaseCorrective] Query dilewati (izin Postgres):', error.message);
      } else {
        console.warn('[SupabaseCorrective] Query error:', error.message);
      }
      return null;
    }

    if (!data) return [];

    return data.map((row: any): CorrectiveReport => {
      const shiftDomain: ShiftType = row.shift === 'M' ? 'Malam' : 'Pagi';
      return {
        id: Number(row.id),
        event_id: row.event_id,
        document_id: row.event_id,
        dataset_id: row.dataset_id,
        corrective_code: row.corrective_code || `CR-${row.id}`,
        corrective_date: row.operational_date,
        shift: shiftDomain,
        equipment_id: Number(row.equipment_id),
        location_id: row.location_id ? Number(row.location_id) : 1,
        problem_description: row.problem_description || '',
        action_taken: row.action_taken || '',
        result: toCanonicalResult(row.result),
        result_text: row.result_text || '',
        start_time: row.start_time || '',
        end_time: row.end_time || '',
        technicians: Array.isArray(row.technicians) ? row.technicians : [],
        created_by: row.created_by || 'Teknisi',
        notes: row.notes || '',
        evidences: Array.isArray(row.evidences)
          ? sanitizeCorrectiveEvidencesForSupabase(row.evidences)
          : [],
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        synced: true,
      };
    });
  } catch (err) {
    console.warn('[SupabaseCorrective] fetch error:', err);
    return null;
  }
}

export async function upsertCorrectiveRecordToSupabase(
  report: CorrectiveReport,
  equipments: Equipment[] = [],
  locations: Location[] = []
): Promise<{ success: boolean; data?: CorrectiveReport; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const supabase = getSupabaseClient();
    const datasetId = report.dataset_id || 'default';
    const eqId = Number(report.equipment_id);
    const eq = equipments.find((e) => e.id === eqId);

    // Resolve location ID and name
    const locId = report.location_id ? Number(report.location_id) : (eq?.location_id || 1);
    const loc = locations.find((l) => l.id === locId);

    const operationalDate = report.corrective_date || new Date().toISOString().split('T')[0];
    const canonicalShift = toCanonicalShift(report.shift);
    const eventId = report.event_id || `evt_corr_${report.id || Date.now()}`;
    const correctiveCode = report.corrective_code || `CR-${operationalDate.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;

    // Build Google Drive folder path and process evidences
    const locationLabel = loc?.name || eq?.name || 'LOCATION';
    const folderPath = (report as any).folder_path || buildDriveFolderPath({
      reportType: 'CORRECTIVE',
      operationalDate: operationalDate,
      shift: canonicalShift === 'M' ? 'Malam' : 'Pagi',
      equipmentType: eq?.type || 'EQUIPMENT',
      locationName: locationLabel,
      equipmentName: eq?.name || 'Equipment',
    });

    const rawEvidences = Array.isArray(report.evidences) ? report.evidences : [];
    let cleanEvidences: string[] = [];

    const hasBase64 = rawEvidences.some((ev) => typeof ev === 'string' && ev.startsWith('data:image/'));
    if (hasBase64) {
      try {
        const uploadRes = await processAndUploadCorrectiveEvidences(rawEvidences, folderPath, {
          locationOrEquipment: locationLabel,
          startTime: report.start_time,
          correctiveDate: operationalDate,
        });

        if (uploadRes.evidences && uploadRes.evidences.length > 0) {
          cleanEvidences = uploadRes.evidences;
        }
      } catch (uploadErr) {
        console.warn('[SupabaseCorrective] Drive upload failed, skipping un-uploaded base64 evidences to protect Supabase storage:', uploadErr);
      }
    } else {
      cleanEvidences = rawEvidences
        .map((ev) => (typeof ev === 'string' ? ev.trim() : (ev as any)?.drive_url || ''))
        .filter(Boolean);
    }

    // STRICT DEFENSE-IN-DEPTH: Filter out ANY base64 data URLs.
    // Supabase table stores ONLY Google Drive / HTTP(S) links to preserve free-tier storage!
    cleanEvidences = sanitizeCorrectiveEvidencesForSupabase(cleanEvidences);
    assertNoBase64Evidences(cleanEvidences);

    const payload: Record<string, any> = {
      event_id: eventId,
      corrective_code: correctiveCode,
      dataset_id: datasetId,
      equipment_id: eqId,
      equipment_code: eq?.equipment_code || `EQ-${eqId}`,
      equipment_name: eq?.name || eq?.equipment_name || `Equipment #${eqId}`,
      equipment_type: eq?.type || 'X-RAY',
      location_id: locId,
      location_name: loc?.name || '-',
      operational_date: operationalDate,
      shift: canonicalShift,
      problem_description: report.problem_description || '-',
      action_taken: report.action_taken || '-',
      result: toCanonicalResult(report.result),
      result_text: report.result_text || '',
      start_time: report.start_time || '',
      end_time: report.end_time || '',
      technicians: Array.isArray(report.technicians) ? report.technicians : [],
      created_by: report.created_by || 'Teknisi',
      notes: report.notes || '',
      evidences: cleanEvidences,
      updated_at: new Date().toISOString(),
      schema_version: 1,
    };

    // Check if record already exists by event_id or corrective_code
    const { data: existing, error: findError } = await supabase
      .from('corrective_records')
      .select('id, event_id, corrective_code')
      .or(`event_id.eq."${eventId}",corrective_code.eq."${correctiveCode}"`)
      .maybeSingle();

    if (findError) {
      console.warn('[SupabaseCorrective] Check existing warning:', findError.message);
    }

    let savedRow: any = null;

    if (existing && existing.id) {
      const { data: updateData, error: updateError } = await supabase
        .from('corrective_records')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error('[SupabaseCorrective] Update error:', updateError.message);
        return { success: false, error: updateError.message };
      }
      savedRow = updateData;
    } else {
      const { data: insertData, error: insertError } = await supabase
        .from('corrective_records')
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        console.error('[SupabaseCorrective] Insert error:', insertError.message);
        return { success: false, error: insertError.message };
      }
      savedRow = insertData;
    }

    const transformed: CorrectiveReport = {
      ...report,
      id: savedRow.id ? Number(savedRow.id) : report.id,
      event_id: savedRow.event_id || eventId,
      corrective_code: savedRow.corrective_code || correctiveCode,
      evidences: cleanEvidences,
      synced: true,
      updated_at: savedRow.updated_at,
    };

    console.log('[SupabaseCorrective] Successfully saved corrective record:', savedRow.id, savedRow.corrective_code);
    return { success: true, data: transformed };
  } catch (err: any) {
    console.error('[SupabaseCorrective] Exception saving corrective record:', err);
    return { success: false, error: err?.message || 'Unknown error' };
  }
}
