import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Role,
  NavigationTab,
  Equipment,
  ShiftType,
  PreventiveSession,
} from './types';
import { AuthState } from './types/auth';
import { buildStructuredReportData } from './services/reportService';
import {
  getActivePreventiveRecords,
  getActiveCorrectiveReports,
} from './utils/contextFilter';
import { subscribeAuthState, signOutUser } from './services/authService';
import { clearProtectedCache } from './services/localCache';
import { useMasterData, useShiftSession, useAppDataSync } from './hooks';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { ShiftModal } from './components/ShiftModal';
import { SupervisorLoginModal } from './components/SupervisorLoginModal';
import { DashboardView } from './components/DashboardView';
import { PreventiveView } from './components/PreventiveView';
import { CorrectiveView } from './components/CorrectiveView';
import { ReportView } from './components/ReportView';
import { MasterDataView } from './components/MasterDataView';
import { ScheduleView } from './components/ScheduleView';
import { EquipmentTimelineView } from './components/EquipmentTimelineView';
import { EquipmentCatalogView } from './components/EquipmentCatalogView';
import { TelegramBotModal } from './components/TelegramBotModal';
import { AttendanceScreen } from './components/AttendanceScreen';
import { QrScannerModal } from './components/QrScannerModal';
import { MachineQrModal } from './components/MachineQrModal';
import { AttendanceRecord, AttendanceSessionState } from './types';
import { getTodayAttendanceState } from './services/attendanceService';
import { syncOperationalStateToServer } from './services/telegramService';
import { Header } from './components/Header';
import {
  AlertTriangle,
  RefreshCw,
  Coffee,
  UserCheck,
} from 'lucide-react';

