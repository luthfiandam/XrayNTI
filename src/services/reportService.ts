import {
  PreventiveSession,
  PreventiveEntry,
  Equipment,
  EquipmentType,
  Technician,
  Location,
  CorrectiveReport,
  StructuredReportData,
  StructuredCorrectiveEntry,
  ShiftType,
} from '../types';
import { getOperationalShiftForCorrective } from '../utils/technicianSchedule';
import { formatIndonesianDate, formatTimeShort, formatTimeRange } from '../utils/timeFormat';
import { getActivePreventiveRecords, getActiveCorrectiveReports, normalizeShift } from '../utils/contextFilter';
import { normalizeOperationalDate, isSpreadsheetEpochArtifact } from '../utils/dateTimeUtils';
import {
  resolveTechnicianNames,
  findEquipmentById,
  findLocationById,
  findEquipmentTypeById,
} from '../utils/entityLookup';

export function formatDateIndonesian(dateString: string): string {
  return formatIndonesianDate(dateString, { includeDayName: true });
}

export function buildStructuredReportData(
  session: PreventiveSession,
  entries: PreventiveEntry[],
  equipments: Equipment[],
  equipmentTypes: EquipmentType[],
  technicians: Technician[],
  correctiveReports: CorrectiveReport[] = [],
  locations: Location[] = []
): StructuredReportData {
  // Ensure we only process entries and corrective reports that belong strictly to the session's active context and deduplicate in memory
  const sanitizedEntries = getActivePreventiveRecords(entries, {
    datasetId: session.dataset_id,
    operationalDate: session.operational_date,
    shift: session.shift,
  });

  const sanitizedCorrectives = getActiveCorrectiveReports(correctiveReports, {
    datasetId: session.dataset_id,
    operationalDate: session.operational_date,
    shift: session.shift,
  });

  const techNames = resolveTechnicianNames(session.technician_ids, technicians);

  // Find min & max submit times or fallback to session start/end
  const submitTimes = sanitizedEntries.map((e) => e.submitted_at).sort();
  const startTime = submitTimes.length > 0 ? submitTimes[0] : session.started_at;
  const endTime =
    submitTimes.length > 0 ? submitTimes[submitTimes.length - 1] : session.ended_at;

  // Group entries by Equipment Type Priority (1: XRAY, 2: WTMD, 3: HHMD, 4: ETD)
  const sortedTypes = [...equipmentTypes].sort((a, b) => a.priority - b.priority);

  const linesByType: StructuredReportData['lines_by_type'] = [];
  const entriesByType: StructuredReportData['entries_by_type'] = [];

  for (const type of sortedTypes) {
    // Find all entries of this equipment type
    const typeEntries = sanitizedEntries
      .filter((e) => {
        const eq = findEquipmentById(equipments, e.equipment_id);
        return eq?.equipment_type_id === type.id;
      })
      .sort((a, b) => a.sequence - b.sequence); // ORDER BY sequence chronological

    if (typeEntries.length === 0) continue;

    const eqNames = typeEntries
      .map((e) => findEquipmentById(equipments, e.equipment_id)?.name)
      .filter(Boolean) as string[];

    linesByType.push({
      type_code: type.code,
      type_name: type.name,
      equipment_names: eqNames,
    });

    entriesByType.push({
      type_code: type.code,
      type_name: type.name,
      priority: type.priority,
      entries: typeEntries.map((e) => {
        const eq = findEquipmentById(equipments, e.equipment_id);
        return {
          equipment_id: Number(e.equipment_id),
          equipment_name: eq?.name || 'Equipment',
          location_name: eq?.name || '',
          view_type: e.view_type || eq?.default_view || 'single',
          measurements: e.measurements || [],
          notes: e.notes || 'Sudah dilakukan pembersihan dan bisa digunakan dengan normal.',
          submitted_at: e.submitted_at,
          sequence: e.sequence,
          evidences: e.evidences || [],
          checklist_frequency_id: Number(e.checklist_frequency_id),
        };
      }),
    });
  }

  // Filter corrective reports for this operational shift
  const filteredCorrectives = (sanitizedCorrectives || []).filter((report) => {
    const shiftInfo = getOperationalShiftForCorrective(report);
    return (
      shiftInfo.operationalDate === session.operational_date &&
      shiftInfo.shift === session.shift
    );
  });

  // Sort ascending chronologically by actual datetime of start_time within shift window
  filteredCorrectives.sort((a, b) => {
    const getTimestamp = (r: CorrectiveReport) => {
      const d = r.corrective_date || session.operational_date;
      const t = (r.start_time || '00:00').replace('.', ':');
      const parts = t.split(':');
      const hh = String(parseInt(parts[0] || '0', 10)).padStart(2, '0');
      const mm = String(parseInt(parts[1] || '0', 10)).padStart(2, '0');
      const ts = new Date(`${d}T${hh}:${mm}:00+07:00`).getTime();
      return isNaN(ts) ? 0 : ts;
    };
    return getTimestamp(a) - getTimestamp(b);
  });

  const correctiveEntries: StructuredCorrectiveEntry[] = filteredCorrectives.map((report) => {
    const eq = findEquipmentById(equipments, report.equipment_id);
    const eqType = findEquipmentTypeById(equipmentTypes, eq?.equipment_type_id);
    const loc = findLocationById(locations, report.location_id || eq?.location_id);

    const sTime = formatTimeShort(report.start_time, false);
    const eTime = formatTimeShort(report.end_time, false);
    const timeRange = formatTimeRange(report.start_time, report.end_time);

    return {
      id: report.id,
      corrective_code: report.corrective_code,
      equipment_name: eq?.name || 'Equipment',
      type_code: eqType?.code || 'XRAY',
      location_name: loc?.name || eq?.name || '',
      problem_description: report.problem_description,
      action_taken: report.action_taken,
      result: report.result,
      result_text: report.result_text,
      start_time: sTime,
      end_time: eTime || sTime,
      time_range: timeRange,
      notes: report.notes || '-',
      technicians: report.technicians || [report.created_by],
      evidences: report.evidences || [],
    };
  });

  return {
    operational_date: formatDateIndonesian(session.operational_date),
    shift: session.shift,
    start_time: formatTimeShort(startTime, false),
    end_time: formatTimeShort(endTime, false),
    technicians: techNames.length > 0 ? techNames : session.technician_names,
    lines_by_type: linesByType,
    entries_by_type: entriesByType,
    corrective_entries: correctiveEntries,
  };
}

