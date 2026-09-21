import { PreventiveEntry, Equipment, EquipmentType } from '../types';
import {
  fetchPreventiveRecords,
  savePreventiveRecord,
  isCloudConfigured,
  deletePreventiveRecordFromGas,
} from './cloudService';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  upsertPreventiveRecordToSupabase,
  fetchPreventiveRecordsFromSupabase,
  deletePreventiveRecordFromSupabase,
} from './supabasePreventiveService';
import { buildDriveFolderPath } from '../utils/watermark';

/**
 * Result Contract for Preventive Repository Operations
 */
export interface RepositoryResult<T> {
  success: boolean;
  data?: T;
  message?: string;
  conflict?: boolean;
}

/**
 * Reusable Preventive Repository Interface
 */
export interface PreventiveRepository {
  readonly backendName: 'sheets' | 'supabase';
  fetchByContext(
    datasetId?: string,
    operationalDate?: string,
    shift?: string
  ): Promise<RepositoryResult<PreventiveEntry[]>>;
  fetchById(canonicalId: string): Promise<RepositoryResult<PreventiveEntry | null>>;
  save(
    entry: PreventiveEntry,
    equipments?: Equipment[],
    equipmentTypes?: EquipmentType[]
  ): Promise<RepositoryResult<PreventiveEntry>>;
  delete(
    entry: PreventiveEntry,
    equipments?: Equipment[],
    equipmentTypes?: EquipmentType[]
  ): Promise<RepositoryResult<boolean>>;
  exists(
    datasetId: string,
    equipmentId: number,
    frequencyId: number,
    periodKey: string,
    shift: string
  ): Promise<boolean>;
}

/**
 * Legacy Google Sheets / Apps Script Preventive Repository
 */
export class SheetsPreventiveRepository implements PreventiveRepository {
  readonly backendName = 'sheets' as const;

  async fetchByContext(
    _datasetId?: string,
    operationalDate?: string,
    shift?: string
  ): Promise<RepositoryResult<PreventiveEntry[]>> {
    try {
      const res = await fetchPreventiveRecords();
      if (!res.success || !res.data) {
        return {
          success: false,
          data: [],
          message: res.message || 'Gagal memuat data dari Google Sheets',
        };
      }

      let records = res.data;
      if (operationalDate) {
        records = records.filter((r) => r.operational_date === operationalDate);
      }
      if (shift) {
        records = records.filter((r) => !r.shift || r.shift === shift);
      }

      return {
        success: true,
        data: records,
      };
    } catch (err: any) {
      return {
        success: false,
        data: [],
        message: err.message || 'Exception during Sheets fetch',
      };
    }
  }

  async fetchById(canonicalId: string): Promise<RepositoryResult<PreventiveEntry | null>> {
    const res = await this.fetchByContext();
    if (!res.success || !res.data) {
      return { success: false, data: null, message: res.message };
    }
    const found = res.data.find((e) => {
      const shift = e.shift === 'Malam' ? 'M' : 'PS';
      const id = `${e.dataset_id || 'default'}_${e.equipment_id}_${e.checklist_frequency_id}_${e.period_key || ''}_${shift}`;
      return id === canonicalId;
    });
    return { success: true, data: found || null };
  }

  async save(
    entry: PreventiveEntry,
    _equipments?: Equipment[],
    _equipmentTypes?: EquipmentType[]
  ): Promise<RepositoryResult<PreventiveEntry>> {
    try {
      const res = await savePreventiveRecord(entry);
      if (res.success && res.data) {
        return {
          success: true,
          data: res.data,
        };
      }
      return {
        success: false,
        message: res.message || 'Gagal menyimpan ke Google Sheets',
        conflict: Boolean((res as any).conflict),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Exception during Sheets save',
      };
    }
  }

  async delete(
    entry: PreventiveEntry,
    equipments?: Equipment[],
    equipmentTypes?: EquipmentType[]
  ): Promise<RepositoryResult<boolean>> {
    try {
      if (isCloudConfigured()) {
        const eq = equipments?.find((e) => e.id === Number(entry.equipment_id));
        const eqType = eq && equipmentTypes ? equipmentTypes.find((t) => t.id === eq.equipment_type_id) : undefined;
        const eqTypeStr = eqType?.name || eqType?.code || eq?.type || 'EQUIPMENT';
        const locName = eq?.location_id ? `LOC-${eq.location_id}` : (eq?.name || `EQ-${entry.equipment_id}`);

        const folderPath = (entry as any).folder_path || buildDriveFolderPath({
          reportType: 'PREVENTIVE',
          operationalDate: entry.operational_date || new Date().toISOString().split('T')[0],
          shift: entry.shift,
          equipmentType: eqTypeStr,
          locationName: locName,
          equipmentName: eq?.name,
        });

        const res = await deletePreventiveRecordFromGas({
          ...entry,
          folder_path: folderPath,
          equipment_name: eq?.name,
        });
        return { success: res.success, data: true, message: res.message };
      }
      return { success: true, data: true };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error deleting preventive from Sheets/Drive' };
    }
  }