export default function App() {
  // Auth State
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    isAuthenticated: false,
    isAuthorized: false,
    role: null,
    isLoading: true,
    error: null,
  });

  // Navigation State with Session Persistence
  const [activeTab, setActiveTabState] = useState<NavigationTab>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('faskampen_active_tab') as NavigationTab | null;
      if (saved && ['dashboard', 'preventive', 'corrective', 'reports', 'master', 'schedule', 'timeline'].includes(saved)) {
        return saved;
      }
    }
    return 'preventive';
  });

  // Responsive Mobile Drawer and Desktop Collapsible Sidebar State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar_collapsed');
      if (saved !== null) return saved === 'true';
    }
    return false;
  });

  // Always close mobile navigation drawer when changing tabs
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeTab]);

  const handleToggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const setActiveTab = useCallback((tab: NavigationTab) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('faskampen_active_tab', tab);
      }
    } catch {}
    setActiveTabState(tab);
  }, []);

  const [masterSubTab, setMasterSubTabState] = useState<'equipment' | 'location' | 'type' | 'checklist' | 'technician' | 'telegram'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('faskampen_master_sub_tab') as any;
      if (saved && ['equipment', 'location', 'type', 'checklist', 'technician', 'telegram'].includes(saved)) {
        return saved;
      }
    }
    return 'equipment';
  });

  const setMasterSubTab = useCallback((subTab: 'equipment' | 'location' | 'type' | 'checklist' | 'technician' | 'telegram') => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('faskampen_master_sub_tab', subTab);
      }
    } catch {}
    setMasterSubTabState(subTab);
  }, []);

  const [selectedTimelineEquipmentId, setSelectedTimelineEquipmentId] = useState<number | null>(null);
  const [timelineBackTab, setTimelineBackTab] = useState<'master' | 'dashboard' | 'timeline'>('master');
  const [reportSubTab, setReportSubTab] = useState<'wa' | 'excel' | 'pdf' | 'history'>('wa');

  // Modals & Pre-selection
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isSupervisorLoginOpen, setIsSupervisorLoginOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isQrScannerModalOpen, setIsQrScannerModalOpen] = useState(false);
  const [qrModalEquipment, setQrModalEquipment] = useState<Equipment | null>(null);
  const [preSelectedEquipmentId, setPreSelectedEquipmentId] = useState<number | null>(null);

  // Attendance Session State
  const [attendanceSession, setAttendanceSession] = useState<AttendanceSessionState>(() => {
    return {
      hasAttended: false,
      isBypassed: false,
      isOffDuty: false,
    };
  });

  // Concurrency & state refs to eliminate re-entrancy loops
  const initialStartupSyncDoneRef = useRef(false);
  const hasInitializedTabRef = useRef(false);
  const authStateRef = useRef<{ isAuthenticated: boolean; isAuthorized: boolean }>({
    isAuthenticated: false,
    isAuthorized: false,
  });

  // Master Data Hook
  const masterData = useMasterData();

  // Shift & Session Hook (auto shift & schedule polling)
  const [activeDatasetIdState, setActiveDatasetIdState] = useState<string>('default');

  const currentUserUid = authState.user?.uid || null;
  const role: Role = (authState.role as Role) || 'technician';

  const isBaseAuthorized = authState.isAuthenticated && authState.isAuthorized;

  const shiftSession = useShiftSession({
    isLoggedIn: isBaseAuthorized,
    technicians: masterData.technicians,
    activeDatasetId: activeDatasetIdState,
    currentUserProfile: authState.profile,
    currentUserEmail: authState.user?.email,
  });

  // Application Security Gate: Requires valid authentication & completed schedule resolution ('resolved' or 'fallback')
  const isResolutionFinished =
    shiftSession.resolutionStatus === 'resolved' ||
    shiftSession.resolutionStatus === 'fallback';

  const canEnterOperationalApp =
    isBaseAuthorized &&
    (authState.role === 'supervisor' || isResolutionFinished);

  // Cloud Sync & App Data Hook
  const syncData = useAppDataSync({
    isLoggedIn: canEnterOperationalApp,
    currentUserUid,
    currentSession: shiftSession.currentSession,
    equipments: masterData.equipments,
    equipmentTypes: masterData.equipmentTypes,
    locations: masterData.locations,
    authStateRef,
  });

  // Stable ref to syncFromCloud to prevent re-subscribing in effect
  const syncFromCloudRef = useRef(syncData.syncFromCloud);
  useEffect(() => {
    syncFromCloudRef.current = syncData.syncFromCloud;
  }, [syncData.syncFromCloud]);

  // Keep activeDatasetIdState in sync with syncData.activeDatasetId
  useEffect(() => {
    setActiveDatasetIdState((prev) => (prev === syncData.activeDatasetId ? prev : syncData.activeDatasetId));
  }, [syncData.activeDatasetId]);

  // Initial Startup Cloud Sync (strictly ONCE on app load)
  useEffect(() => {
    if (!initialStartupSyncDoneRef.current) {
      initialStartupSyncDoneRef.current = true;
      syncFromCloudRef.current();
    }
  }, []);

  // Subscribe to Auth State changes (syncs data when authorized, guarded to run only once per unique user session)
  const lastSyncedAuthUidRef = useRef<string | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeAuthState(async (newAuthState) => {
      setAuthState((prev) => {
        if (
          prev.isAuthenticated === newAuthState.isAuthenticated &&
          prev.isAuthorized === newAuthState.isAuthorized &&
          prev.role === newAuthState.role &&
          prev.isLoading === newAuthState.isLoading &&
          prev.error === newAuthState.error &&
          prev.user?.uid === newAuthState.user?.uid &&
          prev.profile?.role === newAuthState.profile?.role &&
          prev.profile?.display_name === newAuthState.profile?.display_name &&
          prev.profile?.technician_id === newAuthState.profile?.technician_id
        ) {
          return prev;
        }
        return newAuthState;
      });
      authStateRef.current = {
        isAuthenticated: newAuthState.isAuthenticated,
        isAuthorized: newAuthState.isAuthorized,
      };

      if (newAuthState.isAuthenticated && newAuthState.isAuthorized && newAuthState.user) {
        // ONLY pick a default tab ONCE upon initial app startup if no tab is stored in session
        if (!hasInitializedTabRef.current) {
          hasInitializedTabRef.current = true;
          const savedTab = typeof window !== 'undefined' ? sessionStorage.getItem('faskampen_active_tab') : null;
          if (!savedTab) {
            setActiveTab(newAuthState.role === 'supervisor' ? 'dashboard' : 'preventive');
          }
        }
        // Guard cloud sync to only run once per unique user session or on user switch
        if (lastSyncedAuthUidRef.current !== newAuthState.user.uid) {
          lastSyncedAuthUidRef.current = newAuthState.user.uid;
          syncFromCloudRef.current();
        }
      } else {
        lastSyncedAuthUidRef.current = null;
      }
    });
    return () => unsubscribe();
  }, [setActiveTab]);

  // Sync latest equipment & operational state to server for Telegram bot commands (/alat, /brief)
  useEffect(() => {
    if (masterData.equipments && masterData.equipments.length > 0) {
      syncOperationalStateToServer({
        operationalDate: shiftSession.currentSession.operational_date,
        shift: shiftSession.currentSession.shift,
        technicianNames: shiftSession.technicianNames,
        equipments: masterData.equipments,
        correctiveReports: syncData.correctiveReports,
      }).catch(() => {});
    }
  }, [
    masterData.equipments,
    syncData.correctiveReports,
    shiftSession.currentSession.operational_date,
    shiftSession.currentSession.shift,
    shiftSession.technicianNames,
  ]);

  // Deep-linking from scanned machine QR code URL (e.g. ?equipment=5 or ?eq=5 or ?code=SMP-VIP-01)
  useEffect(() => {
    if (!masterData.equipments || masterData.equipments.length === 0) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const eqIdParam = urlParams.get('equipment') || urlParams.get('eq');
      const eqCodeParam = urlParams.get('code');

      let targetEq: Equipment | undefined;
      if (eqIdParam) {
        targetEq = masterData.equipments.find((e) => e.id === Number(eqIdParam));
      }
      if (!targetEq && eqCodeParam) {
        targetEq = masterData.equipments.find(
          (e) => (e.equipment_code || '').toLowerCase() === eqCodeParam.toLowerCase()
        );
      }

      if (targetEq?.id) {
        setSelectedTimelineEquipmentId(targetEq.id);
        setTimelineBackTab('dashboard');
        setActiveTab('timeline');
      }
    } catch (e) {
      console.warn('Gagal membaca parameter deep link URL:', e);
    }
  }, [masterData.equipments, setActiveTab]);

  // Role Access Guard: Non-supervisor cannot access master data or schedule tabs
  useEffect(() => {
    // Crucial: Never guard/redirect while auth state is still loading to prevent race conditions
    if (authState.isLoading) return;
    if (authState.isAuthenticated && role !== 'supervisor' && (activeTab === 'master' || activeTab === 'schedule')) {
      setActiveTab('preventive');
    }
  }, [role, activeTab, authState.isLoading, authState.isAuthenticated, setActiveTab]);

  // Check today's attendance state for active logged-in technician
  const primaryTechName =
    authState.profile?.display_name ||
    authState.profile?.name ||
    shiftSession.loggedInTechnician?.name ||
    shiftSession.technicianNames?.[0] ||
    '';
  useEffect(() => {
    if (!primaryTechName) return;
    const todayState = getTodayAttendanceState(primaryTechName);
    setAttendanceSession((prev) => {
      if (
        prev.hasAttended === todayState.hasAttended &&
        prev.isBypassed === todayState.isBypassed &&
        prev.isOffDuty === todayState.isOffDuty &&
        prev.record?.id === todayState.record?.id
      ) {
        return prev;
      }
      return todayState;
    });
  }, [primaryTechName]);

  // Logout Handler (cleans session and protected runtime state)
  const handleLogout = async () => {
    const prevUid = currentUserUid;
    await signOutUser();
    authStateRef.current = {
      isAuthenticated: false,
      isAuthorized: false,
    };
    if (prevUid) {
      clearProtectedCache(prevUid);
    }
    syncData.clearDataOnLogout();
    // Refresh page upon logout for both technician and supervisor
    window.location.reload();
  };

  // Login / Session Selection Handler for Authorized Technician
  const handleLoginTechnician = (selectedTechIds: number[]) => {
    if (authState.role === 'technician' && (!selectedTechIds || selectedTechIds.length === 0)) {
      console.warn('Login rejected: technician_ids cannot be empty');
      return;
    }
    shiftSession.handleLoginTechnicianSession(selectedTechIds);
    if (authState.role === 'supervisor') {
      setActiveTab('dashboard');
    } else {
      setActiveTab('preventive'); // Halaman utama teknisi langsung disuguhkan dengan preventif
    }
  };

  // Active Context Filtered & Deduplicated Records
  const activeContext = useMemo(() => ({
    datasetId: syncData.activeDatasetId,
    operationalDate: shiftSession.currentSession.operational_date,
    shift: shiftSession.currentSession.shift,
  }), [syncData.activeDatasetId, shiftSession.currentSession.operational_date, shiftSession.currentSession.shift]);

  const activePreventiveEntries = useMemo(
    () => getActivePreventiveRecords(syncData.preventiveEntries, activeContext),
    [syncData.preventiveEntries, activeContext]
  );
  const activeCorrectiveReports = useMemo(
    () => getActiveCorrectiveReports(syncData.correctiveReports, activeContext),
    [syncData.correctiveReports, activeContext]
  );

  const [historicalContext, setHistoricalContext] = useState<{ rawDate: string; shift: ShiftType } | null>(null);

  // Structured Report Builder Data (memoized to compute only when active tab is reports/master or data changes)
  const structuredReportData = useMemo(() => {
    if (activeTab !== 'reports' && activeTab !== 'master') return null;

    if (historicalContext) {
      const histSession: PreventiveSession = {
        id: Date.now(),
        dataset_id: syncData.activeDatasetId,
        operational_date: historicalContext.rawDate,
        shift: historicalContext.shift,
        technician_ids: [],
        technician_names: shiftSession.technicianNames,
        started_at: `${historicalContext.rawDate}T08:00:00`,
        ended_at: `${historicalContext.rawDate}T16:00:00`,
        status: 'completed',
      };

      const histContext = {
        datasetId: syncData.activeDatasetId,
        operationalDate: historicalContext.rawDate,
        shift: historicalContext.shift,
      };

      const histPreventive = getActivePreventiveRecords(syncData.preventiveEntries, histContext);
      const histCorrective = getActiveCorrectiveReports(syncData.correctiveReports, histContext);

      return buildStructuredReportData(
        histSession,
        histPreventive,
        masterData.equipments,
        masterData.equipmentTypes,
        masterData.technicians,
        histCorrective,
        masterData.locations
      );
    }

    return buildStructuredReportData(
      shiftSession.currentSession,
      activePreventiveEntries,
      masterData.equipments,
      masterData.equipmentTypes,
      masterData.technicians,
      activeCorrectiveReports,
      masterData.locations
    );
  }, [
    activeTab,
    historicalContext,
    syncData.activeDatasetId,
    syncData.preventiveEntries,
    syncData.correctiveReports,
    shiftSession.currentSession,
    shiftSession.technicianNames,
    activePreventiveEntries,
    activeCorrectiveReports,
    masterData.equipments,
    masterData.equipmentTypes,
    masterData.technicians,
    masterData.locations,
  ]);

  // Check if technician needs to complete attendance before accessing dashboard
  const needsAttendance =
    canEnterOperationalApp &&
    role !== 'supervisor' &&
    !attendanceSession.hasAttended &&
    !attendanceSession.isBypassed &&
    !attendanceSession.isOffDuty;

  // Render Login Screen if not logged in / not authorized
  if (!canEnterOperationalApp) {
    return (
      <LoginScreen
        technicians={masterData.technicians}
        authState={authState}
        onLoginTechnician={handleLoginTechnician}
        onLogout={handleLogout}
        isScheduleLoading={shiftSession.isScheduleLoading}
      />
    );
  }

  // Render Attendance Screen if logged in but hasn't attended / bypassed / off-duty yet
  if (needsAttendance) {
    const isScheduleUndefined =
      shiftSession.resolutionStatus === 'fallback' ||
      !shiftSession.technicianNames ||
      shiftSession.technicianNames.length === 0;

    return (
      <AttendanceScreen
        technicians={masterData.technicians}
        currentUserProfile={authState.profile}
        currentUserEmail={authState.user?.email || undefined}
        defaultTechnicianName={
          authState.profile?.display_name ||
          authState.profile?.name ||
          shiftSession.loggedInTechnician?.name ||
          shiftSession.technicianNames?.[0]
        }
        isScheduleUndefined={isScheduleUndefined}
        onCompleteAttendance={(record) => {
          setAttendanceSession({
            hasAttended: true,
            isBypassed: false,
            isOffDuty: false,
            record,
          });
          if (record?.technician_name) {
            const attendingTech = masterData.technicians?.find(
              (t) => t?.name && t.name.toLowerCase() === record.technician_name?.toLowerCase()
            );
            if (attendingTech?.id) {
              shiftSession.handleLoginTechnicianSession([attendingTech.id]);
            }
          }
        }}
        onBypassAttendance={(record) => {
          setAttendanceSession({
            hasAttended: false,
            isBypassed: true,
            isOffDuty: false,
            record,
          });
        }}
        onOffDuty={(record) => {
          setAttendanceSession({
            hasAttended: false,
            isBypassed: false,
            isOffDuty: true,
            record,
          });
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row selection:bg-blue-100">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        masterSubTab={masterSubTab}
        setMasterSubTab={setMasterSubTab}
        role={role}
        shift={shiftSession.currentSession.shift}
        operationalDate={shiftSession.currentSession.operational_date}
        technicianNames={shiftSession.technicianNames}
        onLogout={handleLogout}
        onOpenShiftModal={() => setIsShiftModalOpen(true)}
        onOpenSupervisorLogin={() => setIsSupervisorLoginOpen(true)}
        onLogoutSupervisor={handleLogout}
        syncStatus={syncData.syncStatus}
        lastSyncTime={syncData.lastSyncTime}
        onManualSync={() => syncData.syncFromCloud(undefined, undefined, true)}
        activeDatasetId={syncData.activeDatasetId}
        onOpenTelegramModal={() => setIsTelegramModalOpen(true)}
        onOpenAttendanceModal={() => setIsAttendanceModalOpen(true)}
        onOpenQrScanner={() => setIsQrScannerModalOpen(true)}
        onOpenQrPrint={() => setQrModalEquipment(masterData.equipments[0] || null)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        activeReportSubTab={reportSubTab}
        onSelectReportSubTab={setReportSubTab}
      />

      {/* Main Views Layout */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <Header
          shift={shiftSession.currentSession.shift}
          operationalDate={shiftSession.currentSession.operational_date}
          technicianNames={shiftSession.technicianNames}
          role={role}
          onOpenShiftModal={() => setIsShiftModalOpen(true)}
          onOpenSupervisorLogin={() => setIsSupervisorLoginOpen(true)}
          onLogoutSupervisor={handleLogout}
          activeTab={activeTab}
          setActiveTab={(tab) => setActiveTab(tab as NavigationTab)}
        />

        {/* Off-Duty / Viewer Mode Banner */}
        {attendanceSession.isOffDuty && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <Coffee className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <b>Mode Pemantau (Off-Duty / Libur):</b> Anda sedang login tanpa mencatat kehadiran shift hari ini.
              </span>
            </div>
            <button
              onClick={() => setIsAttendanceModalOpen(true)}
              className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded-lg text-xs transition cursor-pointer"
            >
              Isi Presensi Shift
            </button>
          </div>
        )}

        {/* Main Content Area: Uniform Container Width & Spacing Across All Tabs */}
        <main className="flex-1 w-full px-3 sm:px-5 lg:px-6 xl:px-8 py-3.5 sm:py-5 max-w-[1920px] mx-auto transition-all duration-300">
          {/* Automatic Resolution Schedule Warning Banner */}
          {shiftSession.scheduleWarning && (
            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200/90 rounded-2xl flex items-center justify-between gap-3 text-amber-900 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs font-medium leading-relaxed">
                  {shiftSession.scheduleWarning}
                </div>
              </div>
              {(shiftSession.resolutionStatus === 'fallback' || shiftSession.isScheduleEmpty) && (
                <button
                  onClick={() => shiftSession.refreshSchedule()}
                  disabled={shiftSession.isScheduleLoading}
                  className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${shiftSession.isScheduleLoading ? 'animate-spin' : ''}`} />
                  <span>Coba Muat Ulang Jadwal</span>
                </button>
              )}
            </div>
          )}
          {activeTab === 'dashboard' && (
            <DashboardView
              equipments={masterData.equipments}
              equipmentTypes={masterData.equipmentTypes}
              locations={masterData.locations}
              preventiveEntries={activePreventiveEntries}
              correctiveReports={activeCorrectiveReports}
              currentSession={shiftSession.currentSession}
              role={role}
              onStartPreventive={(eqId) => {
                setPreSelectedEquipmentId(eqId || null);
                setActiveTab('preventive');
              }}
              technicianNames={shiftSession.technicianNames}
              onOpenShiftModal={() => setIsShiftModalOpen(true)}
              onOpenTelegramModal={() => setIsTelegramModalOpen(true)}
              onOpenQrScanner={() => setIsQrScannerModalOpen(true)}
              onOpenQrPrint={(eq) => setQrModalEquipment(eq || masterData.equipments[0] || null)}
              onOpenReportsTab={() => setActiveTab('reports')}
              onDeletePreventiveEntry={syncData.handleDeletePreventiveEntry}
              onViewTimeline={(eqId) => {
                setSelectedTimelineEquipmentId(eqId);
                setTimelineBackTab('dashboard');
                setActiveTab('timeline');
              }}
            />
          )}

          {activeTab === 'preventive' && (
            <PreventiveView
              equipments={masterData.equipments}
              equipmentTypes={masterData.equipmentTypes}
              locations={masterData.locations}
              frequencies={masterData.frequencies}
              checklistItems={masterData.checklistItems}
              preventiveEntries={activePreventiveEntries}
              preSelectedEquipmentId={preSelectedEquipmentId}
              onClearPreSelectedEquipmentId={() => setPreSelectedEquipmentId(null)}
              onSubmitEntry={syncData.handleSubmitPreventiveEntry}
              onBackToDashboard={() => setActiveTab('dashboard')}
              operationalDate={shiftSession.currentSession.operational_date}
              shift={shiftSession.currentSession.shift}
            />
          )}

          {activeTab === 'corrective' && (
            <CorrectiveView
              correctiveReports={activeCorrectiveReports}
              equipments={masterData.equipments}
              equipmentTypes={masterData.equipmentTypes}
              locations={masterData.locations}
              onAddCorrective={syncData.handleAddCorrective}
              technicianNames={shiftSession.technicianNames}
              shift={shiftSession.currentSession.shift}
              operationalDate={shiftSession.currentSession.operational_date}
            />
          )}

          {activeTab === 'reports' && structuredReportData && (
            <ReportView
              structuredData={structuredReportData}
              preventiveEntries={syncData.preventiveEntries}
              correctiveReports={syncData.correctiveReports}
              equipments={masterData.equipments}
              equipmentTypes={masterData.equipmentTypes}
              technicians={masterData.technicians}
              locations={masterData.locations}
              currentSession={shiftSession.currentSession}
              selectedHistoricalDate={historicalContext?.rawDate}
              selectedHistoricalShift={historicalContext?.shift}
              isHistoricalActive={!!historicalContext}
              onSelectHistoricalReport={(rawDate, shift) => {
                setHistoricalContext({ rawDate, shift });
              }}
              onResetToCurrentSession={() => {
                setHistoricalContext(null);
              }}
              activeSubTab={reportSubTab}
              onSubTabChange={setReportSubTab}
            />
          )}

          {activeTab === 'master' && (
            <MasterDataView
              equipments={masterData.equipments}
              equipmentTypes={masterData.equipmentTypes}
              locations={masterData.locations}
              frequencies={masterData.frequencies}
              checklistItems={masterData.checklistItems}
              preventiveEntries={syncData.preventiveEntries}
              correctiveReports={syncData.correctiveReports}
              currentSession={shiftSession.currentSession}
              onSelectHistoricalReport={(rawDate, shift) => {
                setHistoricalContext({ rawDate, shift });
              }}
              onOpenReportView={() => {
                setActiveTab('reports');
              }}
              onAddEquipment={masterData.handleAddEquipment}
              onUpdateEquipment={masterData.handleUpdateEquipment}
              onDeleteEquipment={masterData.handleDeleteEquipment}
              onToggleEquipmentActive={masterData.handleToggleEquipmentActive}
              onAddLocation={masterData.handleAddLocation}
              onUpdateLocation={masterData.handleUpdateLocation}
              onDeleteLocation={masterData.handleDeleteLocation}
              onToggleLocationActive={masterData.handleToggleLocationActive}
              onAddEquipmentType={masterData.handleAddEquipmentType}
              onUpdateEquipmentType={masterData.handleUpdateEquipmentType}
              onDeleteEquipmentType={masterData.handleDeleteEquipmentType}
              onToggleEquipmentTypeActive={masterData.handleToggleEquipmentTypeActive}
              onAddChecklistItem={masterData.handleAddChecklistItem}
              onUpdateChecklistItem={masterData.handleUpdateChecklistItem}
              onDeleteChecklistItem={masterData.handleDeleteChecklistItem}
              onToggleChecklistItemActive={masterData.handleToggleChecklistItemActive}
              technicians={masterData.technicians}
              onAddTechnician={masterData.handleAddTechnician}
              onUpdateTechnician={masterData.handleUpdateTechnician}
              onDeleteTechnician={masterData.handleDeleteTechnician}
              onToggleTechnicianActive={masterData.handleToggleTechnicianActive}
              onResetMasterData={masterData.handleResetMasterData}
              activeDatasetId={syncData.activeDatasetId}
              onSwitchDataset={syncData.handleSwitchDataset}
              activeSubTab={masterSubTab}
              onChangeSubTab={setMasterSubTab}
              onViewTimeline={(eqId) => {
                setSelectedTimelineEquipmentId(eqId);
                setTimelineBackTab('master');
                setActiveTab('timeline');
              }}
            />
          )}

          {activeTab === 'schedule' && (
            <ScheduleView
              technicians={masterData.technicians}
              role={role}
              activeDatasetId={syncData.activeDatasetId}
            />
          )}

          {activeTab === 'timeline' && selectedTimelineEquipmentId === null && (
            <EquipmentCatalogView
              equipments={masterData.equipments}
              locations={masterData.locations}
              equipmentTypes={masterData.equipmentTypes}
              preventiveEntries={activePreventiveEntries}
              correctiveReports={activeCorrectiveReports}
              onSelectEquipment={(eqId) => {
                setSelectedTimelineEquipmentId(eqId);
                setTimelineBackTab('timeline');
              }}
              onOpenQrPrint={(eq) => setQrModalEquipment(eq || masterData.equipments[0] || null)}
              onOpenQrScanner={() => setIsQrScannerModalOpen(true)}
            />
          )}

          {activeTab === 'timeline' && selectedTimelineEquipmentId !== null && (
            <EquipmentTimelineView
              equipmentId={selectedTimelineEquipmentId}
              equipment={(masterData.equipments || []).find((e) => e && e.id === selectedTimelineEquipmentId)}
              datasetId={syncData.activeDatasetId}
              isLoggedIn={canEnterOperationalApp}
              currentUserUid={currentUserUid}
              techniciansList={masterData.technicians || []}
              locations={masterData.locations || []}
              equipmentTypes={masterData.equipmentTypes || []}
              role={role}
              preventiveEntries={activePreventiveEntries}
              correctiveReports={activeCorrectiveReports}
              onDeletePreventiveEntry={syncData.handleDeletePreventiveEntry}
              onStartPreventive={(eqId) => {
                setPreSelectedEquipmentId(eqId);
                setActiveTab('preventive');
              }}
              onOpenCorrective={() => {
                setActiveTab('corrective');
              }}
              onBack={() => {
                if (timelineBackTab === 'dashboard') {
                  setActiveTab('dashboard');
                } else {
                  setSelectedTimelineEquipmentId(null);
                }
              }}
            />
          )}
        </main>
      </div>

      {/* Shift On Duty Selection Modal */}
      <ShiftModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        technicians={masterData.technicians}
        selectedTechIds={shiftSession.currentSession.technician_ids}
        currentShift={shiftSession.currentSession.shift}
        operationalDate={shiftSession.currentSession.operational_date}
        onSaveShift={shiftSession.handleSaveShift}
        activeDatasetId={syncData.activeDatasetId}
      />

      {/* Supervisor Login Modal */}
      <SupervisorLoginModal
        isOpen={isSupervisorLoginOpen}
        onClose={() => setIsSupervisorLoginOpen(false)}
        onLoginSuccess={() => {
          setActiveTab('dashboard');
        }}
      />

      {/* Telegram Bot Notification Settings Modal */}
      <TelegramBotModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
      />

      {/* Attendance Modal (opened on demand from Sidebar) */}
      {isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex flex-col justify-center items-center p-4">
          <div className="w-full max-w-2xl relative">
            <button
              onClick={() => setIsAttendanceModalOpen(false)}
              className="absolute top-4 right-4 z-50 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-full border border-slate-700 cursor-pointer shadow-lg transition"
              title="Tutup Presensi"
            >
              ✕
            </button>
            <AttendanceScreen
              technicians={masterData.technicians}
              currentUserProfile={authState.profile}
              currentUserEmail={authState.user?.email || undefined}
              defaultTechnicianName={
                authState.profile?.display_name ||
                authState.profile?.name ||
                shiftSession.loggedInTechnician?.name ||
                shiftSession.technicianNames?.[0]
              }
              onCompleteAttendance={(record) => {
                setAttendanceSession({
                  hasAttended: true,
                  isBypassed: false,
                  isOffDuty: false,
                  record,
                });
                if (record?.technician_name) {
                  const attendingTech = masterData.technicians?.find(
                    (t) => t?.name && t.name.toLowerCase() === record.technician_name?.toLowerCase()
                  );
                  if (attendingTech?.id) {
                    shiftSession.handleLoginTechnicianSession([attendingTech.id]);
                  }
                }
                setIsAttendanceModalOpen(false);
              }}
              onBypassAttendance={() => {
                setAttendanceSession((prev) => ({
                  ...prev,
                  isBypassed: true,
                }));
                setIsAttendanceModalOpen(false);
              }}
              onOffDuty={() => {
                setAttendanceSession((prev) => ({
                  ...prev,
                  isOffDuty: true,
                }));
                setIsAttendanceModalOpen(false);
              }}
              onLogout={() => {
                setIsAttendanceModalOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* QR Scanner Modal for Technicians */}
      <QrScannerModal
        isOpen={isQrScannerModalOpen}
        onClose={() => setIsQrScannerModalOpen(false)}
        equipments={masterData.equipments}
        locations={masterData.locations}
        equipmentTypes={masterData.equipmentTypes}
        onSelectAction={(action, equipmentId) => {
          setIsQrScannerModalOpen(false);
          if (action === 'timeline' || action === 'trend') {
            setSelectedTimelineEquipmentId(equipmentId);
            setTimelineBackTab('dashboard');
            setActiveTab('timeline');
          } else if (action === 'preventive') {
            setPreSelectedEquipmentId(equipmentId);
            setActiveTab('preventive');
          } else if (action === 'corrective') {
            setActiveTab('corrective');
          }
        }}
      />

      {/* Machine QR Modal (can be opened from print action or machine selection) */}
      {qrModalEquipment && (
        <MachineQrModal
          isOpen={!!qrModalEquipment}
          onClose={() => setQrModalEquipment(null)}
          equipment={qrModalEquipment}
          locations={masterData.locations}
          equipmentTypes={masterData.equipmentTypes}
          allEquipments={masterData.equipments}
        />
      )}
    </div>
  );
}
