import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ShiftType, Technician, PreventiveSession } from '../types';
import { FirestoreUserProfile } from '../types/auth';
import {
  getOperationalShift,
  resolveActiveSessionStaff,
} from '../utils/technicianSchedule';
import { isSupervisorUser } from '../services/scheduleCsvService';
import { fetchSchedulesForShiftDetailed, buildScheduleDocId, ScheduleFetchStatus } from '../services/scheduleService';
import { resolveTechnicianNames } from '../utils/entityLookup';
import {
  getValidCachedShiftSession,
  saveCachedShiftSession,
  CachedShiftSession,
} from '../services/sessionCacheService';
import { toast } from '../components/Toast';

export type ResolutionStatus = 'idle' | 'resolving' | 'resolved' | 'fallback';

interface UseShiftSessionProps {
  isLoggedIn: boolean;
  technicians: Technician[];
  activeDatasetId: string;
  currentUserProfile?: FirestoreUserProfile | null;
  currentUserEmail?: string | null;
}

export function useShiftSession({
  isLoggedIn,
  technicians,
  activeDatasetId,
  currentUserProfile,
  currentUserEmail,
}: UseShiftSessionProps) {
  const [currentSession, setCurrentSession] = useState<PreventiveSession>(() => {
    const op = getOperationalShift();
    const docId = buildScheduleDocId(activeDatasetId, op.operationalDate, op.shiftCode);
    const cached = getValidCachedShiftSession({
      dataset_id: activeDatasetId,
      operational_date: op.operationalDate,
      shift: op.shift,
      schedule_document_id: docId,
    });

    if (cached && cached.technician_ids.length > 0) {
      return {
        id: 101,
        operational_date: cached.operational_date,
        shift: cached.shift,
        started_at: cached.shift === 'Pagi' ? '07:00' : '19:00',
        ended_at: cached.shift === 'Pagi' ? '18:59' : '06:59',
        status: 'active',
        technician_ids: cached.technician_ids,
        technician_names: cached.technician_names,
      };
    }

    return {
      id: 101,
      operational_date: op.operationalDate,
      shift: op.shift,
      started_at: op.shift === 'Pagi' ? '07:00' : '19:00',
      ended_at: op.shift === 'Pagi' ? '18:59' : '06:59',
      status: 'active',
      technician_ids: [],
      technician_names: [],
    };
  });

  const [scheduleAvailable, setScheduleAvailable] = useState<boolean>(() => {
    const op = getOperationalShift();
    const docId = buildScheduleDocId(activeDatasetId, op.operationalDate, op.shiftCode);
    const cached = getValidCachedShiftSession({
      dataset_id: activeDatasetId,
      operational_date: op.operationalDate,
      shift: op.shift,
      schedule_document_id: docId,
    });
    return Boolean(cached && cached.technician_ids.length > 0);
  });

  const [isScheduleEmpty, setIsScheduleEmpty] = useState<boolean>(false);
  const [fetchStatus, setFetchStatus] = useState<ScheduleFetchStatus | null>(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState<boolean>(false);
  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<ResolutionStatus>('idle');

  const lastFetchedContextRef = useRef<string | null>(null);
  const inFlightPromiseRef = useRef<Map<string, Promise<void>>>(new Map());

  // Derive logged-in technician from master data
  const loggedInTechnician = useMemo(() => {
    if (!currentUserProfile && !currentUserEmail) return null;
    if (currentUserProfile?.technician_id) {
      const match = technicians.find((t) => t.id === currentUserProfile.technician_id);
      if (match) return match;
    }
    const nameToMatch = currentUserProfile?.display_name || currentUserProfile?.name;
    if (nameToMatch) {
      const cleanName = nameToMatch.trim().toLowerCase();
      const match = technicians.find(
        (t) =>
          t.name.toLowerCase() === cleanName ||
          cleanName.includes(t.name.toLowerCase()) ||
          t.name.toLowerCase().includes(cleanName)
      );
      if (match) return match;
    }
    const emailToMatch = currentUserProfile?.email || currentUserEmail;
    if (emailToMatch) {
      const prefix = emailToMatch.split('@')[0].trim().toLowerCase();
      const match = technicians.find(
        (t) =>
          ((t as { email?: string }).email &&
            (t as { email?: string }).email!.toLowerCase() === emailToMatch.toLowerCase()) ||
          t.name.toLowerCase() === prefix ||
          prefix.includes(t.name.toLowerCase()) ||
          t.name.toLowerCase().includes(prefix)
      );
      if (match) return match;
    }
    return null;
  }, [currentUserProfile, currentUserEmail, technicians]);

  // On Duty Technician Names derived from current session technician_ids
  const technicianNames = useMemo(() => {
    return resolveTechnicianNames(currentSession.technician_ids, technicians);
  }, [currentSession.technician_ids, technicians]);

  // Save Shift Handler
  const handleSaveShift = (selectedIds: number[], shift: ShiftType, date: string) => {
    const techNames = resolveTechnicianNames(selectedIds, technicians);
    const shiftCode = shift === 'Pagi' ? 'PS' : 'M';
    const docId = buildScheduleDocId(activeDatasetId, date, shiftCode);

    const sessionToCache: CachedShiftSession = {
      dataset_id: activeDatasetId,
      operational_date: date,
      shift: shift,
      shift_code: shiftCode,
      schedule_document_id: docId,
      updated_at: new Date().toISOString(),
      technician_ids: selectedIds,
      technician_names: techNames,
      supervisor_on_duty: false,
      resolved_at: new Date().toISOString(),
      source: 'manual',
    };
    saveCachedShiftSession(sessionToCache);

    setCurrentSession((prev) => ({
      ...prev,
      operational_date: date,
      shift: shift,
      technician_ids: selectedIds,
      technician_names: techNames,
    }));
    setScheduleAvailable(selectedIds.length > 0);
    setIsScheduleEmpty(false);
    toast.success('Penugasan Shift Disimpan', {
      message: `Shift ${shift} (${date}) berhasil disimpan untuk ${techNames.length} personil on-duty.`,
      badge: 'Jadwal Shift',
    });
  };

  // Login Technician Handler (Compatibility stub)
  const handleLoginTechnicianSession = (selectedTechIds: number[]) => {
    if (!selectedTechIds || selectedTechIds.length === 0) return;
    const techNames = resolveTechnicianNames(selectedTechIds, technicians);
    const op = getOperationalShift();
    const docId = buildScheduleDocId(activeDatasetId, op.operationalDate, op.shiftCode);

    const sessionToCache: CachedShiftSession = {
      dataset_id: activeDatasetId,
      operational_date: op.operationalDate,
      shift: op.shift,
      shift_code: op.shiftCode,
      schedule_document_id: docId,
      updated_at: new Date().toISOString(),
      technician_ids: selectedTechIds,
      technician_names: techNames,
      supervisor_on_duty: false,
      resolved_at: new Date().toISOString(),
      source: 'manual',
    };
    saveCachedShiftSession(sessionToCache);

    setCurrentSession((prev) => ({
      ...prev,
      technician_ids: selectedTechIds,
      technician_names: techNames,
    }));
    setScheduleAvailable(selectedTechIds.length > 0);
    setIsScheduleEmpty(false);
  };

  // Centralized Automatic On-Duty Schedule Resolver Function
  const checkAndUpdateShift = useCallback(
    async (forceRefetch = false) => {
      if (!isLoggedIn) {
        setIsScheduleLoading(false);
        setScheduleWarning(null);
        setResolutionStatus('idle');
        lastFetchedContextRef.current = null;
        return;
      }

      const op = getOperationalShift();
      const dbShiftCode = op.shift === 'Pagi' ? 'PS' : 'M';
      const canonicalDocId = buildScheduleDocId(activeDatasetId, op.operationalDate, dbShiftCode);
      const currentUserId = currentUserProfile?.uid || currentUserEmail || '';
      const contextKey = `${currentUserId}:${op.operationalDate}:${dbShiftCode}`;

      // 1. Return immediately if context is already resolved & forceRefetch is false
      if (!forceRefetch && lastFetchedContextRef.current === contextKey) {
        return;
      }

      // 2. Deduplicate in-flight requests for identical contextKey
      if (!forceRefetch && inFlightPromiseRef.current.has(contextKey)) {
        await inFlightPromiseRef.current.get(contextKey);
        return;
      }

      setIsScheduleLoading(true);
      setResolutionStatus('resolving');

      const fetchPromise = (async () => {
        try {
          const result = await fetchSchedulesForShiftDetailed(
            op.operationalDate,
            dbShiftCode,
            activeDatasetId
          );
          lastFetchedContextRef.current = contextKey;
          setFetchStatus(result.status);

          if (result.status === 'SUCCESS_WITH_DATA') {
            const v2Doc = result.rawV2Docs?.[0];
            const resolved = resolveActiveSessionStaff(technicians, dbShiftCode, op.operationalDate, v2Doc);

            if (resolved.onDutyIds.length > 0) {
              let scheduledIds = resolved.onDutyIds;

              // Check if logged-in user is a supervisor (supervisors monitor, they are not duty technicians on checklist)
              const isLoggedInSupervisor = loggedInTechnician
                ? isSupervisorUser(loggedInTechnician, technicians)
                : Boolean(currentUserProfile?.role === 'supervisor');

              // If logged-in user is a regular technician and actually scheduled on-duty, prioritize their position
              if (loggedInTechnician && !isLoggedInSupervisor && scheduledIds.includes(loggedInTechnician.id)) {
                scheduledIds = [
                  loggedInTechnician.id,
                  ...scheduledIds.filter((id) => id !== loggedInTechnician.id),
                ];
              }

              const scheduledNames = resolveTechnicianNames(scheduledIds, technicians);

              const sessionToCache: CachedShiftSession = {
                dataset_id: activeDatasetId,
                operational_date: op.operationalDate,
                shift: op.shift,
                shift_code: dbShiftCode,
                schedule_document_id: canonicalDocId,
                updated_at: v2Doc?.updated_at || null,
                technician_ids: scheduledIds,
                technician_names: scheduledNames,
                supervisor_on_duty: resolved.supervisorOnDuty,
                resolved_at: new Date().toISOString(),
                source: 'firestore_v2',
              };
              saveCachedShiftSession(sessionToCache);

              setScheduleAvailable(true);
              setIsScheduleEmpty(false);
              setScheduleWarning(null);

              setCurrentSession((prev) => ({
                ...prev,
                id: prev.operational_date !== op.operationalDate || prev.shift !== op.shift ? Date.now() : prev.id,
                operational_date: op.operationalDate,
                shift: op.shift,
                started_at: op.shift === 'Pagi' ? '07:00' : '19:00',
                ended_at: op.shift === 'Pagi' ? '18:59' : '06:59',
                technician_ids: scheduledIds,
                technician_names: scheduledNames,
              }));
              setResolutionStatus('resolved');
            } else {
              // Document exists but 0 on-duty staff
              setScheduleAvailable(false);
              setIsScheduleEmpty(true);
              const fallbackIds = loggedInTechnician ? [loggedInTechnician.id] : [];
              const fallbackNames = loggedInTechnician ? [loggedInTechnician.name] : [];
              setScheduleWarning(
                'Belum ada teknisi yang dijadwalkan pada shift ini. Sementara, laporan akan dicatat atas nama akun yang sedang login.'
              );
              setCurrentSession((prev) => ({
                ...prev,
                operational_date: op.operationalDate,
                shift: op.shift,
                started_at: op.shift === 'Pagi' ? '07:00' : '19:00',
                ended_at: op.shift === 'Pagi' ? '18:59' : '06:59',
                technician_ids: fallbackIds,
                technician_names: fallbackNames,
              }));
              setResolutionStatus('fallback');
            }
          } else if (result.status === 'SUCCESS_EMPTY') {
            // No schedule doc found
            setScheduleAvailable(false);
            setIsScheduleEmpty(true);
            const fallbackIds = loggedInTechnician ? [loggedInTechnician.id] : [];
            const fallbackNames = loggedInTechnician ? [loggedInTechnician.name] : [];
            setScheduleWarning(
              'Belum ada teknisi yang dijadwalkan pada shift ini. Sementara, laporan akan dicatat atas nama akun yang sedang login.'
            );
            setCurrentSession((prev) => ({
              ...prev,
              operational_date: op.operationalDate,
              shift: op.shift,
              started_at: op.shift === 'Pagi' ? '07:00' : '19:00',
              ended_at: op.shift === 'Pagi' ? '18:59' : '06:59',
              technician_ids: fallbackIds,
              technician_names: fallbackNames,
            }));
            setResolutionStatus('fallback');
          } else {
            // Error response (e.g. PERMISSION_DENIED, NETWORK_ERROR)
            setIsScheduleEmpty(false);
            const cached = getValidCachedShiftSession({
              dataset_id: activeDatasetId,
              operational_date: op.operationalDate,
              shift: op.shift,
              schedule_document_id: canonicalDocId,
            });

            let fallbackIds = loggedInTechnician ? [loggedInTechnician.id] : [];
            let fallbackNames = loggedInTechnician ? [loggedInTechnician.name] : [];

            if (cached && cached.technician_ids.length > 0) {
              fallbackIds = cached.technician_ids;
              fallbackNames = cached.technician_names;
              setScheduleAvailable(true);
            } else {
              setScheduleAvailable(false);
            }

            setScheduleWarning(
              'Jadwal shift tidak dapat dimuat. Sementara, laporan akan dicatat atas nama akun yang sedang login.'
            );
            setCurrentSession((prev) => ({
              ...prev,
              operational_date: op.operationalDate,
              shift: op.shift,
              started_at: op.shift === 'Pagi' ? '07:00' : '19:00',
              ended_at: op.shift === 'Pagi' ? '18:59' : '06:59',
              technician_ids: fallbackIds,
              technician_names: fallbackNames,
            }));
            setResolutionStatus('fallback');
          }
        } catch (err: any) {
          const fallbackIds = loggedInTechnician ? [loggedInTechnician.id] : [];
          const fallbackNames = loggedInTechnician ? [loggedInTechnician.name] : [];
          setScheduleWarning(
            'Jadwal shift tidak dapat dimuat. Sementara, laporan akan dicatat atas nama akun yang sedang login.'
          );
          setCurrentSession((prev) => ({
            ...prev,
            operational_date: op.operationalDate,
            shift: op.shift,
            started_at: op.shift === 'Pagi' ? '07:00' : '19:00',
            ended_at: op.shift === 'Pagi' ? '18:59' : '06:59',
            technician_ids: fallbackIds,
            technician_names: fallbackNames,
          }));
          setResolutionStatus('fallback');
        } finally {
          setIsScheduleLoading(false);
          inFlightPromiseRef.current.delete(contextKey);
        }
      })();

      inFlightPromiseRef.current.set(contextKey, fetchPromise);
      await fetchPromise;
    },
    [isLoggedIn, activeDatasetId, technicians, currentUserProfile, currentUserEmail, loggedInTechnician]
  );

  // Automatic Resolution Effect & Timer
  useEffect(() => {
    if (!isLoggedIn) {
      setIsScheduleLoading((prev) => (prev ? false : prev));
      setScheduleWarning((prev) => (prev !== null ? null : prev));
      setResolutionStatus((prev) => (prev !== 'idle' ? 'idle' : prev));
      lastFetchedContextRef.current = null;
      return;
    }

    checkAndUpdateShift(false);

    // 30s timer for checking operational shift rollover locally ONLY (zero queries if context key unchanged)
    const intervalId = setInterval(() => {
      const op = getOperationalShift();
      const dbShiftCode = op.shift === 'Pagi' ? 'PS' : 'M';
      const currentUserId = currentUserProfile?.uid || currentUserEmail || '';
      const currentKey = `${currentUserId}:${op.operationalDate}:${dbShiftCode}`;

      if (lastFetchedContextRef.current !== currentKey) {
        checkAndUpdateShift(false);
      }
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isLoggedIn, checkAndUpdateShift, currentUserProfile, currentUserEmail]);

  // Window Focus & Visibility Change Handler
  useEffect(() => {
    if (!isLoggedIn) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const op = getOperationalShift();
        const dbShiftCode = op.shift === 'Pagi' ? 'PS' : 'M';
        const currentUserId = currentUserProfile?.uid || currentUserEmail || '';
        const currentKey = `${currentUserId}:${op.operationalDate}:${dbShiftCode}`;

        if (lastFetchedContextRef.current !== currentKey) {
          checkAndUpdateShift(false);
        }
      }
    };

    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLoggedIn, checkAndUpdateShift, currentUserProfile, currentUserEmail]);

  // Check whether the logged in user is actually scheduled on duty for this shift
  const isOnDuty = useMemo(() => {
    if (!loggedInTechnician) {
      // If supervisor without technician ID, consider as supervisor monitor
      return currentUserProfile?.role === 'supervisor';
    }
    const isSup = isSupervisorUser(loggedInTechnician, technicians);
    if (isSup) return true; // Supervisor always has operational visibility
    return currentSession.technician_ids.includes(loggedInTechnician.id);
  }, [loggedInTechnician, currentUserProfile, technicians, currentSession.technician_ids]);

  return {
    currentSession,
    setCurrentSession,
    scheduleAvailable,
    isScheduleEmpty,
    fetchStatus,
    isScheduleLoading,
    scheduleWarning,
    resolutionStatus,
    technicianNames,
    loggedInTechnician,
    isOnDuty,
    handleSaveShift,
    handleLoginTechnicianSession,
    refreshSchedule: () => checkAndUpdateShift(true),
  };
}
