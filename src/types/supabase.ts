import { MeasurementValue, ChecklistResult, PreventiveEvidence } from '../types';

/**
 * Supabase Database Row representation for `equipment` table.
 * Master configuration for equipments.
 */
export interface SupabaseEquipmentRow {
  id: number;
  equipment_code: string;
  equipment_name: string;
  brand: string;
  type?: string | null;
  model?: string | null;
  serial_number: string;
  equipment_type_id: number;
  location_id: number;
  active: boolean;
  default_view_type?: 'single' | 'dual' | null;
  default_measurements: MeasurementValue[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Supabase Database Row representation for `preventive_records` table.
 * Represents an actual preventive inspection record.
 */
export interface SupabasePreventiveRecordRow {
  id?: number;
  record_id: string;
  dataset_id: string;
  equipment_id: number;
  equipment_code?: string;
  equipment_name?: string;
  equipment_type?: string;
  view_type?: 'single' | 'dual' | null;
  checklist_frequency_id: number;
  period_key: string;
  operational_date: string;
  shift: 'PS' | 'M';
  preventive_session_id?: number | null;
  sequence: number;
  submitted_at: string;
  submitted_by_technician_ids: number[];
  status: 'OK' | 'NG' | 'NEEDS_REPAIR' | string;
  notes?: string;
  checklist_results: ChecklistResult[];
  measurements: MeasurementValue[];
  evidences: PreventiveEvidence[] | any[];
  created_at?: string;
  updated_at?: string;
  schema_version: number;
}

/**
 * Supabase Database Row representation for `corrective_records` table.
 * Represents an actual corrective maintenance record.
 */
export interface SupabaseCorrectiveRecordRow {
  id?: number;
  event_id: string;
  corrective_code: string;
  dataset_id: string;
  equipment_id: number;
  equipment_code?: string;
  equipment_name: string;
  equipment_type: string;
  location_id?: number | null;
  location_name?: string | null;
  operational_date: string;
  shift: 'PS' | 'M';
  problem_description: string;
  action_taken: string;
  result: 'Resolved' | 'Pending Sparepart' | 'Temporary Fix' | string;
  result_text?: string;
  start_time?: string;
  end_time?: string;
  technician_ids: number[];
  technicians?: string[];
  created_by?: string;
  submitted_by_uid?: string | null;
  updated_by_uid?: string | null;
  notes?: string;
  evidences: any[] | string[];
  created_at?: string;
  updated_at?: string;
  schema_version: number;
}