  async exists(
    datasetId: string,
    equipmentId: number,
    frequencyId: number,
    periodKey: string,
    shift: string
  ): Promise<boolean> {
    const canonicalShift = shift === 'Malam' || shift === 'M' ? 'M' : 'PS';
    const targetId = `${datasetId}_${equipmentId}_${frequencyId}_${periodKey}_${canonicalShift}`;
    const res = await this.fetchById(targetId);
    return Boolean(res.success && res.data);
  }
}

/**
 * 100% Supabase PostgreSQL Preventive Repository
 */
export class SupabasePreventiveRepository implements PreventiveRepository {
  readonly backendName = 'supabase' as const;

  async fetchByContext(
    datasetId = 'default',
    operationalDate?: string,
    shift?: string
  ): Promise<RepositoryResult<PreventiveEntry[]>> {
    try {
      const records = await fetchPreventiveRecordsFromSupabase(datasetId);
      if (records !== null) {
        let filtered = records;
        if (operationalDate) {
          filtered = filtered.filter((r) => r.operational_date === operationalDate);
        }
        if (shift) {
          filtered = filtered.filter((r) => !r.shift || r.shift === shift);
        }
        return { success: true, data: filtered };
      }
      return { success: false, data: [], message: 'Supabase preventive query returned null' };
    } catch (err: any) {
      return { success: false, data: [], message: err?.message || 'Error fetching preventive from Supabase' };
    }
  }

  async fetchById(canonicalId: string): Promise<RepositoryResult<PreventiveEntry | null>> {
    const res = await this.fetchByContext();
    if (!res.success || !res.data) return { success: false, data: null };
    const found = res.data.find(
      (e) => String(e.id) === canonicalId || String(e.equipment_id) === canonicalId
    );
    return { success: true, data: found || null };
  }

  async save(
    entry: PreventiveEntry,
    equipments: Equipment[] = [],
    equipmentTypes: EquipmentType[] = []
  ): Promise<RepositoryResult<PreventiveEntry>> {
    try {
      const eq = equipments.find((e) => e.id === Number(entry.equipment_id));
      const eqType = eq ? equipmentTypes.find((t) => t.id === eq.equipment_type_id) : undefined;
      const eqTypeStr = eqType?.name || eqType?.code || eq?.type || 'EQUIPMENT';

      const res = await upsertPreventiveRecordToSupabase(entry, eq, eqTypeStr);
      if (res.success && res.data) {
        const saved = res.data;
        const mapped: PreventiveEntry = {
          ...entry,
          id: Number(saved.id || saved.record_id || entry.id),
          evidences: saved.evidences || [],
          synced: true,
          updated_at: saved.updated_at,
        };
        return { success: true, data: mapped };
      }
      return { success: false, message: res.error || 'Failed to save preventive record to Supabase' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error saving preventive to Supabase' };
    }
  }

  async delete(
    entry: PreventiveEntry,
    equipments?: Equipment[],
    equipmentTypes?: EquipmentType[]
  ): Promise<RepositoryResult<boolean>> {
    try {
      // 1. Delete from Supabase
      const res = await deletePreventiveRecordFromSupabase(entry);

      // 2. Also delete from Google Drive folder and Google Sheets (if GAS is configured)
      if (isCloudConfigured()) {
        try {
          const eq = equipments?.find((e) => e.id === Number(entry.equipment_id));
          const eqType = eq && equipmentTypes ? equipmentTypes.find((t) => t.id === eq.equipment_type_id) : undefined;
          const eqTypeStr = eqType?.name || eqType?.code || eq?.type || 'EQUIPMENT';
          const locName = eq?.location_id ? `LOC-${eq.location_id}` : (eq?.name || `EQ-${entry.equipment_id}`);

          const folderPath = (entry as any).folder_path || buildDriveFolderPath({
            reportType: 'PREVENTIVE',
            operationalDate: entry.operational_date || new Date().toISOString().split('T')[0],
            shift: entry.shift,
            equipmentType: eqTypeStr,
            locationName: locName,
            equipmentName: eq?.name,
          });

          await deletePreventiveRecordFromGas({
            ...entry,
            folder_path: folderPath,
            equipment_name: eq?.name,
          });
        } catch (gasErr) {
          console.warn('[PreventiveRepository] GAS/Drive deletion warning:', gasErr);
        }
      }

      if (res.success) {
        return { success: true, data: true };
      }
      return { success: false, message: res.error || 'Gagal menghapus data preventif di Supabase' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error deleting preventive record' };
    }
  }

  async exists(
    datasetId: string,
    equipmentId: number,
    frequencyId: number,
    periodKey: string,
    shift: string
  ): Promise<boolean> {
    const res = await this.fetchByContext(datasetId);
    if (!res.success || !res.data) return false;
    return res.data.some(
      (e) =>
        Number(e.equipment_id) === Number(equipmentId) &&
        Number(e.checklist_frequency_id) === Number(frequencyId) &&
        e.period_key === periodKey &&
        e.shift === shift
    );
  }
}

// Singletons
const supabaseRepoInstance = new SupabasePreventiveRepository();
const sheetsRepoInstance = new SheetsPreventiveRepository();

/**
 * Returns the active Preventive Repository implementation.
 * Defaults to Supabase when configured, falling back to Sheets.
 */
export function getPreventiveRepository(): PreventiveRepository {
  if (isSupabaseConfigured()) {
    return supabaseRepoInstance;
  }
  return sheetsRepoInstance;
}