function cleanLocationName(rawName: string, typeCode: string): string {
  let name = rawName.trim();
  const regex = new RegExp(`^${typeCode}\\s*`, 'i');
  name = name.replace(regex, '').trim();

  if (name === name.toUpperCase()) {
    name = name
      .toLowerCase()
      .split(' ')
      .map((word) => {
        if (['vip', 'vvip', 'cip', 'bhs', 'hbscp', 'mscp', 'etd', 'wtmd', 'hhmd', 'xray'].includes(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }
  return name;
}

export function generateWhatsAppReportText(data: StructuredReportData, targetFrequencyId?: number): string {
  // Map of interval names
  const INTERVAL_NAMES: Record<number, string> = {
    1: 'HARIAN',
    2: 'MINGGUAN',
    3: 'BULANAN',
    4: 'TRIWULAN',
    5: 'SEMESTERAN',
    6: 'TAHUNAN'
  };

  // Extract all entries across all types
  const allEntries = data.entries_by_type.flatMap((g) => g.entries);
  
  // Find which intervals were actually submitted
  const submittedFrequencyIds = Array.from(
    new Set(allEntries.map((e) => e.checklist_frequency_id).filter(Boolean) as number[])
  ).sort((a, b) => a - b);

  // If a targetFrequencyId is provided, only generate text for that specific interval
  const activeFrequencies = targetFrequencyId !== undefined
    ? [targetFrequencyId]
    : (submittedFrequencyIds.length > 0 ? submittedFrequencyIds : [1]);

  let text = `*LAPORAN PREVENTIVE MAINTENANCE*\n\n`;
  text += `Hari / Tanggal : ${data.operational_date} (${data.shift})\n`;
  text += `Jam : ${formatTimeRange(data.start_time, data.end_time)}\n\n`;

  text += `Teknisi :\n`;
  for (const tech of data.technicians) {
    text += `⦁ *${tech}*\n`;
  }
  text += `\n`;

  // Loop through each submitted interval
  activeFrequencies.forEach((freqId) => {
    const freqName = INTERVAL_NAMES[freqId] || 'PENGUJIAN';
    
    text += `===================================\n`;
    text += `*=== PREVENTIVE ${freqName} ===*\n`;
    text += `===================================\n\n`;

    // 1. Line lists for this interval
    let hasLineList = false;
    data.entries_by_type.forEach((group) => {
      // Filter entries for this type in this specific frequency/interval
      const filteredEntries = group.entries.filter((e) => e.checklist_frequency_id === freqId);
      if (filteredEntries.length === 0) return;

      hasLineList = true;
      text += `Berikut Lokasi Line ${group.type_code}:\n`;
      filteredEntries.forEach((item) => {
        text += `• ${item.equipment_name}\n`;
      });
      text += `\n`;
    });

    if (!hasLineList) {
      text += `Tidak ada pemeriksaan untuk interval ini.\n\n`;
      return;
    }

    // 2. Notes / Details for this interval
    text += `Notes :\n`;

    // Filter type groups that have entries in this frequency
    const activeGroups = data.entries_by_type
      .map((group) => ({
        ...group,
        entries: group.entries.filter((e) => e.checklist_frequency_id === freqId),
      }))
      .filter((group) => group.entries.length > 0);

    const totalGroups = activeGroups.length;

    activeGroups.forEach((group, groupIdx) => {
      if (group.type_code === 'XRAY') {
        group.entries.forEach((item, itemIdx) => {
          const isHarianExclusion = freqId === 1 && (item.equipment_id === 2 || item.equipment_id === 3 || item.equipment_id === 9);

          if (isHarianExclusion) {
            const formattedName = `XRAY ${item.equipment_name.toUpperCase()}`;
            text += `⦁ *${formattedName}*\n`;
            text += `Sudah dilakukan pengecekan dan pembersihan. Equipment bisa digunakan dengan normal.\n`;
          } else {
            text += `⦁ *${item.equipment_name}*\n`;
            text += `Hasil pengecekan\n`;

            if (item.measurements && item.measurements.length > 0) {
              text += `*Positive high voltage & Negative high Voltage*\n`;
              item.measurements.forEach((m) => {
                const pos = m.positive_high_voltage !== undefined ? `${m.positive_high_voltage}kV` : '-';
                const neg = m.negative_high_voltage !== undefined ? `${m.negative_high_voltage}kV` : '-';
                text += `(Gen ${m.generator} ${pos} & ${neg})\n`;
              });

              text += `1. *Heater current*\n`;
              const heaterParts = item.measurements.map((m) => {
                const h = m.heater_current !== undefined ? `${m.heater_current}mA` : '-';
                return `(Gen ${m.generator}: ${h})`;
              });
              text += `${heaterParts.join(' ')}\n`;

              text += `2. *Anode Current*\n`;
              const anodeParts = item.measurements.map((m) => {
                const a = m.anode_current !== undefined ? `${m.anode_current}uA` : '-';
                return `(Gen ${m.generator}: ${a})`;
              });
              text += `${anodeParts.join(' ')}\n`;
            }

            text += `${item.notes}\n`;
          }

          if (groupIdx < totalGroups - 1 || itemIdx < group.entries.length - 1) {
            text += `_______________________________________\n`;
          }
        });
      } else {
        // Non-XRAY equipment (WTMD, HHMD, ETD)
        const firstNote = group.entries[0]?.notes;
        const allSameNote = group.entries.every((e) => e.notes === firstNote);

        if (allSameNote && group.entries.length > 1) {
          const cleanedNames = group.entries.map((e) => cleanLocationName(e.equipment_name, group.type_code));
          let joinedNames = '';
          if (cleanedNames.length === 2) {
            joinedNames = cleanedNames.join(' dan ');
          } else {
            joinedNames = cleanedNames.slice(0, -1).join(', ') + ' dan ' + cleanedNames[cleanedNames.length - 1];
          }

          text += `⦁ *${group.type_code} ${joinedNames}*\n`;
          text += `${firstNote}\n`;
        } else {
          group.entries.forEach((item, itemIdx) => {
            const cleaned = cleanLocationName(item.equipment_name, group.type_code);
            text += `⦁ *${group.type_code} ${cleaned}*\n`;
            text += `${item.notes}\n`;

            if (itemIdx < group.entries.length - 1) {
              text += `_______________________________________\n`;
            }
          });
        }

        if (groupIdx < totalGroups - 1) {
          text += `_______________________________________\n`;
        }
      }
    });

    text += `\n`;
  });

  return text.trim();
}

export function generateCorrectiveWhatsAppReportText(data: StructuredReportData): string {
  let text = `*LAPORAN CORRECTIVE MAINTENANCE*\n\n`;
  text += `Hari / Tanggal : ${data.operational_date} (${data.shift})\n`;
  text += `Jam : ${formatTimeRange(data.start_time, data.end_time)}\n\n`;

  text += `Teknisi :\n`;
  for (const tech of data.technicians) {
    text += `⦁ *${tech}*\n`;
  }
  text += `\n`;

  text += `===================================\n`;
  text += `*=== CORRECTIVE MAINTENANCE ===*\n`;
  text += `===================================\n\n`;
  
  if (data.corrective_entries && data.corrective_entries.length > 0) {
    data.corrective_entries.forEach((c, idx) => {
      text += `⦁ *[${c.type_code}] ${c.equipment_name}*\n`;
      text += `Waktu: ${c.time_range}\n`;
      text += `Kendala: ${c.problem_description}\n`;
      text += `Tindakan: ${c.action_taken}\n`;
      text += `Hasil: ${c.result_text || c.result}\n`;
      if (idx < data.corrective_entries.length - 1) {
        text += `_______________________________________\n`;
      }
    });
  } else {
    text += `Tidak ada kendala corrective.\n`;
  }

  return text.trim();
}

export interface HistoricalReportSummary {
  dateKey: string; // YYYY-MM-DD___Shift
  rawDate: string; // YYYY-MM-DD
  formattedDate: string; // e.g. Minggu, 20 September 2026
  shift: ShiftType;
  preventiveCount: number;
  preventiveEquipmentsCount: number;
  correctiveCount: number;
  correctiveResolvedCount: number;
  technicianNames: string[];
  frequenciesPresent: number[];
  firstSubmittedAt?: string;
  lastSubmittedAt?: string;
  isCurrentSession?: boolean;
}

export function getHistoricalReportList(
  entries: PreventiveEntry[],
  correctiveReports: CorrectiveReport[],
  technicians: Technician[],
  currentSession?: PreventiveSession
): HistoricalReportSummary[] {
  const map = new Map<string, {
    rawDate: string;
    shift: ShiftType;
    entries: PreventiveEntry[];
    correctives: CorrectiveReport[];
    techNamesSet: Set<string>;
    freqSet: Set<number>;
    timestamps: string[];
  }>();

  const getOrInitKey = (date: string, shiftVal: ShiftType | string) => {
    const canonicalShift = (normalizeShift(shiftVal) || 'Pagi') as ShiftType;
    const key = `${date}___${canonicalShift}`;
    if (!map.has(key)) {
      map.set(key, {
        rawDate: date,
        shift: canonicalShift,
        entries: [],
        correctives: [],
        techNamesSet: new Set(),
        freqSet: new Set(),
        timestamps: [],
      });
    }
    return map.get(key)!;
  };

  /**
   * Helper to safely split and deduplicate technician names
   */
  const addUniqueTechnicianName = (set: Set<string>, rawName?: string | null) => {
    if (!rawName || typeof rawName !== 'string') return;
    // Split on comma, semicolon, or slash in case of combined strings like "Luthfi, Yoan"
    const parts = rawName.split(/[,;/]/);
    for (const part of parts) {
      const clean = part.trim();
      if (clean.length >= 2) {
        // Case-insensitive deduplication
        const alreadyExists = Array.from(set).some(
          (existing) => existing.trim().toLowerCase() === clean.toLowerCase()
        );
        if (!alreadyExists) {
          set.add(clean);
        }
      }
    }
  };

  // 1. Process Preventive Entries
  entries.forEach((e) => {
    const origDate = e.operational_date || e.period_key || (e.submitted_at ? e.submitted_at.split('T')[0] : '');
    if (!origDate || String(origDate).trim() === '' || isSpreadsheetEpochArtifact(origDate)) return;
    const rawDate = normalizeOperationalDate(origDate);
    if (!rawDate || rawDate.includes('1899')) return;
    const shift = (normalizeShift(e.shift) || 'Pagi') as ShiftType;
    const item = getOrInitKey(rawDate, shift);
    item.entries.push(e);
    if (e.checklist_frequency_id) item.freqSet.add(Number(e.checklist_frequency_id));

    // Resolve technician names from submitted_by_technician_ids
    if (Array.isArray(e.submitted_by_technician_ids) && e.submitted_by_technician_ids.length > 0) {
      e.submitted_by_technician_ids.forEach((id) => {
        const found = technicians.find((t) => Number(t.id) === Number(id));
        if (found && found.name) {
          addUniqueTechnicianName(item.techNamesSet, found.name);
        }
      });
    }
    if ((e as any).submitted_by) {
      addUniqueTechnicianName(item.techNamesSet, (e as any).submitted_by);
    }
    if (Array.isArray((e as any).technician_names)) {
      (e as any).technician_names.forEach((t: string) => addUniqueTechnicianName(item.techNamesSet, t));
    }

    // Capture valid submission timestamps
    const subAt = e.submitted_at || e.created_at;
    if (subAt && typeof subAt === 'string' && !subAt.includes('1899')) {
      const validTs = subAt.includes('T') || subAt.includes(' ') || subAt.includes('-')
        ? subAt
        : `${rawDate}T${subAt.length === 5 ? subAt + ':00' : subAt}`;
      item.timestamps.push(validTs);
    }
  });

  // 2. Process Corrective Reports
  correctiveReports.forEach((c) => {
    const origDate = c.corrective_date || (c as any).operational_date || (c.created_at ? c.created_at.split('T')[0] : '');
    if (!origDate || String(origDate).trim() === '' || isSpreadsheetEpochArtifact(origDate)) return;
    const rawDate = normalizeOperationalDate(origDate);
    if (!rawDate || rawDate.includes('1899')) return;
    const shift = (normalizeShift(c.shift || getOperationalShiftForCorrective(c).shift) || 'Pagi') as ShiftType;
    const item = getOrInitKey(rawDate, shift);
    item.correctives.push(c);

    // Add technicians carefully with deduplication (splits comma strings like "Luthfi, Yoan")
    if (Array.isArray(c.technicians)) {
      c.technicians.forEach((t) => addUniqueTechnicianName(item.techNamesSet, t));
    }
    if (c.created_by) {
      addUniqueTechnicianName(item.techNamesSet, c.created_by);
    }
    if (Array.isArray((c as any).technician_names)) {
      (c as any).technician_names.forEach((t: string) => addUniqueTechnicianName(item.techNamesSet, t));
    }

    const createdAt = c.created_at || (c as any).submitted_at;
    if (createdAt && typeof createdAt === 'string' && !createdAt.includes('1899')) {
      const validTs = createdAt.includes('T') || createdAt.includes(' ') || createdAt.includes('-')
        ? createdAt
        : `${rawDate}T${createdAt.length === 5 ? createdAt + ':00' : createdAt}`;
      item.timestamps.push(validTs);
    }
  });

  // 3. Ensure current session is present
  if (currentSession && currentSession.operational_date) {
    const normDate = normalizeOperationalDate(currentSession.operational_date);
    const normShift = (normalizeShift(currentSession.shift) || 'Pagi') as ShiftType;
    const item = getOrInitKey(normDate, normShift);
    if (Array.isArray(currentSession.technician_names)) {
      currentSession.technician_names.forEach((t) => addUniqueTechnicianName(item.techNamesSet, t));
    }
    // Note: We deliberately do NOT push raw session times (like "07:00") into timestamps
    // so empty/active sessions without submissions don't show an "Invalid Date"
  }

  // 4. Build output list
  const result: HistoricalReportSummary[] = [];

  map.forEach((item, key) => {
    const uniqueEquipments = new Set(item.entries.map((e) => e.equipment_id));
    const validTimestamps = item.timestamps
      .filter((ts) => Boolean(ts) && !isNaN(new Date(ts).getTime()))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const resolvedCorrectives = item.correctives.filter(
      (c) => c.result === 'Resolved' || c.result_text === 'Resolved' || (c as any).status === 'Selesai'
    ).length;

    const techList = Array.from(item.techNamesSet).filter(Boolean);

    const isCurr =
      currentSession &&
      item.rawDate === normalizeOperationalDate(currentSession.operational_date) &&
      normalizeShift(item.shift) === normalizeShift(currentSession.shift);

    // CRITICAL FIX: Only fallback to currentSession technician names for the CURRENT session!
    // Never attribute historical past dates to the currently logged in user session!
    let resolvedTechnicians: string[] = [];
    if (techList.length > 0) {
      resolvedTechnicians = techList;
    } else if (isCurr && currentSession?.technician_names?.length) {
      resolvedTechnicians = currentSession.technician_names.filter(Boolean);
    } else {
      resolvedTechnicians = ['Teknisi Tidak Tercatat'];
    }

    result.push({
      dateKey: key,
      rawDate: item.rawDate,
      formattedDate: formatIndonesianDate(item.rawDate, { includeDayName: true }),
      shift: item.shift,
      preventiveCount: item.entries.length,
      preventiveEquipmentsCount: uniqueEquipments.size,
      correctiveCount: item.correctives.length,
      correctiveResolvedCount: resolvedCorrectives,
      technicianNames: resolvedTechnicians,
      frequenciesPresent: Array.from(item.freqSet).sort((a, b) => a - b),
      firstSubmittedAt: validTimestamps.length > 0 ? validTimestamps[0] : undefined,
      lastSubmittedAt: validTimestamps.length > 0 ? validTimestamps[validTimestamps.length - 1] : undefined,
      isCurrentSession: !!isCurr,
    });
  });

  // Urutan dari yang paling baru ke paling lama (Newest to Oldest)
  return result.sort((a, b) => {
    // 1. Newest calendar date first
    const timeA = new Date(a.rawDate).getTime();
    const timeB = new Date(b.rawDate).getTime();
    if (!isNaN(timeA) && !isNaN(timeB) && timeB !== timeA) {
      return timeB - timeA;
    }
    const dateCmp = b.rawDate.localeCompare(a.rawDate);
    if (dateCmp !== 0) return dateCmp;

    // 2. Shift order: Malam (3) > Siang (2) > Pagi (1)
    const shiftWeight = (s: string) => {
      const norm = normalizeShift(s);
      if (norm === 'Malam') return 3;
      if (norm === 'Siang') return 2;
      return 1;
    };
    return shiftWeight(b.shift) - shiftWeight(a.shift);
  });
}
