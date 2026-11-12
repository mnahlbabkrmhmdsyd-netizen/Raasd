import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, ArrowUpRight, Volume2, AlertOctagon, Clock } from 'lucide-react';
import type { DetectionEvent, Facility, Language } from '../types';
import { SEVERITY_META, formatDateTime, t } from '../i18n';
import { stopAlarmAudio } from '../utils/alarmAudio';

interface EmergencyAlarmModalProps {
  lang: Language;
  event: DetectionEvent;
  facility?: Facility;
  sirenCycle: number;
  maxRepeats: number;
  autoEscalateSeconds: number;
  canAcknowledge: boolean;
  onAcknowledge: (eventId: string) => Promise<void>;
  onEscalate: (eventId: string, reason: string) => Promise<void>;
  onDismissLocal: () => void;
}

export const EmergencyAlarmModal: React.FC<EmergencyAlarmModalProps> = ({
  lang,
  event,
  facility,
  sirenCycle,
  maxRepeats,
  autoEscalateSeconds,
  canAcknowledge,
  onAcknowledge,
  onEscalate,
  onDismissLocal,
}) => {
  const [countdown, setCountdown] = useState(autoEscalateSeconds);
  const [escalatedAuto, setEscalatedAuto] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCountdown(autoEscalateSeconds);
    setEscalatedAuto(false);
  }, [event.id, autoEscalateSeconds]);

  useEffect(() => {
    if (countdown <= 0) {
      if (!escalatedAuto && canAcknowledge) {
        setEscalatedAuto(true);
        onEscalate(
          event.id,
          t(lang, 'تصعيد تلقائي لانتهاء مهلة تأكيد الاستلام', 'Auto-escalated after acknowledgement timeout')
        ).catch(() => {});
      }
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, escalatedAuto, canAcknowledge, event.id, lang, onEscalate]);

  const sev = SEVERITY_META[event.severity];
  const facilityName = facility
    ? lang === 'ar'
      ? facility.name_ar
      : facility.name_en
    : event.facility_id;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-xl bg-white rounded-2xl border-2 border-red-500 shadow-2xl overflow-hidden"
      >
        {/* Top Alarm Banner */}
        <div className="bg-[#E05252] text-white px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-red-100">
                {t(lang, 'إنذار طوارئ منشأة حيوية', 'CRITICAL INFRASTRUCTURE ALARM')}
              </div>
              <h2 className="font-display text-2xl font-extrabold leading-tight">
                {t(lang, 'تنبيه أمني عاجل', 'Urgent Security Alert')}
              </h2>
            </div>
          </div>

          <div className="text-end shrink-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/15 px-3 py-1.5 rounded-lg font-mono tabular-nums">
              <Volume2 className="w-4 h-4" />
              <span>
                {sirenCycle}/{maxRepeats}
              </span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[#F6F7F9] border border-slate-200">
              <div className="text-xs font-bold text-slate-500 mb-1">
                {t(lang, 'المؤسسة الكهربائية', 'Electrical Facility')}
              </div>
              <div className="text-base font-extrabold text-slate-900">{facilityName}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F6F7F9] border border-slate-200">
              <div className="text-xs font-bold text-slate-500 mb-1">
                {t(lang, 'مستوى الخطورة', 'Severity Level')}
              </div>
              <div className={`inline-flex items-center gap-1.5 text-sm font-extrabold ${sev.text}`}>
                <BellRing className="w-4 h-4" />
                <span>{lang === 'ar' ? sev.ar : sev.en}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F6F7F9] border border-slate-200 sm:col-span-2">
              <div className="text-xs font-bold text-slate-500 mb-1">
                {t(lang, 'نوع الحدث ومصدره', 'Event Type & Source')}
              </div>
              <div className="text-base font-extrabold text-slate-900 mb-1">
                {lang === 'ar' ? event.event_type_ar : event.event_type_en}
              </div>
              <div className="text-xs font-bold text-slate-600 flex flex-wrap items-center gap-2">
                <span>
                  {event.source_type === 'DRILL_SIMULATION'
                    ? t(lang, 'المصدر: تمرين محاكاة تدريبي', 'Source: Training Drill Simulation')
                    : event.source_type === 'MANUAL_REPORT'
                    ? t(lang, 'المصدر: بلاغ ميداني يدوي', 'Source: Manual Field Report')
                    : t(lang, 'المصدر: وحدة استشعار لاسلكية', 'Source: Wireless Sensor Unit')}
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums">{formatDateTime(event.created_at, lang)}</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3 text-sm font-bold text-amber-900">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-amber-700" />
              <span>
                {escalatedAuto
                  ? t(lang, 'تم تصعيد التنبيه تلقائياً للمسؤول الأعلى', 'Alert escalated automatically to higher authority')
                  : t(lang, 'التصعيد التلقائي عند عدم الاستلام خلال:', 'Auto-escalation if unacknowledged in:')}
              </span>
            </div>
            {!escalatedAuto && <span className="font-mono tabular-nums text-base">{countdown}s</span>}
          </div>

          <p className="text-xs font-medium text-slate-500">
            {t(
              lang,
              'ملاحظة تقنية: يعتمد مستوى الصوت على إعدادات نظام التشغيل والمتصفح؛ لا يتجاوز النظام وضع الصامت على أجهزة الهاتف.',
              'Device note: Audible output respects OS/browser audio settings and cannot override hardware silent mode.'
            )}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            {canAcknowledge ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    stopAlarmAudio();
                    try {
                      await onAcknowledge(event.id);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="flex-1 py-3.5 px-5 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white font-extrabold text-base inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{t(lang, 'تأكيد استلام الإنذار وإيقاف الصوت', 'Acknowledge Alarm & Silence')}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    stopAlarmAudio();
                    try {
                      await onEscalate(event.id, 'Manual escalation by operator');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="py-3.5 px-5 rounded-xl border border-slate-300 bg-[#F6F7F9] hover:bg-slate-200 text-slate-900 font-bold text-sm inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>{t(lang, 'تصعيد فوري', 'Escalate')}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  stopAlarmAudio();
                  onDismissLocal();
                }}
                className="flex-1 py-3.5 px-5 rounded-xl bg-slate-900 text-white font-bold text-base"
              >
                {t(lang, 'إغلاق التنبيه محلياً (صلاحية مشاهدة)', 'Dismiss Locally (Viewer)')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
