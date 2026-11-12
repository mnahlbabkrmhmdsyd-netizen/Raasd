import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Command,
  Map as MapIcon,
  Building2,
  Radar,
  BellRing,
  FilePlus2,
  ScrollText,
  ShieldCheck,
  Brain,
  Siren,
  Radio,
  BarChart3,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
  Globe,
  WifiOff,
  RefreshCw,
  Fingerprint,
  CheckCircle2,
} from 'lucide-react';
import type {
  AIAssessment,
  AppSettings,
  AuditLogEntry,
  DetectionEvent,
  Facility,
  ManualReport,
  NavSection,
  ResponseTask,
  SafeUser,
  SensorUnit,
} from './types';
import { NAV_ITEMS, ROLE_LABELS, formatDateTime, t } from './i18n';
import { apiFetch, getStoredToken, setStoredToken } from './utils/api';
import {
  appendSyncLog,
  getQueuedReports,
  loadOfflineSnapshot,
  removeQueuedReport,
  saveOfflineSnapshot,
} from './utils/offlineStore';
import { startEmergencyAlarmLoop, stopAlarmAudio, unlockAlarmAudio } from './utils/alarmAudio';
import { PinRequiredError, enrollBiometricForUser } from './utils/biometric';
import { LoginScreen } from './components/LoginScreen';
import { RasadLogo } from './components/RasadLogo';
import { EmergencyAlarmModal } from './components/EmergencyAlarmModal';
import { OverviewView, CommandCenterView } from './views/OverviewAndCommand';
import { FacilitiesView, MonitoringMapView, CoverageMapView } from './views/FacilitiesAndMaps';
import { DroneDetectionView, AIIntelligenceView } from './views/DetectionAndAI';
import { AlertsView, ReportsView, EventLogView } from './views/AlertsReportsEvents';
import { EmergencyResponseView, SensorsView } from './views/ResponseAndSensors';
import { AnalyticsView, UsersView, SettingsView } from './views/AnalyticsUsersSettings';

const SETTINGS_KEY = 'rasad_settings_v2';

const DEFAULT_SETTINGS: AppSettings = {
  language: 'ar',
  selectedFacilityId: 'fac-merowe-dam',
  alarmEnabled: true,
  alarmVolume: 1.0,
  alarmRepeats: 10,
  autoEscalateSeconds: 60,
  browserNotifications: false,
  inactivityMinutes: 15,
  offlineSimulation: false,
  mapShowCoverage: true,
  mapShowBlindZones: true,
};

function loadInitialSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const NAV_ICONS: Record<NavSection, React.FC<{ className?: string }>> = {
  overview: LayoutDashboard,
  command: Command,
  map: MapIcon,
  facilities: Building2,
  detection: Radar,
  alerts: BellRing,
  reports: FilePlus2,
  events: ScrollText,
  coverage: ShieldCheck,
  ai: Brain,
  response: Siren,
  sensors: Radio,
  analytics: BarChart3,
  users: Users,
  settings: Settings,
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(loadInitialSettings);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [lockedReason, setLockedReason] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [sensors, setSensors] = useState<SensorUnit[]>([]);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [reports, setReports] = useState<ManualReport[]>([]);
  const [responses, setResponses] = useState<ResponseTask[]>([]);
  const [assessments, setAssessments] = useState<AIAssessment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [usersList, setUsersList] = useState<SafeUser[]>([]);

  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [snapshotTimestamp, setSnapshotTimestamp] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [activeAlarmEvent, setActiveAlarmEvent] = useState<DetectionEvent | null>(null);
  const [sirenCycle, setSirenCycle] = useState(1);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [enrollingQuickBio, setEnrollingQuickBio] = useState(false);

  const lang = settings.language;
  const isOffline = !browserOnline || settings.offlineSimulation;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = window.setTimeout(() => setToastMsg(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Sync HTML dir and lang attributes
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Pre-warm Web Audio API on first user gesture for immediate high-loudness siren playback
  useEffect(() => {
    const unlock = () => unlockAlarmAudio();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Monitor browser online/offline
  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Verify existing session token on boot
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    apiFetch<{ user: SafeUser }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  const handleLogout = useCallback(
    async (reason?: string) => {
      stopAlarmAudio();
      setActiveAlarmEvent(null);
      try {
        if (getStoredToken() && !isOffline) {
          await apiFetch('/api/auth/logout', { method: 'POST' });
        }
      } catch {
        // Ignore network failure on logout
      }
      setStoredToken(null);
      setUser(null);
      setLockedReason(reason || null);
    },
    [isOffline]
  );

  // Inactivity Auto-Lock Policy
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!user) return;
    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };
    const eventsList = ['mousemove', 'keydown', 'click', 'touchstart'];
    eventsList.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= settings.inactivityMinutes * 60 * 1000) {
        handleLogout(
          t(
            lang,
            'تم قفل الجلسة تلقائياً لعدم الاستخدام وفق سياسة الأمان. يرجى إعادة تسجيل الدخول.',
            'Session automatically locked due to inactivity per security policy. Please sign in again.'
          )
        );
      }
    }, 10000);

    return () => {
      eventsList.forEach((evt) => window.removeEventListener(evt, resetTimer));
      window.clearInterval(interval);
    };
  }, [user, settings.inactivityMinutes, lang, handleLogout]);

  const loadAllData = useCallback(async () => {
    if (!user) return;
    if (isOffline) {
      const snap = loadOfflineSnapshot();
      if (snap) {
        setFacilities(snap.facilities);
        setSensors(snap.sensors);
        setEvents(snap.events);
        setReports(snap.reports);
        setResponses(snap.responses);
        setSnapshotTimestamp(snap.saved_at);
      }
      return;
    }

    setLoadingData(true);
    try {
      const [facRes, senRes, evtRes, repRes, rspRes, aiRes] = await Promise.all([
        apiFetch<{ facilities: Facility[] }>('/api/facilities'),
        apiFetch<{ sensors: SensorUnit[] }>('/api/sensors'),
        apiFetch<{ events: DetectionEvent[] }>('/api/events'),
        apiFetch<{ reports: ManualReport[] }>('/api/reports'),
        apiFetch<{ tasks: ResponseTask[] }>('/api/responses'),
        apiFetch<{ assessments: AIAssessment[] }>('/api/ai/assessments'),
      ]);

      setFacilities(facRes.facilities);
      setSensors(senRes.sensors);
      setEvents(evtRes.events);
      setReports(repRes.reports);
      setResponses(rspRes.tasks);
      setAssessments(aiRes.assessments);
      setSnapshotTimestamp(null);

      saveOfflineSnapshot({
        facilities: facRes.facilities,
        sensors: senRes.sensors,
        events: evtRes.events,
        reports: repRes.reports,
        responses: rspRes.tasks,
      });

      if (
        facRes.facilities.length > 0 &&
        !facRes.facilities.some((f) => f.id === settings.selectedFacilityId)
      ) {
        updateSettings({ selectedFacilityId: facRes.facilities[0].id });
      }

      if (user.role === 'ADMIN' || user.role === 'FACILITY_MANAGER' || user.role === 'MONITORING_OFFICER') {
        apiFetch<{ logs: AuditLogEntry[] }>('/api/audit-logs')
          .then((r) => setAuditLogs(r.logs))
          .catch(() => {});
      }

      if (user.role === 'ADMIN') {
        apiFetch<{ users: SafeUser[] }>('/api/users')
          .then((r) => setUsersList(r.users))
          .catch(() => {});
      }
    } catch {
      const snap = loadOfflineSnapshot();
      if (snap) {
        setFacilities(snap.facilities);
        setSensors(snap.sensors);
        setEvents(snap.events);
        setReports(snap.reports);
        setResponses(snap.responses);
        setSnapshotTimestamp(snap.saved_at);
      }
    } finally {
      setLoadingData(false);
    }
  }, [user, isOffline, settings.selectedFacilityId, updateSettings]);

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user, loadAllData]);

  const syncOfflineQueue = useCallback(async () => {
    if (isOffline || !user) return;
    const queued = getQueuedReports();
    if (queued.length === 0) return;

    try {
      const res = await apiFetch<{
        results: Array<{ client_uuid: string; status: 'SYNCED' | 'DEDUPLICATED' | 'FAILED'; error?: string }>;
      }>('/api/reports/sync', {
        method: 'POST',
        body: JSON.stringify({ items: queued }),
      });

      const logEntries = res.results.map((r) => {
        if (r.status !== 'FAILED') {
          removeQueuedReport(r.client_uuid);
        }
        return {
          id: `syn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          client_uuid: r.client_uuid,
          facility_id: queued.find((q) => q.client_uuid === r.client_uuid)?.facility_id || '',
          outcome: r.status,
          detail: r.error || r.status,
        };
      });
      appendSyncLog(logEntries);
      await loadAllData();
    } catch {
      // Retry when connection stabilizes
    }
  }, [isOffline, user, loadAllData]);

  // Auto-sync when returning online
  useEffect(() => {
    if (!isOffline && user) {
      syncOfflineQueue();
    }
  }, [isOffline, user, syncOfflineQueue]);

  const triggerAlarmForEvent = useCallback(
    (ev: DetectionEvent) => {
      setActiveAlarmEvent(ev);
      if (settings.alarmEnabled) {
        startEmergencyAlarmLoop({
          severity: ev.severity,
          volume: settings.alarmVolume,
          maxRepeats: ev.severity === 'EMERGENCY' ? settings.alarmRepeats : 3,
          onCycle: (c) => setSirenCycle(c),
        });
      }
      if (settings.browserNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(t(lang, 'إنذار منصة رَصَد', 'RASAD Security Alarm'), {
            body: lang === 'ar' ? ev.event_type_ar : ev.event_type_en,
          });
        } catch {
          // Ignore notification failure
        }
      }
    },
    [settings.alarmEnabled, settings.alarmVolume, settings.alarmRepeats, settings.browserNotifications, lang]
  );

  // Real WebSocket Connection for live telemetry & instant alarms
  useEffect(() => {
    if (!user || isOffline) return;
    const token = getStoredToken();
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as { event: string; payload: unknown };
        if (parsed.event === 'event:created') {
          const ev = parsed.payload as DetectionEvent;
          setEvents((prev) => (prev.some((p) => p.id === ev.id) ? prev : [ev, ...prev]));
          if (ev.severity === 'HIGH' || ev.severity === 'EMERGENCY') {
            triggerAlarmForEvent(ev);
          }
          loadAllData();
        } else if (
          parsed.event === 'event:updated' ||
          parsed.event === 'sensor:updated' ||
          parsed.event === 'facility:updated' ||
          parsed.event === 'response:updated' ||
          parsed.event === 'report:created'
        ) {
          loadAllData();
        }
      } catch {
        // Ignore malformed socket frames
      }
    };

    return () => {
      ws.close();
    };
  }, [user, isOffline, triggerAlarmForEvent, loadAllData]);

  const handleAcknowledgeEvent = async (eventId: string) => {
    await apiFetch(`/api/events/${eventId}/acknowledge`, { method: 'POST' });
    stopAlarmAudio();
    setActiveAlarmEvent(null);
    await loadAllData();
  };

  const handleEscalateEvent = async (eventId: string, reason: string) => {
    await apiFetch(`/api/events/${eventId}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    stopAlarmAudio();
    setActiveAlarmEvent(null);
    await loadAllData();
  };

  const selectedFacility = useMemo(() => {
    return (
      facilities.find((f) => f.id === settings.selectedFacilityId) ||
      facilities[0] || {
        id: 'none',
        code: 'N/A',
        name_ar: 'لا توجد مؤسسة مصرح بها',
        name_en: 'No Authorized Facility',
        type: 'SUBSTATION',
        lat: 18.6708,
        lng: 32.0511,
        region_ar: 'الولاية الشمالية — مروي',
        region_en: 'Northern State — Merowe',
        coverage_radius_m: 1200,
        monitoring_status: 'OFFLINE',
        risk_level: 'NORMAL',
        notes_ar: '',
        notes_en: '',
        created_at: new Date().toISOString(),
      }
    );
  }, [facilities, settings.selectedFacilityId]);

  const handleQuickEnrollBiometric = async () => {
    if (!user || enrollingQuickBio) return;
    setEnrollingQuickBio(true);
    try {
      const res = await enrollBiometricForUser({ username: user.username, lang });
      setUser(res.user);
      showToast(res.message);
    } catch (err) {
      if (err instanceof PinRequiredError) {
        setActiveNav('settings');
        showToast(
          t(
            lang,
            'تم فتح إعدادات المستخدم لإكمال حفظ البصمة والرمز الأمني بشكل موثوق.',
            'Opened User Settings to complete verified biometric & Security PIN enrollment.'
          )
        );
      } else {
        showToast((err as Error).message);
      }
    } finally {
      setEnrollingQuickBio(false);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center font-display text-lg font-bold text-slate-700">
        {t(lang, 'جاري التحقق من الجلسة...', 'Verifying session...')}
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        lang={lang}
        onToggleLang={() => updateSettings({ language: lang === 'ar' ? 'en' : 'ar' })}
        onAuthenticated={(u, notice) => {
          setLockedReason(null);
          setUser(u);
          setActiveNav('overview');
          if (notice) showToast(notice);
        }}
        lockedReason={lockedReason}
      />
    );
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'ADMIN');
  const openAlertCount = events.filter(
    (e) => e.status !== 'CLOSED' && (e.severity === 'HIGH' || e.severity === 'EMERGENCY' || e.severity === 'WARNING')
  ).length;
  const canOperate = user.role !== 'VIEWER';
  const pendingOfflineCount = getQueuedReports().length;

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-white text-slate-900 flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-e border-slate-200 bg-[#F6F7F9] transition-all duration-200 shrink-0 ${
          sidebarOpen ? 'w-72' : 'w-20'
        }`}
      >
        <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-white">
          <RasadLogo lang={lang} size="sm" showWordmark={sidebarOpen} />
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
            aria-label={t(lang, 'فتح أو إغلاق القائمة الجانبية', 'Toggle Sidebar')}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                title={lang === 'ar' ? item.ar : item.en}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  active
                    ? 'bg-[#E05252] text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && (
                  <span className="truncate flex-1 text-start">
                    {lang === 'ar' ? item.ar : item.en}
                  </span>
                )}
                {sidebarOpen && item.id === 'alerts' && openAlertCount > 0 && (
                  <span
                    className={`font-mono text-xs px-2 py-0.5 rounded-md tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {openAlertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {sidebarOpen ? (
          <div className="p-4 border-t border-slate-200 bg-white space-y-2">
            <div className="text-xs font-extrabold text-slate-900 truncate">
              {lang === 'ar' ? user.full_name_ar : user.full_name_en}
            </div>
            <div className="text-xs font-semibold text-slate-500 truncate">
              {lang === 'ar' ? ROLE_LABELS[user.role].ar : ROLE_LABELS[user.role].en}
            </div>
            <button
              type="button"
              onClick={() => handleLogout()}
              className="w-full mt-2 py-2 px-3 rounded-xl border border-slate-300 bg-[#F6F7F9] hover:bg-slate-200 text-xs font-bold text-slate-800 inline-flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>{t(lang, 'تسجيل الخروج', 'Sign Out')}</span>
            </button>
          </div>
        ) : (
          <div className="p-3 border-t border-slate-200 bg-white flex justify-center">
            <button
              type="button"
              onClick={() => handleLogout()}
              title={t(lang, 'تسجيل الخروج', 'Sign Out')}
              className="p-2.5 rounded-xl border border-slate-300 bg-[#F6F7F9] hover:bg-slate-200 text-slate-800"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col z-50 border-e border-slate-200">
            <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between">
              <RasadLogo lang={lang} size="sm" />
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = NAV_ICONS[item.id];
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold ${
                      active ? 'bg-[#E05252] text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{lang === 'ar' ? item.ar : item.en}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => handleLogout()}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-300 bg-[#F6F7F9] text-xs font-bold text-slate-900 inline-flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>{t(lang, 'تسجيل الخروج', 'Sign Out')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-200 bg-white flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700"
              aria-label={t(lang, 'فتح القائمة', 'Open Menu')}
            >
              <Menu className="w-5 h-5" />
            </button>

            <select
              value={selectedFacility.id}
              onChange={(e) => updateSettings({ selectedFacilityId: e.target.value })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-[#F6F7F9] text-xs sm:text-sm font-bold text-slate-900 max-w-[260px] sm:max-w-sm truncate"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} — {lang === 'ar' ? f.name_ar : f.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user.biometric_enabled ? (
              <button
                type="button"
                onClick={() => setActiveNav('settings')}
                title={t(lang, 'البصمة مسجلة ومفعّلة لهذا الحساب', 'Biometric enrolled for this account')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-800 whitespace-nowrap"
              >
                <Fingerprint className="w-4 h-4 text-emerald-700" />
                <span>{t(lang, 'البصمة مفعّلة', 'Biometric Active')}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={enrollingQuickBio}
                onClick={handleQuickEnrollBiometric}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-[#F6F7F9] hover:bg-slate-200 text-xs font-bold text-slate-900 whitespace-nowrap"
              >
                <Fingerprint className="w-4 h-4 text-[#E05252]" />
                <span>
                  {enrollingQuickBio
                    ? t(lang, 'جاري التسجيل...', 'Saving...')
                    : t(lang, 'تفعيل وحفظ البصمة', 'Save Fingerprint')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => updateSettings({ language: lang === 'ar' ? 'en' : 'ar' })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-[#F6F7F9] hover:bg-slate-200 text-xs font-bold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Globe className="w-4 h-4" />
              <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
            </button>

            {canOperate && (
              <button
                type="button"
                onClick={() => setActiveNav('reports')}
                className="px-4 py-2 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-xs sm:text-sm font-bold whitespace-nowrap"
              >
                {t(lang, 'رصدت مسيرة', 'Drone Sighted')}
              </button>
            )}
          </div>
        </header>

        {toastMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-emerald-950">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{toastMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMsg(null)}
              className="p-1 text-emerald-700 hover:text-emerald-950"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Honest Offline / Stale Cache Banner */}
        {isOffline && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-bold text-amber-950">
            <div className="flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                {t(
                  lang,
                  `وضع العمل دون إنترنت — البيانات المعروضة محفوظة محلياً (آخر تحديث: ${formatDateTime(snapshotTimestamp, lang)}) وليست بيانات مراقبة حية.`,
                  `Offline Mode — Displaying locally cached data (last saved: ${formatDateTime(snapshotTimestamp, lang)}), NOT live telemetry.`
                )}
              </span>
            </div>
            {pendingOfflineCount > 0 && (
              <span className="font-mono text-xs bg-white px-2.5 py-1 rounded-lg border border-amber-300">
                {t(lang, `بانتظار المزامنة: ${pendingOfflineCount}`, `Pending Sync: ${pendingOfflineCount}`)}
              </span>
            )}
          </div>
        )}

        {!isOffline && pendingOfflineCount > 0 && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between gap-3 text-xs font-bold text-emerald-950">
            <span>
              {t(
                lang,
                `عاد الاتصال بالإنترنت. يوجد ${pendingOfflineCount} بلاغ محلي جاهز للمزامنة.`,
                `Connection restored. ${pendingOfflineCount} local report(s) ready to sync.`
              )}
            </span>
            <button
              type="button"
              onClick={syncOfflineQueue}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-700 text-white font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t(lang, 'مزامنة الآن', 'Sync Now')}</span>
            </button>
          </div>
        )}

        {/* Active View Viewport */}
        <main className="flex-1 p-5 sm:p-7 max-w-[1440px] w-full mx-auto">
          {loadingData && facilities.length === 0 ? (
            <div className="py-16 text-center font-bold text-slate-500">
              {t(lang, 'جاري تحميل بيانات المنظومة...', 'Loading platform telemetry...')}
            </div>
          ) : (
            <>
              {activeNav === 'overview' && (
                <OverviewView
                  lang={lang}
                  facility={selectedFacility}
                  allFacilities={facilities}
                  sensors={sensors}
                  events={events}
                  reports={reports}
                  onNavigate={setActiveNav}
                  onSelectFacility={(id) => updateSettings({ selectedFacilityId: id })}
                  onAcknowledgeEvent={handleAcknowledgeEvent}
                  canOperate={canOperate}
                />
              )}

              {activeNav === 'command' && (
                <CommandCenterView
                  lang={lang}
                  user={user}
                  facilities={facilities}
                  sensors={sensors}
                  events={events}
                  onSelectFacility={(facId) => {
                    updateSettings({ selectedFacilityId: facId });
                    setActiveNav('overview');
                  }}
                />
              )}

              {activeNav === 'map' && (
                <MonitoringMapView
                  lang={lang}
                  facility={selectedFacility}
                  allFacilities={facilities}
                  sensors={sensors}
                  events={events}
                  reports={reports}
                  onSelectFacility={(id) => updateSettings({ selectedFacilityId: id })}
                />
              )}

              {activeNav === 'facilities' && (
                <FacilitiesView
                  lang={lang}
                  user={user}
                  facilities={facilities}
                  sensors={sensors}
                  events={events}
                  reports={reports}
                  selectedFacilityId={selectedFacility.id}
                  onSelectFacility={(id) => updateSettings({ selectedFacilityId: id })}
                  onRefresh={loadAllData}
                />
              )}

              {activeNav === 'detection' && (
                <DroneDetectionView
                  lang={lang}
                  user={user}
                  facility={selectedFacility}
                  sensors={sensors}
                  events={events}
                  onRefresh={loadAllData}
                />
              )}

              {activeNav === 'alerts' && (
                <AlertsView
                  lang={lang}
                  user={user}
                  facilities={facilities}
                  events={events}
                  onAcknowledge={handleAcknowledgeEvent}
                  onEscalate={handleEscalateEvent}
                  onTriggerAlarmModal={triggerAlarmForEvent}
                />
              )}

              {activeNav === 'reports' && (
                <ReportsView
                  lang={lang}
                  user={user}
                  facilities={facilities}
                  reports={reports}
                  selectedFacilityId={selectedFacility.id}
                  isOffline={isOffline}
                  onRefresh={loadAllData}
                  onSyncOffline={syncOfflineQueue}
                />
              )}

              {activeNav === 'events' && (
                <EventLogView
                  lang={lang}
                  user={user}
                  facilities={facilities}
                  events={events}
                  auditLogs={auditLogs}
                />
              )}

              {activeNav === 'coverage' && (
                <CoverageMapView
                  lang={lang}
                  facility={selectedFacility}
                  allFacilities={facilities}
                  sensors={sensors}
                  events={events}
                  reports={reports}
                  onSelectFacility={(id) => updateSettings({ selectedFacilityId: id })}
                />
              )}

              {activeNav === 'ai' && (
                <AIIntelligenceView
                  lang={lang}
                  facility={selectedFacility}
                  events={events}
                  assessments={assessments}
                  onRefresh={loadAllData}
                />
              )}

              {activeNav === 'response' && (
                <EmergencyResponseView
                  lang={lang}
                  user={user}
                  facilities={facilities}
                  events={events}
                  tasks={responses}
                  onRefresh={loadAllData}
                />
              )}

              {activeNav === 'sensors' && (
                <SensorsView
                  lang={lang}
                  user={user}
                  facilities={facilities}
                  sensors={sensors}
                  onRefresh={loadAllData}
                />
              )}

              {activeNav === 'analytics' && (
                <AnalyticsView
                  lang={lang}
                  facilities={facilities}
                  events={events}
                  sensors={sensors}
                />
              )}

              {activeNav === 'users' && user.role === 'ADMIN' && (
                <UsersView
                  lang={lang}
                  facilities={facilities}
                  users={usersList}
                  onRefresh={loadAllData}
                />
              )}

              {activeNav === 'settings' && (
                <SettingsView
                  lang={lang}
                  user={user}
                  facilities={facilities}
                  settings={settings}
                  onUpdateSettings={updateSettings}
                  onUserUpdated={setUser}
                  onSyncOffline={syncOfflineQueue}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Prominent Emergency Alarm Modal */}
      {activeAlarmEvent && (
        <EmergencyAlarmModal
          lang={lang}
          event={activeAlarmEvent}
          facility={facilities.find((f) => f.id === activeAlarmEvent.facility_id)}
          sirenCycle={sirenCycle}
          maxRepeats={activeAlarmEvent.severity === 'EMERGENCY' ? settings.alarmRepeats : 3}
          autoEscalateSeconds={settings.autoEscalateSeconds}
          canAcknowledge={canOperate}
          onAcknowledge={handleAcknowledgeEvent}
          onEscalate={handleEscalateEvent}
          onDismissLocal={() => setActiveAlarmEvent(null)}
        />
      )}
    </div>
  );
}
