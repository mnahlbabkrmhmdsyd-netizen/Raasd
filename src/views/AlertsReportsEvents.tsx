import React, { useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  ArrowUpRight,
  FilePlus2,
  ShieldCheck,
  WifiOff,
  RefreshCw,
  Paperclip,
  Volume2,
  Lock,
} from 'lucide-react';
import type {
  AuditLogEntry,
  DetectionEvent,
  Facility,
  Language,
  ManualReport,
  SafeUser,
  SeverityLevel,
} from '../types';
import { SEVERITY_META, formatDateTime, t } from '../i18n';
import { apiFetch } from '../utils/api';
import {
  enqueueOfflineReport,
  getQueuedReports,
  type QueuedOfflineReport,
} from '../utils/offlineStore';

export const AlertsView: React.FC<{
  lang: Language;
  user: SafeUser;
  facilities: Facility[];
  events: DetectionEvent[];
  onAcknowledge: (id: string) => Promise<void>;
  onEscalate: (id: string, reason: string) => Promise<void>;
  onTriggerAlarmModal: (ev: DetectionEvent) => void;
}> = ({ lang, user, facilities, events, onAcknowledge, onEscalate, onTriggerAlarmModal }) => {
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'EMERGENCY'>('ALL');
  const canAct = user.role !== 'VIEWER';

  const alerts = events.filter((e) => e.severity !== 'NORMAL' || e.indicator_type === 'SENSOR_OFFLINE');
  const filtered = alerts.filter((a) => {
    if (filter === 'OPEN') return a.status !== 'CLOSED';
    if (filter === 'EMERGENCY') return a.severity === 'EMERGENCY' || a.severity === 'HIGH';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t(lang, 'التنبيهات والإنذارات الفورية', 'Alerts & Emergency Notifications')}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {t(
              lang,
              'متابعة الإنذارات النشطة، تأكيد الاستلام مع تسجيل الوقت، أو التصعيد للمسؤول الأعلى.',
              'Track active alerts, record operator acknowledgements, or escalate to higher authority.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F6F7F9] border border-slate-200 rounded-xl">
          {(['ALL', 'OPEN', 'EMERGENCY'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                filter === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'ALL'
                ? t(lang, 'الكل', 'All')
                : tab === 'OPEN'
                ? t(lang, 'المفتوحة', 'Open')
                : t(lang, 'مرتفعة / طوارئ', 'High / Emergency')}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-slate-200 rounded-2xl bg-white p-12 text-center">
          <BellRing className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-base font-bold text-slate-800">
            {t(lang, 'لا توجد تنبيهات مطابقة للتصفية الحالية', 'No alerts match the current filter')}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ev) => {
            const sev = SEVERITY_META[ev.severity];
            const fac = facilities.find((f) => f.id === ev.facility_id);
            return (
              <div key={ev.id} className="border border-slate-200 rounded-2xl bg-white p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                    <span className={`px-2 py-0.5 rounded-md border ${sev.bg} ${sev.text} ${sev.border}`}>
                      {lang === 'ar' ? sev.ar : sev.en}
                    </span>
                    <span>{fac ? (lang === 'ar' ? fac.name_ar : fac.name_en) : ev.facility_id}</span>
                    <span>·</span>
                    <span className="font-mono tabular-nums">{formatDateTime(ev.created_at, lang)}</span>
                    <span>·</span>
                    <span className="font-mono">{ev.status}</span>
                  </div>
                  <div className="text-base font-extrabold text-slate-900">
                    {lang === 'ar' ? ev.event_type_ar : ev.event_type_en}
                  </div>
                  {ev.acknowledged_by && (
                    <div className="text-xs font-bold text-emerald-700">
                      {t(lang, 'تم الاستلام بواسطة:', 'Acknowledged by:')} {ev.acknowledged_by} (
                      {formatDateTime(ev.acknowledged_at, lang)})
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onTriggerAlarmModal(ev)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-[#F6F7F9] hover:bg-slate-200 text-xs font-bold text-slate-900 inline-flex items-center gap-1.5"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#E05252]" />
                    <span>{t(lang, 'عرض نافذة الإنذار', 'Alarm View')}</span>
                  </button>
                  {canAct && ev.status === 'NEW' && (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(ev.id)}
                      className="px-4 py-2 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t(lang, 'تأكيد الاستلام', 'Acknowledge')}</span>
                    </button>
                  )}
                  {canAct && ev.status !== 'ESCALATED' && ev.status !== 'CLOSED' && (
                    <button
                      type="button"
                      onClick={() => onEscalate(ev.id, 'Operator escalated from Alerts queue')}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 inline-flex items-center gap-1"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{t(lang, 'تصعيد', 'Escalate')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ReportsView: React.FC<{
  lang: Language;
  user: SafeUser;
  facilities: Facility[];
  reports: ManualReport[];
  selectedFacilityId: string;
  isOffline: boolean;
  onRefresh: () => Promise<void>;
  onSyncOffline: () => Promise<void>;
}> = ({
  lang,
  user,
  facilities,
  reports,
  selectedFacilityId,
  isOffline,
  onRefresh,
  onSyncOffline,
}) => {
  const now = new Date();
  const [facilityId, setFacilityId] = useState(selectedFacilityId);
  const [locationDesc, setLocationDesc] = useState('');
  const [eventDate, setEventDate] = useState(now.toISOString().slice(0, 10));
  const [eventTime, setEventTime] = useState(now.toTimeString().slice(0, 5));
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>('HIGH');
  const [notes, setNotes] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentData, setAttachmentData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedOfflineReport[]>(() => getQueuedReports());

  const canCreate = user.role !== 'VIEWER';
  const canUpdateStatus =
    user.role === 'ADMIN' || user.role === 'FACILITY_MANAGER' || user.role === 'RESPONSE_OFFICER';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentData(typeof reader.result === 'string' ? reader.result.slice(0, 200_000) : null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    const fac = facilities.find((f) => f.id === facilityId);
    const clientUuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const payload: QueuedOfflineReport = {
      client_uuid: clientUuid,
      facility_id: facilityId,
      location_desc_ar: locationDesc || (fac ? fac.name_ar : ''),
      location_desc_en: locationDesc || (fac ? fac.name_en : ''),
      lat: fac ? fac.lat + 0.0008 : null,
      lng: fac ? fac.lng - 0.0007 : null,
      event_date: eventDate,
      event_time: eventTime,
      description,
      severity,
      supervisor_notes: notes,
      attachment_name: attachmentName,
      attachment_data: attachmentData,
      queued_at: new Date().toISOString(),
    };

    try {
      if (isOffline) {
        const updated = enqueueOfflineReport(payload);
        setQueued(updated);
        setFeedback(
          t(
            lang,
            'تم حفظ البلاغ محلياً في قائمة الانتظار دون إنترنت. ستتم مزامنته تلقائياً عند عودة الاتصال دون تكرار.',
            'Report saved locally in offline queue. It will sync automatically without duplication upon reconnection.'
          )
        );
      } else {
        await apiFetch('/api/reports', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback(
          t(lang, 'تم إرسال البلاغ بنجاح وربطه بسجل الأحداث ونظام الإنذار.', 'Report submitted and linked to Event Log and Alerting.')
        );
        await onRefresh();
      }
      setLocationDesc('');
      setDescription('');
      setNotes('');
      setAttachmentName(null);
      setAttachmentData(null);
    } catch (err) {
      // Network error fallback to offline queue
      const updated = enqueueOfflineReport(payload);
      setQueued(updated);
      setFeedback(
        t(
          lang,
          `تعذر الإرسال المباشر (${(err as Error).message}) — تم حفظ البلاغ محلياً للمزامنة لاحقاً.`,
          `Direct upload unavailable (${(err as Error).message}) — report queued locally for sync.`
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: ManualReport['status']) => {
    try {
      await apiFetch(`/api/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
    } catch {
      // handled
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t(lang, 'نظام البلاغات اليدوية — «رصدت مسيرة»', 'Manual Sighting Reports — "Drone Sighted"')}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {t(
              lang,
              'تسجيل البلاغات الميدانية الفورية (متاح أيضاً في وضع عدم الاتصال مع منع التكرار عند المزامنة).',
              'Submit field sightings immediately (works offline with automatic deduplicated sync on reconnect).'
            )}
          </p>
        </div>

        {queued.length > 0 && !isOffline && (
          <button
            type="button"
            onClick={async () => {
              await onSyncOffline();
              setQueued(getQueuedReports());
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
          >
            <RefreshCw className="w-4 h-4" />
            <span>
              {t(lang, `مزامنة ${queued.length} بلاغ محفوظ محلياً`, `Sync ${queued.length} Offline Report(s)`)}
            </span>
          </button>
        )}
      </div>

      {/* Form */}
      {canCreate ? (
        <div className="border border-slate-200 rounded-2xl bg-white p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <FilePlus2 className="w-5 h-5 text-[#E05252]" />
            <h2 className="font-display text-xl font-extrabold text-slate-900">
              {t(lang, 'نموذج بلاغ: رصدت مسيرة', 'Report Form: Drone Sighted')}
            </h2>
          </div>

          {feedback && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-bold text-emerald-900">
              {feedback}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'المؤسسة', 'Facility')}</label>
              <select
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {lang === 'ar' ? f.name_ar : f.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'الموقع التفصيلي', 'Specific Location')}</label>
              <input
                required
                value={locationDesc}
                onChange={(e) => setLocationDesc(e.target.value)}
                placeholder={t(lang, 'مثال: قرب بوابة المحولات الشرقية', 'e.g. Near East Transformer Gate')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'مستوى الخطورة', 'Severity Level')}</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
              >
                <option value="WARNING">{t(lang, 'تحذير', 'Warning')}</option>
                <option value="HIGH">{t(lang, 'خطورة مرتفعة', 'High Risk')}</option>
                <option value="EMERGENCY">{t(lang, 'طوارئ', 'Emergency')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'التاريخ', 'Date')}</label>
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'الوقت', 'Time')}</label>
              <input
                type="time"
                required
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'مرفق (اختياري)', 'Attachment (Optional)')}</label>
              <label className="w-full px-3.5 py-2.5 rounded-xl border border-dashed border-slate-300 bg-[#F6F7F9] hover:bg-slate-200/60 text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer truncate">
                <Paperclip className="w-4 h-4 shrink-0" />
                <span className="truncate">{attachmentName || t(lang, 'إرفاق صورة أو مستند', 'Attach file')}</span>
                <input type="file" onChange={handleFile} className="hidden" />
              </label>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'وصف الحدث', 'Event Description')}</label>
              <textarea
                required
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  lang,
                  'صف اتجاه التحليق التقديري، الارتفاع التقريبي، أو أي مشاهدات بصرية أو صوتية.',
                  'Describe estimated flight direction, approximate altitude, and visual/audio observations.'
                )}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'ملاحظات المسؤول', 'Supervisor Notes')}</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white font-extrabold text-sm inline-flex items-center gap-2"
              >
                {isOffline && <WifiOff className="w-4 h-4" />}
                <span>
                  {submitting
                    ? t(lang, 'جاري التسجيل...', 'Submitting...')
                    : isOffline
                    ? t(lang, 'حفظ البلاغ محلياً (دون إنترنت)', 'Queue Report Offline')
                    : t(lang, 'إرسال بلاغ «رصدت مسيرة»', 'Submit "Drone Sighted" Report')}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold text-slate-700">
          {t(lang, 'حساب المشاهدة لا يمتلك صلاحية إنشاء بلاغات جديدة.', 'Viewer accounts have read-only access to reports.')}
        </div>
      )}

      {/* Offline Queue List */}
      {queued.length > 0 && (
        <div className="border border-amber-200 rounded-2xl bg-amber-50 p-5 space-y-2">
          <div className="text-sm font-extrabold text-amber-950">
            {t(lang, `البلاغات المحفوظة محلياً بانتظار المزامنة (${queued.length})`, `Locally Queued Reports Awaiting Sync (${queued.length})`)}
          </div>
          {queued.map((q) => (
            <div key={q.client_uuid} className="p-3 rounded-xl bg-white border border-amber-200 text-xs font-semibold flex justify-between gap-2">
              <span>{q.location_desc_ar} — {q.description}</span>
              <span className="font-mono text-amber-800 shrink-0">{q.event_date} {q.event_time}</span>
            </div>
          ))}
        </div>
      )}

      {/* Submitted Reports Table */}
      <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
        <div className="px-6 py-4 bg-[#F6F7F9] border-b border-slate-200 font-display text-lg font-extrabold text-slate-900">
          {t(lang, 'سجل البلاغات المسجلة', 'Submitted Sighting Reports')}
        </div>

        {reports.length === 0 ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-500">
            {t(lang, 'لا توجد بلاغات مسجلة حتى الآن.', 'No sighting reports logged yet.')}
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {reports.map((rep) => {
              const sev = SEVERITY_META[rep.severity];
              const fac = facilities.find((f) => f.id === rep.facility_id);
              return (
                <div key={rep.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                      <span className={`px-2 py-0.5 rounded-md border ${sev.bg} ${sev.text} ${sev.border}`}>
                        {lang === 'ar' ? sev.ar : sev.en}
                      </span>
                      <span>{fac ? (lang === 'ar' ? fac.name_ar : fac.name_en) : rep.facility_id}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">{rep.event_date} {rep.event_time}</span>
                      <span>·</span>
                      <span>{rep.reporter_name}</span>
                    </div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {lang === 'ar' ? rep.location_desc_ar : rep.location_desc_en}
                    </div>
                    <p className="text-xs font-medium text-slate-600">{rep.description}</p>
                    {rep.attachment_name && (
                      <div className="text-xs font-mono text-slate-500">
                        {t(lang, 'مرفق:', 'Attachment:')} {rep.attachment_name}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-[#F6F7F9] border border-slate-200">
                      {rep.status}
                    </span>
                    {canUpdateStatus && rep.status !== 'CLOSED' && (
                      <select
                        value={rep.status}
                        onChange={(e) => handleStatusUpdate(rep.id, e.target.value as ManualReport['status'])}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                      >
                        <option value="SUBMITTED">{t(lang, 'مسجّل', 'Submitted')}</option>
                        <option value="UNDER_REVIEW">{t(lang, 'قيد المراجعة', 'Under Review')}</option>
                        <option value="DISPATCHED">{t(lang, 'تم توجيه الاستجابة', 'Dispatched')}</option>
                        <option value="CLOSED">{t(lang, 'مغلق', 'Closed')}</option>
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const EventLogView: React.FC<{
  lang: Language;
  user: SafeUser;
  facilities: Facility[];
  events: DetectionEvent[];
  auditLogs: AuditLogEntry[];
}> = ({ lang, user, facilities, events, auditLogs }) => {
  const [tab, setTab] = useState<'events' | 'audit'>('events');
  const [searchQuery, setSearchQuery] = useState('');
  const [sevFilter, setSevFilter] = useState<string>('ALL');
  const [chainStatus, setChainStatus] = useState<{ valid: boolean; checked_count: number } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const canSeeAudit =
    user.role === 'ADMIN' || user.role === 'FACILITY_MANAGER' || user.role === 'MONITORING_OFFICER';

  const filteredEvents = events.filter((ev) => {
    if (sevFilter !== 'ALL' && ev.severity !== sevFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      ev.event_type_ar.toLowerCase().includes(q) ||
      ev.event_type_en.toLowerCase().includes(q) ||
      ev.indicator_type.toLowerCase().includes(q) ||
      ev.source_type.toLowerCase().includes(q)
    );
  });

  const verifyChain = async () => {
    setVerifying(true);
    try {
      const res = await apiFetch<{ valid: boolean; checked_count: number }>('/api/events/verify-chain');
      setChainStatus(res);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t(lang, 'سجل الأحداث والأدلة الرقمية', 'Event Log & Digital Evidence')}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {t(
              lang,
              'سجل مركزي محمي بسلسلة تجزئة SHA-256 ضد التعديل غير المصرح به، مع سجل تدقيق للعمليات الإدارية.',
              'Tamper-evident SHA-256 hash-chained event ledger with administrative audit trail.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={verifyChain}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-[#F6F7F9] hover:bg-slate-200 text-xs font-bold text-slate-900"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>{verifying ? t(lang, 'جاري الفحص...', 'Verifying...') : t(lang, 'التحقق من سلامة السجلات', 'Verify Hash Chain')}</span>
          </button>

          {canSeeAudit && (
            <div className="flex items-center gap-1 p-1 bg-[#F6F7F9] border border-slate-200 rounded-xl">
              <button
                type="button"
                onClick={() => setTab('events')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  tab === 'events' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {t(lang, 'الأحداث والأدلة', 'Events')}
              </button>
              <button
                type="button"
                onClick={() => setTab('audit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  tab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {t(lang, 'سجل التدقيق الإداري', 'Audit Trail')}
              </button>
            </div>
          )}
        </div>
      </div>

      {chainStatus && (
        <div
          className={`p-4 rounded-xl border text-sm font-bold flex items-center gap-2.5 ${
            chainStatus.valid
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            {chainStatus.valid
              ? t(
                  lang,
                  `تم التحقق بنجاح: سلسلة الأدلة الرقمية سليمة بالكامل (${chainStatus.checked_count} سجل موثق دون أي تعديل).`,
                  `Verified: Digital evidence hash chain is 100% intact across ${chainStatus.checked_count} records.`
                )
              : t(lang, 'تحذير: تم رصد خلل في سلسلة التجزئة!', 'Warning: Hash chain mismatch detected!')}
          </span>
        </div>
      )}

      {tab === 'events' ? (
        <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
          <div className="px-4 py-3 bg-[#F6F7F9] border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(lang, 'بحث في الأحداث أو المؤشرات...', 'Search events or indicators...')}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold w-full sm:w-72"
            />
            <select
              value={sevFilter}
              onChange={(e) => setSevFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
            >
              <option value="ALL">{t(lang, 'جميع مستويات الخطورة', 'All Severities')}</option>
              <option value="NORMAL">{t(lang, 'طبيعي', 'Normal')}</option>
              <option value="WARNING">{t(lang, 'تحذير', 'Warning')}</option>
              <option value="HIGH">{t(lang, 'خطورة مرتفعة', 'High Risk')}</option>
              <option value="EMERGENCY">{t(lang, 'طوارئ', 'Emergency')}</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-600 bg-slate-50">
                  <th className="py-3 px-4 text-start">{t(lang, 'التاريخ والوقت', 'Timestamp')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'المؤسسة', 'Facility')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'الحدث والمصدر', 'Event & Source')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'الخطورة / الثقة', 'Severity / Conf')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'المستلم / الحالة', 'Ack / Status')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'بصمة الدليل', 'Hash')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500 font-semibold">
                      {t(lang, 'لا توجد أحداث مطابقة.', 'No matching events found.')}
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((ev) => {
                    const sev = SEVERITY_META[ev.severity];
                    const fac = facilities.find((f) => f.id === ev.facility_id);
                    return (
                      <tr key={ev.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatDateTime(ev.created_at, lang)}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {fac ? (lang === 'ar' ? fac.name_ar : fac.name_en) : ev.facility_id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {lang === 'ar' ? ev.event_type_ar : ev.event_type_en}
                          </div>
                          <div className="text-slate-500 font-mono">
                            {ev.source_type} · {ev.indicator_type}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded border font-bold ${sev.bg} ${sev.text} ${sev.border}`}>
                            {lang === 'ar' ? sev.ar : sev.en} ({ev.confidence_pct}%)
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-800">{ev.status}</div>
                          {ev.acknowledged_by && <div className="text-slate-500">{ev.acknowledged_by}</div>}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {ev.record_hash.slice(0, 12)}…
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-600 bg-slate-50">
                  <th className="py-3 px-4 text-start">{t(lang, 'الوقت', 'Time')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'المستخدم والدور', 'Actor & Role')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'العملية', 'Action')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'الهدف', 'Target')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatDateTime(log.created_at, lang)}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {log.actor_username} ({log.actor_role})
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#E05252]">{log.action}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {log.target_type}:{log.target_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
