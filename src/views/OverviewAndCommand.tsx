import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Radio,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import type {
  DetectionEvent,
  Facility,
  Language,
  ManualReport,
  NavSection,
  SafeUser,
  SensorUnit,
} from '../types';
import { FACILITY_TYPE_LABELS, SEVERITY_META, formatDateTime, t } from '../i18n';
import { FacilityMap } from '../components/FacilityMap';

interface OverviewProps {
  lang: Language;
  facility: Facility;
  allFacilities: Facility[];
  sensors: SensorUnit[];
  events: DetectionEvent[];
  reports: ManualReport[];
  onNavigate: (sec: NavSection) => void;
  onSelectFacility: (id: string) => void;
  onAcknowledgeEvent: (id: string) => Promise<void>;
  canOperate: boolean;
}

export const OverviewView: React.FC<OverviewProps> = ({
  lang,
  facility,
  allFacilities,
  sensors,
  events,
  reports,
  onNavigate,
  onSelectFacility,
  onAcknowledgeEvent,
  canOperate,
}) => {
  const facilitySensors = sensors.filter((s) => s.facility_id === facility.id);
  const connectedSensors = facilitySensors.filter((s) => s.connection_status === 'CONNECTED');
  const facilityEvents = events.filter((e) => e.facility_id === facility.id);
  const activeEvents = facilityEvents.filter((e) => e.status !== 'CLOSED');
  const activeAlerts = activeEvents.filter(
    (e) => e.severity === 'WARNING' || e.severity === 'HIGH' || e.severity === 'EMERGENCY'
  );
  const sev = SEVERITY_META[facility.risk_level];

  const monitoringLabel =
    connectedSensors.length === 0
      ? t(lang, 'غير متصل — لا توجد مراقبة حية', 'Offline — No Live Monitoring')
      : connectedSensors.length < facilitySensors.length
      ? t(lang, 'مراقبة جزئية (بعض الوحدات منقطعة)', 'Partial Monitoring (Degraded)')
      : t(lang, 'مراقبة سلبية نشطة', 'Active Passive Monitoring');

  return (
    <div className="space-y-6">
      {/* Facility Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-slate-200 rounded-2xl p-6 bg-white">
        <div>
          <div className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-2">
            <span>{facility.code}</span>
            <span>·</span>
            <span>{lang === 'ar' ? FACILITY_TYPE_LABELS[facility.type].ar : FACILITY_TYPE_LABELS[facility.type].en}</span>
            <span>·</span>
            <span>{lang === 'ar' ? facility.region_ar : facility.region_en}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            {lang === 'ar' ? facility.name_ar : facility.name_en}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {lang === 'ar' ? facility.notes_ar : facility.notes_en}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="px-4 py-2.5 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white font-bold text-sm transition-colors whitespace-nowrap"
          >
            {t(lang, 'بلاغ: رصدت مسيرة', 'Report: Drone Sighted')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('detection')}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-[#F6F7F9] hover:bg-slate-200 text-slate-900 font-bold text-sm transition-colors whitespace-nowrap"
          >
            {t(lang, 'فحص مؤشرات المسيرات', 'Inspect RF Indicators')}
          </button>
        </div>
      </div>

      {/* 5 Primary Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-2">
            {t(lang, 'حالة نظام المراقبة', 'Monitoring System')}
          </div>
          <div className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            {connectedSensors.length > 0 ? (
              <Activity className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <WifiOff className="w-5 h-5 text-slate-500 shrink-0" />
            )}
            <span>{monitoringLabel}</span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-2">
            {t(lang, 'حالة وحدات الاستشعار', 'Sensor Units Online')}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
              {connectedSensors.length}/{facilitySensors.length}
            </span>
            <span className="text-xs font-bold text-slate-500">{t(lang, 'وحدة متصلة', 'connected')}</span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-2">
            {t(lang, 'الأحداث الحالية المفتوحة', 'Active Open Events')}
          </div>
          <div className="font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
            {activeEvents.length}
          </div>
        </div>

        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-2">
            {t(lang, 'التنبيهات النشطة', 'Active Alerts')}
          </div>
          <div className="font-mono text-3xl font-extrabold text-[#E05252] tabular-nums">
            {activeAlerts.length}
          </div>
        </div>

        <div className={`border rounded-2xl p-5 ${sev.bg} ${sev.border}`}>
          <div className="text-xs font-bold text-slate-600 mb-2">
            {t(lang, 'مستوى الخطورة الحالي', 'Current Risk Level')}
          </div>
          <div className={`flex items-center gap-2 text-xl font-extrabold ${sev.text}`}>
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>{lang === 'ar' ? sev.ar : sev.en}</span>
          </div>
        </div>
      </div>

      {/* Map + Latest Events Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7">
          <FacilityMap
            lang={lang}
            facility={facility}
            allFacilities={allFacilities}
            sensors={facilitySensors}
            allSensors={sensors}
            events={events}
            reports={reports}
            onSelectFacility={onSelectFacility}
            heightClass="h-[430px]"
          />
        </div>

        <div className="xl:col-span-5 border border-slate-200 rounded-2xl bg-white overflow-hidden">
          <div className="px-5 py-4 bg-[#F6F7F9] border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              {t(lang, 'آخر الأحداث المسجلة', 'Latest Recorded Events')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('events')}
              className="text-xs font-bold text-[#E05252] hover:underline inline-flex items-center gap-1"
            >
              <span>{t(lang, 'السجل الكامل', 'Full Log')}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {facilityEvents.length === 0 ? (
            <div className="p-8 text-center">
              <Radio className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <div className="text-base font-bold text-slate-800 mb-1">
                {t(lang, 'لا توجد أحداث مسجلة لهذه المؤسسة', 'No events recorded for this facility')}
              </div>
              <p className="text-xs font-medium text-slate-500 mb-4">
                {t(
                  lang,
                  'لا يتم عرض بيانات كشف مصطنعة. ستظهر المؤشرات الحقيقية هنا فور اتصال وحدات الاستشعار أو تقديم بلاغ يدوي.',
                  'No fabricated detection data is shown. Real records appear here once sensors connect or field reports are logged.'
                )}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('sensors')}
                className="px-4 py-2 rounded-lg bg-[#F6F7F9] border border-slate-200 hover:bg-slate-200 text-xs font-bold text-slate-800"
              >
                {t(lang, 'فحص وحدات الاستشعار', 'Inspect Sensor Units')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {facilityEvents.slice(0, 6).map((ev) => {
                const evSev = SEVERITY_META[ev.severity];
                return (
                  <div key={ev.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="text-sm font-bold text-slate-900">
                        {lang === 'ar' ? ev.event_type_ar : ev.event_type_en}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-bold border shrink-0 ${evSev.bg} ${evSev.text} ${evSev.border}`}
                      >
                        {lang === 'ar' ? evSev.ar : evSev.en}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-mono tabular-nums">{formatDateTime(ev.created_at, lang)}</span>
                      <span>·</span>
                      <span>
                        {t(lang, 'احتمال', 'Prob')}: {ev.probabilistic_score}% / {t(lang, 'ثقة', 'Conf')}: {ev.confidence_pct}%
                      </span>
                    </div>
                    {ev.status === 'NEW' && canOperate && (
                      <button
                        type="button"
                        onClick={() => onAcknowledgeEvent(ev.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E05252] hover:underline"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t(lang, 'تأكيد استلام الحدث', 'Acknowledge Event')}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface CommandCenterProps {
  lang: Language;
  user: SafeUser;
  facilities: Facility[];
  sensors: SensorUnit[];
  events: DetectionEvent[];
  onSelectFacility: (facilityId: string) => void;
}

export const CommandCenterView: React.FC<CommandCenterProps> = ({
  lang,
  user,
  facilities,
  sensors,
  events,
  onSelectFacility,
}) => {
  const disconnectedFacilities = facilities.filter((f) => {
    const fSensors = sensors.filter((s) => s.facility_id === f.id);
    return fSensors.length === 0 || fSensors.every((s) => s.connection_status !== 'CONNECTED');
  });

  const interventionFacilities = facilities.filter(
    (f) => f.risk_level === 'HIGH' || f.risk_level === 'EMERGENCY'
  );

  const totalOpenEvents = events.filter((e) => e.status !== 'CLOSED').length;
  const totalConnectedSensors = sensors.filter((s) => s.connection_status === 'CONNECTED').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
          {t(lang, 'مركز القيادة الموحد', 'Unified Command Center')}
        </h1>
        <p className="text-sm font-medium text-slate-600 mt-1">
          {user.role === 'ADMIN'
            ? t(
                lang,
                'رؤية شاملة لجميع المؤسسات الكهربائية المسجلة وحالة الاتصال والخطورة.',
                'Executive cross-facility monitoring across all registered power infrastructure.'
              )
            : t(
                lang,
                'عرض مقيد بالمؤسسات المصرح لك بالوصول إليها فقط وفق صلاحيات دورك.',
                'Scoped strictly to facilities authorized for your role.'
              )}
        </p>
      </div>

      {/* Executive Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1.5">
            {t(lang, 'المؤسسات المصرح بها', 'Authorized Facilities')}
          </div>
          <div className="font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
            {facilities.length}
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1.5">
            {t(lang, 'وحدات الاستشعار المتصلة', 'Connected Sensors')}
          </div>
          <div className="font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
            {totalConnectedSensors}/{sensors.length}
          </div>
        </div>
        <div className="border border-amber-200 rounded-2xl p-5 bg-amber-50">
          <div className="text-xs font-bold text-amber-900 mb-1.5">
            {t(lang, 'مؤسسات تعاني انقطاع الاتصال', 'Disconnected Facilities')}
          </div>
          <div className="font-mono text-3xl font-extrabold text-amber-900 tabular-nums">
            {disconnectedFacilities.length}
          </div>
        </div>
        <div className="border border-red-200 rounded-2xl p-5 bg-red-50">
          <div className="text-xs font-bold text-red-900 mb-1.5">
            {t(lang, 'مؤسسات تحتاج إلى تدخل', 'Facilities Needing Intervention')}
          </div>
          <div className="font-mono text-3xl font-extrabold text-red-900 tabular-nums">
            {interventionFacilities.length}
          </div>
        </div>
      </div>

      {/* Unified Facility Matrix Table */}
      <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
        <div className="px-6 py-4 bg-[#F6F7F9] border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold text-slate-900">
            {t(lang, 'جدول حالة المؤسسات الكهربائية', 'Electrical Facilities Status Matrix')}
          </h2>
          <span className="text-xs font-bold text-slate-600 font-mono tabular-nums">
            {t(lang, `إجمالي الأحداث النشطة: ${totalOpenEvents}`, `Total Active Events: ${totalOpenEvents}`)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-600 bg-slate-50">
                <th className="py-3.5 px-4 text-start">{t(lang, 'المؤسسة', 'Facility')}</th>
                <th className="py-3.5 px-4 text-start">{t(lang, 'النوع', 'Type')}</th>
                <th className="py-3.5 px-4 text-start">{t(lang, 'حالة الاتصال', 'Connectivity')}</th>
                <th className="py-3.5 px-4 text-start">{t(lang, 'وحدات الاستشعار', 'Sensors')}</th>
                <th className="py-3.5 px-4 text-start">{t(lang, 'الأحداث النشطة', 'Active Events')}</th>
                <th className="py-3.5 px-4 text-start">{t(lang, 'مستوى الخطورة', 'Risk Level')}</th>
                <th className="py-3.5 px-4 text-end">{t(lang, 'إجراء', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {facilities.map((fac) => {
                const fSensors = sensors.filter((s) => s.facility_id === fac.id);
                const connCount = fSensors.filter((s) => s.connection_status === 'CONNECTED').length;
                const openEvs = events.filter((e) => e.facility_id === fac.id && e.status !== 'CLOSED');
                const alertCount = openEvs.filter((e) => e.severity !== 'NORMAL').length;
                const sev = SEVERITY_META[fac.risk_level];

                return (
                  <tr key={fac.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-extrabold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>{lang === 'ar' ? fac.name_ar : fac.name_en}</span>
                      </div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">{fac.code}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {lang === 'ar' ? FACILITY_TYPE_LABELS[fac.type].ar : FACILITY_TYPE_LABELS[fac.type].en}
                    </td>
                    <td className="py-3.5 px-4">
                      {connCount === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                          {t(lang, 'منقطعة', 'Disconnected')}
                        </span>
                      ) : connCount < fSensors.length ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          {t(lang, 'اتصال جزئي', 'Degraded')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          {t(lang, 'متصلة', 'Connected')}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {connCount}/{fSensors.length}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {openEvs.length} ({alertCount} {t(lang, 'تنبيه', 'alerts')})
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${sev.bg} ${sev.text} ${sev.border}`}
                      >
                        {lang === 'ar' ? sev.ar : sev.en}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-end">
                      <button
                        type="button"
                        onClick={() => onSelectFacility(fac.id)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#E05252] hover:bg-[#D14242] text-white text-xs font-bold transition-colors whitespace-nowrap"
                      >
                        {t(lang, 'فتح الملف', 'Inspect')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
