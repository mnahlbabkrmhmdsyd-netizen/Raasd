import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Printer,
  Download,
  UserPlus,
  Fingerprint,
  Volume2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Shield,
  WifiOff,
  Globe,
  KeyRound,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import type {
  AnalyticsSummary,
  AppSettings,
  DetectionEvent,
  Facility,
  Language,
  SafeUser,
  SensorUnit,
  UserRole,
} from '../types';
import { ROLE_LABELS, SEVERITY_META, formatDateTime, t } from '../i18n';
import { apiFetch } from '../utils/api';
import { testAlarmSound, unlockAlarmAudio } from '../utils/alarmAudio';
import {
  PinRequiredError,
  checkBiometricCapability,
  clearLocalPasskey,
  enrollBiometricForUser,
  verifySavedBiometricSelf,
} from '../utils/biometric';
import {
  clearOfflineCache,
  getQueuedReports,
  getSyncLog,
} from '../utils/offlineStore';

export const AnalyticsView: React.FC<{
  lang: Language;
  facilities: Facility[];
  events: DetectionEvent[];
  sensors: SensorUnit[];
}> = ({ lang, facilities, events, sensors }) => {
  const [range, setRange] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    apiFetch<AnalyticsSummary>(`/api/analytics?range=${range}`)
      .then(setSummary)
      .catch(() => {});
  }, [range, events.length]);

  const byFacility = facilities.map((f) => ({
    facility: f,
    count: events.filter((e) => e.facility_id === f.id).length,
  }));
  const maxFacCount = Math.max(1, ...byFacility.map((b) => b.count));

  const sevKeys = ['NORMAL', 'WARNING', 'HIGH', 'EMERGENCY'] as const;
  const maxSevCount = Math.max(
    1,
    ...sevKeys.map((k) => summary?.by_severity[k] ?? 0)
  );

  const exportCsv = () => {
    const header = ['ID', 'CreatedAt', 'Facility', 'Source', 'Indicator', 'Score', 'Confidence', 'Severity', 'Status'];
    const rows = events.map((e) => [
      e.id,
      e.created_at,
      e.facility_id,
      e.source_type,
      e.indicator_type,
      e.probabilistic_score,
      e.confidence_pct,
      e.severity,
      e.status,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rasad-report-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t(lang, 'التقارير والإحصائيات التنفيذية', 'Executive Reports & Analytics')}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {t(
              lang,
              'مؤشرات الأداء اليومية والأسبوعية والشهرية لأحداث المسيرات وزمن الاستجابة وأداء وحدات الاستشعار.',
              'Daily, weekly, and monthly metrics covering event severity, facility breakdown, sensor uptime, and response times.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="flex items-center gap-1 p-1 bg-[#F6F7F9] border border-slate-200 rounded-xl">
            {(['daily', 'weekly', 'monthly'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  range === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {r === 'daily' ? t(lang, 'يومي', 'Daily') : r === 'weekly' ? t(lang, 'أسبوعي', 'Weekly') : t(lang, 'شهري', 'Monthly')}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-900"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-xs font-bold"
          >
            <Printer className="w-4 h-4" />
            <span>{t(lang, 'تصدير PDF', 'Export PDF')}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'إجمالي الأحداث', 'Total Events')}</div>
          <div className="font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
            {summary?.total_events ?? events.length}
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'عدد الإنذارات الصادرة', 'Alarms Issued')}</div>
          <div className="font-mono text-3xl font-extrabold text-[#E05252] tabular-nums">
            {summary?.alarms_issued ?? 0}
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'أحداث مغلقة / قيد المعالجة', 'Closed / In Progress')}</div>
          <div className="font-mono text-2xl font-extrabold text-slate-900 tabular-nums">
            {summary?.closed_events ?? 0} / {summary?.in_progress_events ?? 0}
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'متوسط زمن الاستلام / الاستجابة', 'Avg Ack / Response')}</div>
          <div className="font-mono text-lg font-extrabold text-slate-900 tabular-nums">
            {summary?.avg_ack_seconds !== null && summary?.avg_ack_seconds !== undefined
              ? `${summary.avg_ack_seconds}s`
              : '—'}{' '}
            /{' '}
            {summary?.avg_response_minutes !== null && summary?.avg_response_minutes !== undefined
              ? `${summary.avg_response_minutes}m`
              : '—'}
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'أداء وحدات الاستشعار', 'Sensor Availability')}</div>
          <div className="font-mono text-2xl font-extrabold text-slate-900 tabular-nums">
            {sensors.filter((s) => s.connection_status === 'CONNECTED').length}/{sensors.length}
          </div>
        </div>
      </div>

      {/* Crisp Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-slate-200 rounded-2xl bg-white p-6">
          <h3 className="font-display text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#E05252]" />
            <span>{t(lang, 'الأحداث حسب مستوى الخطورة', 'Events by Severity Level')}</span>
          </h3>
          <div className="space-y-4">
            {sevKeys.map((k) => {
              const meta = SEVERITY_META[k];
              const count = summary?.by_severity[k] ?? 0;
              const pct = Math.round((count / maxSevCount) * 100);
              return (
                <div key={k} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className={meta.text}>{lang === 'ar' ? meta.ar : meta.en}</span>
                    <span className="font-mono text-slate-900 tabular-nums">{count}</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: meta.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border border-slate-200 rounded-2xl bg-white p-6">
          <h3 className="font-display text-lg font-extrabold text-slate-900 mb-4">
            {t(lang, 'الأحداث حسب المؤسسة الكهربائية', 'Events by Electrical Facility')}
          </h3>
          <div className="space-y-4">
            {byFacility.map(({ facility, count }) => {
              const pct = Math.round((count / maxFacCount) * 100);
              return (
                <div key={facility.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-800 truncate">{lang === 'ar' ? facility.name_ar : facility.name_en}</span>
                    <span className="font-mono text-slate-900 tabular-nums">{count}</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#E05252] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const UsersView: React.FC<{
  lang: Language;
  facilities: Facility[];
  users: SafeUser[];
  onRefresh: () => Promise<void>;
}> = ({ lang, facilities, users, onRefresh }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullNameAr, setFullNameAr] = useState('');
  const [role, setRole] = useState<UserRole>('MONITORING_OFFICER');
  const [selectedFacs, setSelectedFacs] = useState<string[]>([facilities[0]?.id || '']);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setCreating(true);
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          full_name_ar: fullNameAr,
          full_name_en: fullNameAr,
          role,
          authorized_facilities: role === 'ADMIN' ? ['*'] : selectedFacs,
        }),
      });
      setUsername('');
      setPassword('');
      setFullNameAr('');
      await onRefresh();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (u: SafeUser) => {
    await apiFetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !u.active }),
    });
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
          {t(lang, 'إدارة المستخدمين والصلاحيات (RBAC)', 'Users & Access Control')}
        </h1>
        <p className="text-sm font-medium text-slate-600 mt-1">
          {t(
            lang,
            'إنشاء الحسابات وتحديد الأدوار والمؤسسات المصرح بها يتم حصراً عبر المسؤول الرئيسي.',
            'Account creation, role assignment, and facility scoping are restricted strictly to the System Administrator.'
          )}
        </p>
      </div>

      {/* Create Authorized Account */}
      <div className="border border-slate-200 rounded-2xl bg-white p-6">
        <h2 className="font-display text-lg font-extrabold text-slate-900 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-[#E05252]" />
          <span>{t(lang, 'إنشاء حساب مستخدم معتمد جديد', 'Provision Authorized Account')}</span>
        </h2>

        {err && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-800">{err}</div>}

        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            required
            placeholder={t(lang, 'اسم المستخدم', 'Username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
          />
          <input
            required
            type="password"
            placeholder={t(lang, 'كلمة المرور الأولية', 'Initial Password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
          />
          <input
            required
            placeholder={t(lang, 'الاسم الكامل والصفة', 'Full Name')}
            value={fullNameAr}
            onChange={(e) => setFullNameAr(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
          >
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {lang === 'ar' ? ROLE_LABELS[r].ar : ROLE_LABELS[r].en}
              </option>
            ))}
          </select>

          {role !== 'ADMIN' && (
            <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-slate-600">{t(lang, 'المؤسسات المصرح بها:', 'Authorized Facilities:')}</span>
              {facilities.map((f) => {
                const checked = selectedFacs.includes(f.id);
                return (
                  <label key={f.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F6F7F9] border border-slate-200 text-xs font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedFacs(
                          checked ? selectedFacs.filter((id) => id !== f.id) : [...selectedFacs, f.id]
                        )
                      }
                      className="accent-[#E05252]"
                    />
                    <span>{f.code}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="lg:col-start-4 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="w-full py-2.5 px-5 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-sm font-bold"
            >
              {creating ? t(lang, 'جاري الإنشاء...', 'Creating...') : t(lang, 'إنشاء الحساب', 'Create Account')}
            </button>
          </div>
        </form>
      </div>

      {/* Users Table */}
      <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-600 bg-slate-50">
                <th className="py-3 px-4 text-start">{t(lang, 'المستخدم', 'User')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'الدور', 'Role')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'المؤسسات', 'Facilities')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'البصمة', 'Biometric')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'الحالة', 'Status')}</th>
                <th className="py-3 px-4 text-end">{t(lang, 'إجراء', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-extrabold text-slate-900">{lang === 'ar' ? u.full_name_ar : u.full_name_en}</div>
                    <div className="font-mono text-slate-500">{u.username}</div>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800">
                    {lang === 'ar' ? ROLE_LABELS[u.role].ar : ROLE_LABELS[u.role].en}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">{u.authorized_facilities.join(', ')}</td>
                  <td className="py-3 px-4">
                    {u.biometric_enabled ? (
                      <span className="text-emerald-700 font-bold">{t(lang, 'مفعّلة', 'Enrolled')}</span>
                    ) : (
                      <span className="text-slate-400 font-bold">{t(lang, 'غير مسجلة', 'Not enrolled')}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`font-bold ${u.active ? 'text-emerald-700' : 'text-red-700'}`}>
                      {u.active ? t(lang, 'نشط', 'Active') : t(lang, 'معطّل', 'Disabled')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-end">
                    {u.username !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-[#F6F7F9] font-bold text-slate-800"
                      >
                        {u.active ? t(lang, 'تعطيل', 'Disable') : t(lang, 'تفعيل', 'Enable')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const SettingsView: React.FC<{
  lang: Language;
  user: SafeUser;
  facilities: Facility[];
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUserUpdated: (u: SafeUser) => void;
  onSyncOffline: () => Promise<void>;
}> = ({ lang, user, facilities, settings, onUpdateSettings, onUserUpdated, onSyncOffline }) => {
  const [bioMsg, setBioMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [enrollingBio, setEnrollingBio] = useState(false);
  const [verifyingBio, setVerifyingBio] = useState(false);
  const [pinMode, setPinMode] = useState<'ENROLL' | 'VERIFY' | null>(null);
  const [securityPin, setSecurityPin] = useState('');
  const [bioCapability, setBioCapability] = useState<{
    webauthnSupported: boolean;
    platformAvailable: boolean;
    inIframe: boolean;
  } | null>(null);
  const [syncLog, setSyncLog] = useState(() => getSyncLog());
  const queued = getQueuedReports();

  useEffect(() => {
    checkBiometricCapability().then(setBioCapability).catch(() => {});
  }, []);

  const handleEnrollBiometric = async (withPin?: string) => {
    setBioMsg(null);
    setEnrollingBio(true);
    try {
      const result = await enrollBiometricForUser({
        username: user.username,
        lang,
        securityPin: withPin,
      });
      onUserUpdated(result.user);
      setPinMode(null);
      setSecurityPin('');
      setBioMsg({ kind: 'ok', text: result.message });
    } catch (err) {
      if (err instanceof PinRequiredError && err.reason === 'ENROLL') {
        setPinMode('ENROLL');
        setBioMsg({ kind: 'info', text: err.message });
      } else {
        setBioMsg({
          kind: 'err',
          text: t(
            lang,
            `تعذر إتمام تسجيل البصمة (${(err as Error).message}).`,
            `Biometric enrollment failed (${(err as Error).message}).`
          ),
        });
      }
    } finally {
      setEnrollingBio(false);
    }
  };

  const handleVerifySavedBiometric = async (withPin?: string) => {
    setBioMsg(null);
    setVerifyingBio(true);
    try {
      const res = await verifySavedBiometricSelf({
        username: user.username,
        lang,
        securityPin: withPin,
      });
      setPinMode(null);
      setSecurityPin('');
      setBioMsg({
        kind: 'ok',
        text: t(
          lang,
          `تم التحقق الموثوق من البصمة المحفوظة بنجاح (${res.biometric_type === 'WEBAUTHN' ? 'WebAuthn FIDO2' : 'ECDSA + PIN'}) — ${formatDateTime(res.verified_at, lang)}`,
          `Saved biometric cryptographically verified (${res.biometric_type}) at ${formatDateTime(res.verified_at, lang)}`
        ),
      });
    } catch (err) {
      if (err instanceof PinRequiredError && err.reason === 'VERIFY') {
        setPinMode('VERIFY');
        setBioMsg({ kind: 'info', text: err.message });
      } else {
        setBioMsg({ kind: 'err', text: (err as Error).message });
      }
    } finally {
      setVerifyingBio(false);
    }
  };

  const handleRemoveBiometric = async () => {
    setBioMsg(null);
    setEnrollingBio(true);
    try {
      const res = await apiFetch<{ user: SafeUser }>('/api/auth/webauthn', {
        method: 'DELETE',
      });
      clearLocalPasskey(user.username);
      onUserUpdated(res.user);
      setPinMode(null);
      setSecurityPin('');
      setBioMsg({
        kind: 'ok',
        text: t(lang, 'تم حذف البصمة المسجلة من إعدادات هذا الحساب.', 'Enrolled biometric credential removed from this account.'),
      });
    } catch (err) {
      setBioMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setEnrollingBio(false);
    }
  };

  const handleEnableBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    onUpdateSettings({ browserNotifications: perm === 'granted' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
          {t(lang, 'إعدادات النظام والأمان والإنذار', 'System, Security & Alarm Settings')}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General & Facility */}
        <div className="border border-slate-200 rounded-2xl bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#E05252]" />
            <span>{t(lang, 'اللغة والمؤسسة الافتراضية', 'Language & Active Facility')}</span>
          </h2>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'لغة الواجهة واتجاه العرض', 'Interface Language & Direction')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ language: 'ar' })}
                className={`py-2.5 rounded-xl border text-sm font-bold ${
                  lang === 'ar' ? 'bg-[#E05252] text-white border-[#E05252]' : 'bg-[#F6F7F9] border-slate-200 text-slate-800'
                }`}
              >
                العربية (RTL)
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ language: 'en' })}
                className={`py-2.5 rounded-xl border text-sm font-bold ${
                  lang === 'en' ? 'bg-[#E05252] text-white border-[#E05252]' : 'bg-[#F6F7F9] border-slate-200 text-slate-800'
                }`}
              >
                English (LTR)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'المؤسسة المختارة', 'Selected Facility')}</label>
            <select
              value={settings.selectedFacilityId}
              onChange={(e) => onUpdateSettings({ selectedFacilityId: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {lang === 'ar' ? f.name_ar : f.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-slate-700">{t(lang, 'إظهار نطاقات التغطية على الخريطة', 'Show coverage circles on map')}</span>
            <input
              type="checkbox"
              checked={settings.mapShowCoverage}
              onChange={(e) => onUpdateSettings({ mapShowCoverage: e.target.checked })}
              className="accent-[#E05252] w-4 h-4"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">{t(lang, 'إظهار المناطق غير المغطاة', 'Show uncovered blind zones')}</span>
            <input
              type="checkbox"
              checked={settings.mapShowBlindZones}
              onChange={(e) => onUpdateSettings({ mapShowBlindZones: e.target.checked })}
              className="accent-[#E05252] w-4 h-4"
            />
          </div>
        </div>

        {/* Alarm & Notification Settings */}
        <div className="border border-slate-200 rounded-2xl bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-[#E05252]" />
            <span>{t(lang, 'إعدادات الإنذار الصوتي واختبار الصوت', 'Emergency Alarm & Audio Test')}</span>
          </h2>

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">{t(lang, 'تفعيل الإنذار الصوتي عند الطوارئ', 'Enable Emergency Audio Siren')}</span>
            <input
              type="checkbox"
              checked={settings.alarmEnabled}
              onChange={(e) => onUpdateSettings({ alarmEnabled: e.target.checked })}
              className="accent-[#E05252] w-4 h-4"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
              <span>{t(lang, 'شدة الصوت', 'Alarm Volume')}</span>
              <span className="font-mono">{Math.round(settings.alarmVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={settings.alarmVolume}
              onChange={(e) => onUpdateSettings({ alarmVolume: Number(e.target.value) })}
              className="w-full accent-[#E05252]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'عدد مرات التكرار (حتى 10)', 'Max Repeats (up to 10)')}</label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.alarmRepeats}
                onChange={(e) => onUpdateSettings({ alarmRepeats: Math.min(10, Math.max(1, Number(e.target.value))) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'مهلة التصعيد (ثانية)', 'Auto-Escalate (sec)')}</label>
              <input
                type="number"
                min={15}
                max={300}
                value={settings.autoEscalateSeconds}
                onChange={(e) => onUpdateSettings({ autoEscalateSeconds: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                unlockAlarmAudio();
                testAlarmSound('EMERGENCY', settings.alarmVolume);
              }}
              className="px-4 py-2 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-xs font-bold"
            >
              {t(lang, 'اختبار نغمة الطوارئ العالية', 'Test Loud Emergency Siren')}
            </button>
            <button
              type="button"
              onClick={() => {
                unlockAlarmAudio();
                testAlarmSound('WARNING', settings.alarmVolume);
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-[#F6F7F9] text-slate-800 text-xs font-bold"
            >
              {t(lang, 'اختبار نغمة التحذير', 'Test Warning Tone')}
            </button>
            <button
              type="button"
              onClick={handleEnableBrowserNotifications}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold"
            >
              {settings.browserNotifications
                ? t(lang, 'الإشعارات مفعّلة', 'Notifications Enabled')
                : t(lang, 'تفعيل إشعارات المتصفح', 'Enable Browser Notifications')}
            </button>
          </div>
        </div>

        {/* Account, Biometrics & Session Lock */}
        <div className="border border-slate-200 rounded-2xl bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#E05252]" />
            <span>{t(lang, 'إدارة الحساب والبصمة وقفل الجلسة', 'Account, Biometrics & Session Lock')}</span>
          </h2>

          <div className="p-3.5 rounded-xl bg-[#F6F7F9] border border-slate-200 text-xs space-y-1">
            <div className="font-extrabold text-slate-900">{lang === 'ar' ? user.full_name_ar : user.full_name_en}</div>
            <div className="font-mono text-slate-600">
              {user.username} · {lang === 'ar' ? ROLE_LABELS[user.role].ar : ROLE_LABELS[user.role].en}
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
              user.biometric_enabled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="font-extrabold flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <Fingerprint className={`w-4 h-4 ${user.biometric_enabled ? 'text-emerald-700' : 'text-slate-500'}`} />
                <span>
                  {user.biometric_enabled
                    ? t(lang, 'البصمة مسجلة ومحفوظة في إعدادات المستخدم', 'Biometric Saved in User Settings')
                    : t(lang, 'لم يتم تسجيل بصمة إصبع لهذا الحساب بعد', 'No Biometric Credential Enrolled Yet')}
                </span>
              </span>
              {user.biometric_enabled && (
                <span className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 font-mono text-[11px] text-emerald-800">
                  {user.biometric_type === 'WEBAUTHN' ? 'FIDO2 WebAuthn' : 'ECDSA P-256 + PIN'}
                </span>
              )}
            </div>
            {user.biometric_enabled && (
              <div className="text-xs font-semibold text-emerald-800">
                {user.biometric_device_label || 'Trusted Device'}{' '}
                {user.biometric_enrolled_at ? `· ${formatDateTime(user.biometric_enrolled_at, lang)}` : ''}
              </div>
            )}
            {bioCapability?.inIframe && typeof window !== 'undefined' && (
              <div className="pt-1 text-[11px] font-semibold text-slate-600 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t(
                    lang,
                    'لتفعيل مستشعر البصمة الفيزيائي للهاتف أو الحاسوب مباشرة، افتح التطبيق في نافذة مستقلة:',
                    'To use your phone/laptop physical fingerprint sensor directly, open in a standalone tab:'
                  )}
                </span>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-[#E05252] hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>{t(lang, 'فتح نافذة مستقلة', 'Open Standalone')}</span>
                </a>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t(lang, 'مهلة قفل الجلسة عند عدم الاستخدام (دقائق)', 'Session Inactivity Auto-Lock (minutes)')}
            </label>
            <select
              value={settings.inactivityMinutes}
              onChange={(e) => onUpdateSettings({ inactivityMinutes: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
            >
              <option value={5}>5 {t(lang, 'دقائق', 'minutes')}</option>
              <option value={15}>15 {t(lang, 'دقيقة', 'minutes')}</option>
              <option value={30}>30 {t(lang, 'دقيقة', 'minutes')}</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enrollingBio || verifyingBio}
              onClick={() => handleEnrollBiometric()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E05252] hover:bg-[#D14242] disabled:opacity-60 text-xs font-bold text-white"
            >
              <Fingerprint className="w-4 h-4" />
              <span>
                {enrollingBio
                  ? t(lang, 'جاري التسجيل والحفظ...', 'Enrolling...')
                  : user.biometric_enabled
                  ? t(lang, 'تحديث وحفظ البصمة على هذا الجهاز', 'Update & Save Fingerprint')
                  : t(lang, 'تسجيل وحفظ بصمة الإصبع الآن', 'Enroll & Save Fingerprint Now')}
              </span>
            </button>

            {user.biometric_enabled && (
              <button
                type="button"
                disabled={enrollingBio || verifyingBio}
                onClick={() => handleVerifySavedBiometric()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-900"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>
                  {verifyingBio
                    ? t(lang, 'جاري التحقق...', 'Verifying...')
                    : t(lang, 'تحقق من البصمة المحفوظة', 'Verify Saved Biometric')}
                </span>
              </button>
            )}

            {user.biometric_enabled && (
              <button
                type="button"
                disabled={enrollingBio || verifyingBio}
                onClick={handleRemoveBiometric}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>{t(lang, 'إلغاء البصمة', 'Remove Fingerprint')}</span>
              </button>
            )}
          </div>

          {pinMode && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pinMode === 'ENROLL') handleEnrollBiometric(securityPin);
                else handleVerifySavedBiometric(securityPin);
              }}
              className="p-4 rounded-xl bg-[#F6F7F9] border border-[#E05252]/40 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900">
                <KeyRound className="w-4 h-4 text-[#E05252]" />
                <span>
                  {pinMode === 'ENROLL'
                    ? t(lang, 'أدخل رمز تحقق أماني (4–8 أرقام) لحفظ المفتاح البيومتري المشفر:', 'Enter a 4–8 digit Security PIN to bind your cryptographic key:')
                    : t(lang, 'أدخل الرمز الأمني للتحقق التشفيري من البصمة المحفوظة:', 'Enter your Security PIN to verify your saved cryptographic key:')}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  minLength={4}
                  maxLength={12}
                  required
                  autoFocus
                  value={securityPin}
                  onChange={(e) => setSecurityPin(e.target.value)}
                  placeholder="••••••"
                  className="flex-1 min-w-[160px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-mono text-sm tracking-widest"
                />
                <button
                  type="submit"
                  disabled={enrollingBio || verifyingBio}
                  className="px-4 py-2 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-xs font-bold"
                >
                  {pinMode === 'ENROLL'
                    ? t(lang, 'حفظ في إعدادات المستخدم', 'Save to User Settings')
                    : t(lang, 'تحقق الآن', 'Verify Now')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinMode(null);
                    setSecurityPin('');
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
                >
                  {t(lang, 'إلغاء', 'Cancel')}
                </button>
              </div>
            </form>
          )}

          {bioMsg && (
            <div
              className={`text-xs font-bold rounded-xl p-3 border ${
                bioMsg.kind === 'ok'
                  ? 'text-emerald-900 bg-emerald-50 border-emerald-200'
                  : bioMsg.kind === 'err'
                  ? 'text-red-900 bg-red-50 border-red-200'
                  : 'text-amber-950 bg-amber-50 border-amber-200'
              }`}
            >
              {bioMsg.text}
            </div>
          )}
        </div>

        {/* Offline Mode & Sync Manager */}
        <div className="border border-slate-200 rounded-2xl bg-white p-6 space-y-4">
          <h2 className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <WifiOff className="w-5 h-5 text-[#E05252]" />
            <span>{t(lang, 'إعدادات العمل دون إنترنت وسجل المزامنة', 'Offline Mode & Sync Log')}</span>
          </h2>

          <label className="flex items-center justify-between cursor-pointer p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
            <span className="text-xs font-bold text-slate-800">
              {t(lang, 'تفعيل وضع العمل الميداني دون إنترنت (محاكاة انقطاع الشبكة)', 'Force Field Offline Mode (Test Disconnect/Sync)')}
            </span>
            <input
              type="checkbox"
              checked={settings.offlineSimulation}
              onChange={(e) => onUpdateSettings({ offlineSimulation: e.target.checked })}
              className="accent-[#E05252] w-4 h-4"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await onSyncOffline();
                setSyncLog(getSyncLog());
              }}
              disabled={settings.offlineSimulation || queued.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E05252] disabled:opacity-50 text-white text-xs font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t(lang, `مزامنة الآن (${queued.length})`, `Sync Now (${queued.length})`)}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearOfflineCache();
                setSyncLog([]);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t(lang, 'مسح الذاكرة المحلية', 'Clear Local Cache')}</span>
            </button>
          </div>

          <div className="text-xs space-y-1.5 max-h-36 overflow-y-auto border-t border-slate-200 pt-3">
            <div className="font-bold text-slate-700">{t(lang, 'سجل المزامنة الأخير:', 'Recent Sync History:')}</div>
            {syncLog.length === 0 ? (
              <div className="text-slate-400">{t(lang, 'لا توجد عمليات مزامنة مسجلة بعد.', 'No sync operations recorded yet.')}</div>
            ) : (
              syncLog.map((s) => (
                <div key={s.id} className="flex justify-between gap-2 text-slate-600">
                  <span className="inline-flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    {s.outcome}
                  </span>
                  <span className="font-mono text-slate-400">{formatDateTime(s.timestamp, lang)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="border border-slate-200 rounded-2xl bg-[#F6F7F9] p-5 text-xs font-semibold text-slate-600 flex flex-wrap items-center justify-between gap-3">
        <span>
          {t(
            lang,
            'منصة رَصَد (RASAD) — رصد سلبي مصرح به لمؤشرات النشاط اللاسلكي لحماية منشآت الكهرباء',
            'RASAD Platform — Authorized Passive RF Indicator Monitoring for Power Infrastructure'
          )}
        </span>
        <span className="font-bold text-slate-700">
          {t(lang, 'الإصدار التشغيلي المعتمد', 'Authorized Operational Edition')}
        </span>
      </div>
    </div>
  );
};
