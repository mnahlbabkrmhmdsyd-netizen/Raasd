import React, { useState } from 'react';
import {
  Radar,
  ShieldAlert,
  Brain,
  Info,
  AlertTriangle,
  Wifi,
  Activity,
  CheckCircle2,
  Play,
} from 'lucide-react';
import type { AIAssessment, DetectionEvent, Facility, Language, SafeUser, SensorUnit } from '../types';
import { SEVERITY_META, formatDateTime, t } from '../i18n';
import { apiFetch } from '../utils/api';

export const DroneDetectionView: React.FC<{
  lang: Language;
  user: SafeUser;
  facility: Facility;
  sensors: SensorUnit[];
  events: DetectionEvent[];
  onRefresh: () => Promise<void>;
}> = ({ lang, user, facility, sensors, events, onRefresh }) => {
  const facilitySensors = sensors.filter((s) => s.facility_id === facility.id);
  const wirelessEvents = events.filter(
    (e) => e.facility_id === facility.id && e.indicator_type !== 'SENSOR_OFFLINE'
  );

  const [selectedSensorId, setSelectedSensorId] = useState(facilitySensors[0]?.id || '');
  const [drillSsid, setDrillSsid] = useState('DJI_MAVIC_AIR2');
  const [drillMac, setDrillMac] = useState('60:60:1F:8A:4C:12');
  const [drillRssiDelta, setDrillRssiDelta] = useState(17);
  const [drillPps, setDrillPps] = useState(240);
  const [drillVideoPattern, setDrillVideoPattern] = useState(true);
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const canRunDrill =
    user.role === 'ADMIN' || user.role === 'FACILITY_MANAGER' || user.role === 'MONITORING_OFFICER';

  const handleRunLabeledDrill = async (e: React.FormEvent) => {
    e.preventDefault();
    const sensorId = selectedSensorId || facilitySensors[0]?.id;
    if (!sensorId) return;
    setRunning(true);
    setStatusMsg(null);
    try {
      await apiFetch(`/api/sensors/${sensorId}/drill`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'DRILL_DETECTION',
          indicators: {
            ssid_candidate: drillSsid,
            mac_address_masked: drillMac,
            rssi_dbm: -52,
            rssi_delta_dbm: Number(drillRssiDelta),
            packet_rate_pps: Number(drillPps),
            baseline_pps: 32,
            channel: 6,
            video_control_pattern: drillVideoPattern,
          },
        }),
      });
      setStatusMsg(
        t(
          lang,
          'تم تنفيذ تمرين المحاكاة التدريبي وتقييم المؤشرات احتمالياً (مصنّف بوضوح كتمرين تدريبي).',
          'Training drill executed and evaluated probabilistically (explicitly tagged as DRILL_SIMULATION).'
        )
      );
      await onRefresh();
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
          {t(lang, 'نظام كشف مؤشرات الطائرات المسيرة', 'Drone Wireless Indicator Detection')}
        </h1>
        <p className="text-sm font-medium text-slate-600 mt-1">
          {t(
            lang,
            'تحليل احتمالي متعدد المؤشرات لإطارات WiFi السلبية المستقبَلة من وحدات Raspberry Pi + USB Monitor Mode (Python 3 / Scapy) عبر WebSocket.',
            'Multi-indicator probabilistic analysis of passive WiFi Monitor Mode frames ingested from Raspberry Pi / Scapy sensor units.'
          )}
        </p>
      </div>

      {/* Mandatory Technical Honesty & Passive Compliance Notice */}
      <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 flex items-start gap-3.5">
        <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-sm font-semibold text-amber-950 space-y-1">
          <div className="font-extrabold">
            {t(lang, 'حدود الرصد وضوابط الامتثال السلبي:', 'Detection Limitations & Passive Compliance:')}
          </div>
          <p>
            {t(
              lang,
              '• الرصد عبر WiFi Monitor Mode محدود ولا يستطيع اكتشاف جميع أنواع المسيرات (مثل المسيرات المعتمدة على ترددات OcuSync أو ELRS أو 900MHz خارج نطاق WiFi).',
              '• WiFi-based detection is inherently limited and cannot detect all drone types (e.g., proprietary OcuSync, ELRS, or non-WiFi RF links).'
            )}
          </p>
          <p>
            {t(
              lang,
              '• يعمل النظام بصورة سلبية تماماً ومصرح بها (رصد ترويسات فقط دون تشويش، أو اختراق، أو حقن حزم، أو اعتراض محتوى الاتصالات الخاصة). لا يُعد أي مؤشر منفرد دليلاً مؤكداً على وجود مسيرة.',
              '• Operation is strictly passive and authorized (zero jamming, hacking, packet injection, or payload interception). No single indicator is treated as confirmed proof.'
            )}
          </p>
        </div>
      </div>

      {/* Hardware Pipeline Architecture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'بنية وحدة الاستشعار', 'Edge Sensor Stack')}</div>
          <div className="text-sm font-extrabold text-slate-900">Raspberry Pi + USB WiFi (Monitor Mode)</div>
          <div className="text-xs font-medium text-slate-600 mt-1">Python 3 · Scapy Passive Sniffer</div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'بروتوكول الربط الفوري', 'Real-Time Uplink')}</div>
          <div className="text-sm font-extrabold text-slate-900">Encrypted HTTPS / WebSocket Stream</div>
          <div className="text-xs font-medium text-slate-600 mt-1">
            {t(lang, 'مع توثيق برمز وحدة الاستشعار', 'Authenticated via per-unit sensor token')}
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'محرك التقييم الاحتمالي', 'Probabilistic Engine')}</div>
          <div className="text-sm font-extrabold text-slate-900">
            {t(lang, 'دمج 5 مؤشرات متزامنة', '5-Factor Corroborated Scoring')}
          </div>
          <div className="text-xs font-medium text-slate-600 mt-1">
            SSID · IEEE OUI · RSSI Δ · PPS · Cadence
          </div>
        </div>
      </div>

      {/* Live / Recorded Indicators Table */}
      <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
        <div className="px-6 py-4 bg-[#F6F7F9] border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Radar className="w-5 h-5 text-[#E05252]" />
            <span>{t(lang, 'سجل المؤشرات اللاسلكية المرصودة', 'Wireless Detection Indicators Feed')}</span>
          </h2>
          <span className="text-xs font-bold text-slate-500 font-mono tabular-nums">
            {wirelessEvents.length} {t(lang, 'سجل', 'records')}
          </span>
        </div>

        {wirelessEvents.length === 0 ? (
          <div className="p-10 text-center">
            <Wifi className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <div className="text-base font-bold text-slate-800 mb-1">
              {t(lang, 'لا توجد مؤشرات نشاط لاسلكي مرصودة حالياً', 'No wireless drone indicators detected yet')}
            </div>
            <p className="text-xs font-medium text-slate-500 max-w-lg mx-auto">
              {t(
                lang,
                'ستظهر المؤشرات الحية هنا بمجرد إرسال وحدة الاستشعار الميدانية للبيانات، أو يمكنك تنفيذ تمرين محاكاة تدريبي مصنّف بوضوح أدناه لاختبار محرك التقييم والإنذار.',
                'Live telemetry indicators appear here when field sensors transmit frames, or authorized operators may run an explicitly labeled training drill below.'
              )}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {wirelessEvents.map((ev) => {
              const sev = SEVERITY_META[ev.severity];
              const ind = ev.indicators || {};
              const factors = Array.isArray(ind.matched_factors)
                ? (ind.matched_factors as Array<{ factor_key: string; points: number; label_ar: string; label_en: string }>)
                : [];
              const sensor = sensors.find((s) => s.id === ev.sensor_id);

              return (
                <div key={ev.id} className="p-5 hover:bg-slate-50/70 transition-colors space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-500 mb-1 flex flex-wrap items-center gap-2">
                        <span>
                          {ev.source_type === 'DRILL_SIMULATION'
                            ? t(lang, 'مصدر البيانات: تمرين محاكاة تدريبي', 'Source: Training Drill Simulation')
                            : ev.source_type === 'MANUAL_REPORT'
                            ? t(lang, 'مصدر البيانات: بلاغ بشري', 'Source: Manual Report')
                            : t(lang, 'مصدر البيانات: وحدة استشعار حية', 'Source: Live Sensor Unit')}
                        </span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{formatDateTime(ev.created_at, lang)}</span>
                        {sensor && (
                          <>
                            <span>·</span>
                            <span className="font-mono">
                              {sensor.unit_code} ({sensor.connection_status})
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-base font-extrabold text-slate-900">
                        {lang === 'ar' ? ev.event_type_ar : ev.event_type_en}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${sev.bg} ${sev.text} ${sev.border}`}>
                        {lang === 'ar' ? sev.ar : sev.en}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                      <div className="text-slate-500 font-bold mb-0.5">{t(lang, 'نوع المؤشر', 'Indicator Type')}</div>
                      <div className="font-mono font-bold text-slate-900">{ev.indicator_type}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                      <div className="text-slate-500 font-bold mb-0.5">{t(lang, 'مستوى الاشتباه', 'Suspicion Score')}</div>
                      <div className="font-mono font-extrabold text-[#E05252] tabular-nums">{ev.probabilistic_score}%</div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                      <div className="text-slate-500 font-bold mb-0.5">{t(lang, 'درجة الثقة', 'Confidence')}</div>
                      <div className="font-mono font-extrabold text-slate-900 tabular-nums">{ev.confidence_pct}%</div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                      <div className="text-slate-500 font-bold mb-0.5">{t(lang, 'الشبكة / المصنّع', 'SSID / OUI')}</div>
                      <div className="font-mono font-bold text-slate-800 truncate">
                        {String(ind.ssid_candidate || '—')} / {String(ind.oui_vendor || '—')}
                      </div>
                    </div>
                  </div>

                  {factors.length > 0 && (
                    <div className="text-xs text-slate-700 space-y-1 pt-1">
                      <div className="font-bold text-slate-800">{t(lang, 'العوامل المرجّحة للنتيجة:', 'Corroborating Factors:')}</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {factors.map((f) => (
                          <li key={f.factor_key}>
                            {lang === 'ar' ? f.label_ar : f.label_en} (+{f.points} pts)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Explicit Labeled Training Drill Tool (for authorized operators) */}
      {canRunDrill && facilitySensors.length > 0 && (
        <div className="border border-slate-200 rounded-2xl bg-white p-6">
          <div className="flex items-center gap-2.5 mb-2">
            <Activity className="w-5 h-5 text-[#E05252]" />
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              {t(lang, 'محاكاة تمرين كشف تدريبي (اختبار النظام والإنذار)', 'Training Drill Simulation (System & Alarm Verification)')}
            </h2>
          </div>
          <p className="text-xs font-medium text-slate-600 mb-4">
            {t(
              lang,
              'يُستخدم لاختبار معادلة الاحتمالات متعددة المؤشرات ونظام الإنذار الصوتي. يُحفظ الناتج بوسم "تمرين محاكاة تدريبي" ولا يُعرض أبداً كبيانات رصد حقيقية.',
              'Tests the multi-indicator probabilistic engine and emergency siren. Saved with explicit DRILL_SIMULATION labeling and never disguised as live RF capture.'
            )}
          </p>

          {statusMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          <form onSubmit={handleRunLabeledDrill} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'وحدة الاستشعار', 'Sensor Unit')}</label>
              <select
                value={selectedSensorId || facilitySensors[0]?.id}
                onChange={(e) => setSelectedSensorId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              >
                {facilitySensors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.unit_code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'نمط SSID المحتمل', 'Candidate SSID')}</label>
              <input
                value={drillSsid}
                onChange={(e) => setDrillSsid(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'بادئة MAC / OUI', 'MAC / OUI')}</label>
              <input
                value={drillMac}
                onChange={(e) => setDrillMac(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'قفزة RSSI (dBm+) / حزم', 'RSSI Δ / PPS')}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={drillRssiDelta}
                  onChange={(e) => setDrillRssiDelta(Number(e.target.value))}
                  className="w-1/2 px-2.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                />
                <input
                  type="number"
                  value={drillPps}
                  onChange={(e) => setDrillPps(Number(e.target.value))}
                  className="w-1/2 px-2.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={drillVideoPattern}
                  onChange={(e) => setDrillVideoPattern(e.target.checked)}
                  className="accent-[#E05252]"
                />
                <span>{t(lang, 'تتابع بث/تحكم', 'Video/Ctrl Cadence')}</span>
              </label>
              <button
                type="submit"
                disabled={running}
                className="w-full py-2.5 px-4 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{running ? t(lang, 'جاري التنفيذ...', 'Running...') : t(lang, 'تشغيل تمرين محاكاة', 'Run Training Drill')}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const AIIntelligenceView: React.FC<{
  lang: Language;
  facility: Facility;
  events: DetectionEvent[];
  assessments: AIAssessment[];
  onRefresh: () => Promise<void>;
}> = ({ lang, facility, events, assessments, onRefresh }) => {
  const facilityEvents = events.filter((e) => e.facility_id === facility.id);
  const [selectedEventId, setSelectedEventId] = useState<string>(facilityEvents[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facilityAssessments = assessments.filter((a) => a.facility_id === facility.id);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({
          facility_id: facility.id,
          event_id: selectedEventId || facilityEvents[0]?.id || null,
        }),
      });
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
          {t(lang, 'الذكاء الاصطناعي لتحليل المخاطر', 'AI Risk Intelligence')}
        </h1>
        <p className="text-sm font-medium text-slate-600 mt-1">
          {t(
            lang,
            'تحليل مقارن بين النشاط الحالي والأنماط الطبيعية للمؤسسة، لتقليل الإنذارات الكاذبة وتفسير أسباب التنبيه مع درجة الثقة.',
            'Comparative risk reasoning against historical facility baselines to prioritize threats, reduce false alarms, and explain alert triggers.'
          )}
        </p>
      </div>

      {/* Transparency Rule: Never claim trained custom RF model weights without data */}
      <div className="border border-slate-200 bg-[#F6F7F9] rounded-2xl p-5 flex items-start gap-3.5">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm font-semibold text-slate-800">
          {t(
            lang,
            'شفافية المنهجية: لا يدّعي النظام وجود نموذج تعلم آلي مدرب مسبقاً على بيانات طيف حقيقية غير متوفرة. يعتمد التقييم على مقارنة إحصائية للسجل المرجعي مع الاستدلال التحليلي المفسر، مع قابلية التطور مستقبلاً من السجلات الموثقة.',
            'Methodology Transparency: RASAD does not claim a custom pre-trained RF ML model without field training datasets. Risk analysis combines deterministic baseline statistics with explainable reasoning, designed to evolve as verified incident data accumulates.'
          )}
        </div>
      </div>

      {/* Analysis Runner */}
      <div className="border border-slate-200 rounded-2xl bg-white p-6 flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            {t(lang, 'اختر الحدث المراد تحليله ومقارنته بالسجل الطبيعي', 'Select Event for Baseline Comparison')}
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
          >
            <option value="">{t(lang, 'تقييم الحالة العامة للمؤسسة الحالية', 'Evaluate Overall Facility Baseline')}</option>
            {facilityEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {lang === 'ar' ? ev.event_type_ar : ev.event_type_en} ({ev.probabilistic_score}%)
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={handleAnalyze}
          className="px-6 py-2.5 rounded-xl bg-[#E05252] hover:bg-[#D14242] disabled:opacity-60 text-white font-bold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Brain className="w-4 h-4" />
          <span>{loading ? t(lang, 'جاري التحليل...', 'Analyzing...') : t(lang, 'تشغيل تحليل المخاطر', 'Run Risk Assessment')}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-900">
          {error}
        </div>
      )}

      {/* Results List */}
      <div className="space-y-4">
        {facilityAssessments.length === 0 ? (
          <div className="border border-slate-200 rounded-2xl bg-white p-10 text-center">
            <Brain className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <div className="text-base font-bold text-slate-800 mb-1">
              {t(lang, 'لم يتم تشغيل تحليل ذكاء اصطناعي لهذه المؤسسة بعد', 'No AI risk assessments generated yet')}
            </div>
            <p className="text-xs font-medium text-slate-500">
              {t(lang, 'اضغط على "تشغيل تحليل المخاطر" أعلاه لمقارنة النشاط الحالي بالأنماط المرجعية.', 'Click Run Risk Assessment above to compare current activity against historical baselines.')}
            </p>
          </div>
        ) : (
          facilityAssessments.map((asmt) => (
            <div key={asmt.id} className="border border-slate-200 rounded-2xl bg-white p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-[#E05252]" />
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {asmt.provider === 'EXPLAINABLE_AI_ENGINE' || asmt.provider === 'GEMINI_REASONING'
                        ? t(lang, 'تحليل استدلالي ذكي + مقارنة إحصائية', 'AI Reasoning + Statistical Baseline')
                        : t(lang, 'تقييم إحصائي مرجعي حتمي', 'Deterministic Baseline Evaluation')}
                    </div>
                    <div className="text-xs font-mono text-slate-500">{formatDateTime(asmt.created_at, lang)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                  <div>
                    {t(lang, 'احتمال التهديد:', 'Risk Prob:')}{' '}
                    <span className="font-mono text-base text-[#E05252] tabular-nums">{asmt.risk_probability}%</span>
                  </div>
                  <div>
                    {t(lang, 'درجة الثقة:', 'Confidence:')}{' '}
                    <span className="font-mono text-base text-slate-900 tabular-nums">{asmt.confidence_pct}%</span>
                  </div>
                  <div>
                    {t(lang, 'احتمال إنذار كاذب:', 'False Alarm:')}{' '}
                    <span className="font-mono text-slate-800">{asmt.false_alarm_likelihood}</span>
                  </div>
                </div>
              </div>

              <div className="text-sm font-medium text-slate-800 leading-relaxed">
                {lang === 'ar' ? asmt.reasoning_ar : asmt.reasoning_en}
              </div>

              <div className="bg-[#F6F7F9] border border-slate-200 rounded-xl p-4">
                <div className="text-xs font-extrabold text-slate-900 mb-2">
                  {t(lang, 'التوصيات والإجراءات المقترحة:', 'Recommended Actions:')}
                </div>
                <ul className="list-disc list-inside space-y-1 text-xs font-semibold text-slate-700">
                  {(lang === 'ar' ? asmt.recommended_actions_ar : asmt.recommended_actions_en).map((act, i) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
