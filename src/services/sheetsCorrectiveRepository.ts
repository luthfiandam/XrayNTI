import { CorrectiveReport, Equipment, Location } from '../types';
import { fetchCorrectiveRecords, saveCorrectiveRecord } from './cloudService';
import { CorrectiveRepository, RepositoryResult } from './correctiveRepository';

/**
 * Google Sheets Corrective Repository (Production Backend in v0.6.3C)
 */
export class SheetsCorrectiveRepository implements CorrectiveRepository {
  readonly backendName = 'sheets' as const;

  async fetchByDataset(datasetId = 'default'): Promise<RepositoryResult<CorrectiveReport[]>> {
    return this.fetchByContext(datasetId);
  }

  async fetchByContext(
    datasetId = 'default',
    operationalDate?: string,
    shift?: string
  ): Promise<RepositoryResult<CorrectiveReport[]>> {
    try {
      const res = await fetchCorrectiveRecords(operationalDate, shift, datasetId);
      if (res.success && Array.isArray(res.data)) {
        return {
          success: true,
          data: res.data,
        };
      }
      return {
        success: false,
        data: [],
        message: res.message || 'Failed to fetch Corrective records from Google Sheets',
      };
    } catch (err: any) {
      return {
        success: false,
        data: [],
        message: err.message || 'Network exception calling Google Sheets',
      };
    }
  }

  async fetchById(idOrEventId: string | number): Promise<RepositoryResult<CorrectiveReport | null>> {
    const res = await this.fetchByDataset();
    if (!res.success || !res.data) {
      return { success: false, data: null, message: res.message };
    }
    const found = res.data.find((r) => {
      if (typeof idOrEventId === 'number') {
        return r.id === idOrEventId;
      }
      return (
        String(r.id) === idOrEventId ||
        r.event_id === idOrEventId ||
        r.corrective_code === idOrEventId
      );
    });
    return { success: true, data: found || null };
  }

  async save(
    record: CorrectiveReport,
    _equipments?: Equipment[],
    _locations?: Location[]
  ): Promise<RepositoryResult<CorrectiveReport>> {
    try {
      const res = await saveCorrectiveRecord(record);
      if (res.success && res.data) {
        return {
          success: true,
          data: res.data,
        };
      }
      return {
        success: false,
        message: res.message || 'Gagal menyimpan Laporan Corrective ke Google Sheets',
        conflict: Boolean((res as any).conflict),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Exception during Sheets save',
      };
    }
  }
}
