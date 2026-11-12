import React, { useState } from 'react';
import {
  ShieldCheck,
  Radio,
  Wifi,
  WifiOff,
  BatteryCharging,
  Plus,
  CheckSquare,
  ArrowUpRight,
  AlertTriangle,
  X,
} from 'lucide-react';
import type {
  DetectionEvent,
  Facility,
  Language,
  ResponseTask,
  SafeUser,
  SensorUnit,
} from '../types';
import { SEVERITY_META, formatDateTime, t } from '../i18n';
import { apiFetch } from '../utils/api';

export const EmergencyResponseView: React.FC<{
  lang: Language;
  user: SafeUser;
  facilities: Facility[];
  events: DetectionEvent[];
  tasks: ResponseTask[];
  onRefresh: () => Promise<void>;
}> = ({ lang, user, facilities, events, tasks, onRefresh }) => {
  const openEvents = events.filter((e) => e.status !== 'CLOSED');
  const [selectedEventId, setSelectedEventId] = useState(openEvents[0]?.id || '');
  const [assignee, setAssignee] = useState(user.full_name_ar);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const canManage =
    user.role === 'ADMIN' ||
    user.role === 'FACILITY_MANAGER' ||
    user.role === 'MONITORING_OFFICER' ||
    user.role === 'RESPONSE_OFFICER';

  const canUpdateTask =
    user.role === 'ADMIN' || user.role === 'FACILITY_MANAGER' || user.role === 'RESPONSE_OFFICER';

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEv = events.find((ev) => ev.id === (selectedEventId || openEvents[0]?.id));
    if (!targetEv) return;
    setCreating(true);
    try {
      await apiFetch('/api/responses', {
        method: 'POST',
        body: JSON.stringify({
          event_id: targetEv.id,
          facility_id: targetEv.facility_id,
          assigned_to_name: assignee,
          priority: targetEv.severity,
        }),
      });
      await onRefresh();
    } finally {
      setCreating(false);
    }
  };

  const updateTask = async (taskId: string, body: Record<string, unknown>) => {
    await apiFetch(`/api/responses/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
          {t(lang, 'إدارة الاستجابة للطوارئ والسلامة الكهربائية', 'Emergency Response & Safety SOPs')}
        </h1>
        <p className="text-sm font-medium text-slate-600 mt-1">
          {t(
            lang,
            'إنشاء مهام الاستجابة وتكليف المسؤولين ومتابعة قائمة تعليمات السلامة الكهربائية وتسجيل أوقات البدء والإغلاق.',
            'Dispatch response tasks, enforce electrical safety checklists, record actions, and track start-to-closure timestamps.'
          )}
        </p>
      </div>

      {/* Institutional Safety Guidance Banner */}
      <div className="border border-slate-200 rounded-2xl bg-[#F6F7F9] p-5">
        <div className="font-display text-base font-extrabold text-slate-900 mb-2 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#E05252]" />
          <span>{t(lang, 'تعليمات السلامة المعتمدة في منشآت الكهرباء:', 'Mandatory Electrical Facility Safety SOP:')}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-semibold text-slate-700">
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            {t(
              lang,
              '1. الحفاظ على مسافة الخلوص الآمنة من خطوط وموصلات الجهد العالي أثناء المعاينة البصرية.',
              '1. Maintain strict HV clearance distances during visual perimeter inspection.'
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            {t(
              lang,
              '2. عدم استخدام أي تشويش لاسلكي أو محاولة إسقاط مادي؛ الرصد والإبلاغ السلمي فقط.',
              '2. Never deploy RF jamming or physical interception; follow authorized escalation protocols.'
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            {t(
              lang,
              '3. التنسيق الفوري مع مركز التحكم بالشبكة SCADA عند الاشتباه بالاقتراب من المحولات الحرجة.',
              '3. Coordinate with Grid Dispatch / SCADA immediately if critical transformers are approached.'
            )}
          </div>
        </div>
      </div>

      {/* Create Response Task */}
      {canManage && openEvents.length > 0 && (
        <form onSubmit={handleCreateTask} className="border border-slate-200 rounded-2xl bg-white p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t(lang, 'الحدث المرتبط', 'Linked Incident')}
            </label>
            <select
              value={selectedEventId || openEvents[0]?.id}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            >
              {openEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {lang === 'ar' ? ev.event_type_ar : ev.event_type_en} ({ev.severity})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t(lang, 'المسؤول المكلف بالاستجابة', 'Assigned Response Officer')}
            </label>
            <input
              required
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="py-2.5 px-5 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white font-bold text-sm inline-flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{creating ? t(lang, 'جاري الإنشاء...', 'Dispatching...') : t(lang, 'إنشاء مهمة استجابة', 'Create Response Task')}</span>
          </button>
        </form>
      )}

      {/* Active & Past Tasks */}
      {tasks.length === 0 ? (
        <div className="border border-slate-200 rounded-2xl bg-white p-10 text-center text-sm font-semibold text-slate-500">
          {t(lang, 'لا توجد مهام استجابة مسجلة حالياً.', 'No emergency response tasks created yet.')}
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => {
            const fac = facilities.find((f) => f.id === task.facility_id);
            const sev = SEVERITY_META[task.priority];
            return (
              <div key={task.id} className="border border-slate-200 rounded-2xl bg-white p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="text-xs font-bold text-slate-500 mb-1 flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded border ${sev.bg} ${sev.text} ${sev.border}`}>
                        {lang === 'ar' ? sev.ar : sev.en}
                      </span>
                      <span>{fac ? (lang === 'ar' ? fac.name_ar : fac.name_en) : task.facility_id}</span>
                      <span>·</span>
                      <span className="font-mono">{task.status}</span>
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      {t(lang, 'المكلّف:', 'Assigned:')} {task.assigned_to_name}
                    </div>
                    <div className="text-xs font-mono text-slate-500 mt-0.5">
                      {t(lang, 'البدء:', 'Start:')} {formatDateTime(task.started_at, lang)} · {t(lang, 'الإغلاق:', 'Closed:')} {formatDateTime(task.completed_at, lang)}
                    </div>
                  </div>

                  {canUpdateTask && task.status !== 'CLOSED' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateTask(task.id, { status: 'ON_SITE', action_note: t(lang, 'وصل الفريق للموقع للمعاينة الآمنة', 'Team arrived on site') })}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-[#F6F7F9] text-xs font-bold"
                      >
                        {t(lang, 'في الموقع', 'On Site')}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTask(task.id, { status: 'ESCALATED', escalated_to: 'Grid Security Director', action_note: t(lang, 'تم تصعيد البلاغ لمدير أمن الشبكة', 'Escalated to Grid Security Director') })}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>{t(lang, 'تصعيد', 'Escalate')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTask(task.id, { status: 'CLOSED', action_note: t(lang, 'اكتملت المعالجة وتم إغلاق البلاغ', 'Mitigation completed and incident closed') })}
                        className="px-3.5 py-1.5 rounded-lg bg-[#E05252] text-white text-xs font-bold"
                      >
                        {t(lang, 'إغلاق البلاغ', 'Close Incident')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Safety Checklist */}
                <div>
                  <div className="text-xs font-extrabold text-slate-800 mb-2 flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-[#E05252]" />
                    <span>{t(lang, 'قائمة التحقق من إجراءات السلامة:', 'Safety Compliance Checklist:')}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {task.safety_checklist.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F6F7F9] border border-slate-200 text-xs font-semibold text-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          disabled={!canUpdateTask || task.status === 'CLOSED'}
                          checked={item.checked}
                          onChange={() => {
                            const updatedList = task.safety_checklist.map((c) =>
                              c.id === item.id ? { ...c, checked: !c.checked } : c
                            );
                            updateTask(task.id, { safety_checklist: updatedList });
                          }}
                          className="accent-[#E05252] mt-0.5"
                        />
                        <span>{lang === 'ar' ? item.label_ar : item.label_en}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Action Log & Note Input */}
                <div className="space-y-2">
                  <div className="text-xs font-extrabold text-slate-800">{t(lang, 'سجل الإجراءات المتخذة:', 'Recorded Actions Log:')}</div>
                  <div className="space-y-1 text-xs text-slate-600">
                    {task.actions_log.map((l, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="font-mono text-slate-400">{formatDateTime(l.timestamp, lang)}</span>
                        <span className="font-bold text-slate-800">{l.actor}:</span>
                        <span>{l.note}</span>
                      </div>
                    ))}
                  </div>

                  {canUpdateTask && task.status !== 'CLOSED' && (
                    <div className="flex gap-2 pt-2">
                      <input
                        value={noteInputs[task.id] || ''}
                        onChange={(e) => setNoteInputs({ ...noteInputs, [task.id]: e.target.value })}
                        placeholder={t(lang, 'أضف إجراءً أو ملاحظة ميدانية...', 'Log response action or note...')}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const txt = (noteInputs[task.id] || '').trim();
                          if (!txt) return;
                          updateTask(task.id, { action_note: txt });
                          setNoteInputs({ ...noteInputs, [task.id]: '' });
                        }}
                        className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                      >
                        {t(lang, 'تسجيل', 'Log')}
                      </button>
                    </div>
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

export const SensorsView: React.FC<{
  lang: Language;
  user: SafeUser;
  facilities: Facility[];
  sensors: SensorUnit[];
  onRefresh: () => Promise<void>;
}> = ({ lang, user, facilities, sensors, onRefresh }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [form, setForm] = useState({
    facility_id: facilities[0]?.id || '',
    unit_code: '',
    name_ar: '',
    name_en: '',
    interface_name: 'wlan1mon',
    lat: String(facilities[0]?.lat || 18.6708),
    lng: String(facilities[0]?.lng || 32.0511),
    coverage_radius_m: '450',
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = user.role === 'ADMIN' || user.role === 'FACILITY_MANAGER';
  const canTestLink = canManage || user.role === 'MONITORING_OFFICER';

  const handleAddSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ provisioning_token: string }>('/api/sensors', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        lat: Number(form.lat),
        lng: Number(form.lng),
        coverage_radius_m: Number(form.coverage_radius_m),
      }),
    });
    setNewToken(res.provisioning_token);
    setShowAdd(false);
    await onRefresh();
  };

  const handleSensorAction = async (id: string, action: 'CONNECT_TEST' | 'DISCONNECT_TEST') => {
    setBusyId(id);
    try {
      await apiFetch(`/api/sensors/${id}/drill`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t(lang, 'مراقبة وحدات الاستشعار (Raspberry Pi / WiFi Monitor Mode)', 'Sensor Units Monitoring')}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {t(
              lang,
              'متابعة حالة الاتصال، واجهة WiFi، خدمة الرصد، حالة الطاقة، وسجل الأعطال. عند انقطاع وحدة الاستشعار يتوقف ادعاء المراقبة الحية للمنطقة فوراً.',
              'Track connection state, wlan1mon interface, Scapy service, power telemetry, and fault logs. Offline units immediately disable live monitoring status.'
            )}
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>{t(lang, 'تسجيل وحدة استشعار', 'Register Sensor Unit')}</span>
          </button>
        )}
      </div>

      {newToken && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-950 space-y-1">
          <div className="font-extrabold">
            {t(lang, 'تم تسجيل وحدة الاستشعار. احفظ رمز التوثيق التشغيلي للوحدة (يُعرض مرة واحدة):', 'Sensor registered. Store the unit provisioning token (shown once):')}
          </div>
          <div className="font-mono text-xs bg-white px-3 py-2 rounded-lg border border-emerald-200 select-all">
            {newToken}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {sensors.map((s) => {
          const fac = facilities.find((f) => f.id === s.facility_id);
          const isConn = s.connection_status === 'CONNECTED';
          return (
            <div key={s.id} className="border border-slate-200 rounded-2xl bg-white p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isConn ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {isConn ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-500">{s.unit_code}</div>
                    <h3 className="font-display text-lg font-extrabold text-slate-900">
                      {lang === 'ar' ? s.name_ar : s.name_en}
                    </h3>
                    <div className="text-xs font-semibold text-slate-600">
                      {fac ? (lang === 'ar' ? fac.name_ar : fac.name_en) : s.facility_id}
                    </div>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                    isConn
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  {isConn ? t(lang, 'متصلة', 'Connected') : t(lang, 'غير متصلة', 'Disconnected')}
                </span>
              </div>

              {!isConn && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                  <span>
                    {t(
                      lang,
                      'تنبيه: وحدة الاستشعار متوقفة أو منقطعة — هذه المنطقة ليست تحت المراقبة الحية حالياً.',
                      'Alert: Sensor unit is offline — this sector is NOT under live monitoring.'
                    )}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                  <div className="text-slate-500 font-bold mb-0.5">{t(lang, 'واجهة WiFi', 'WiFi Interface')}</div>
                  <div className="font-mono font-bold text-slate-900">
                    {s.interface_name} · {s.wifi_interface_status}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                  <div className="text-slate-500 font-bold mb-0.5">{t(lang, 'حالة الخدمة', 'Service')}</div>
                  <div className="font-mono font-bold text-slate-900">{s.service_status}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                  <div className="text-slate-500 font-bold mb-0.5">{t(lang, 'الطاقة', 'Power')}</div>
                  <div className="font-mono font-bold text-slate-900 flex items-center gap-1">
                    <BatteryCharging className="w-3.5 h-3.5 text-slate-500" />
                    <span>{s.power_pct !== null ? `${s.power_pct}%` : s.power_status}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                  <div className="text-slate-500 font-bold mb-0.5">{t(lang, 'آخر نبضة', 'Last Seen')}</div>
                  <div className="font-mono font-bold text-slate-900 truncate">
                    {s.last_seen_at ? formatDateTime(s.last_seen_at, lang) : t(lang, 'لم يتصل', 'Never')}
                  </div>
                </div>
              </div>

              <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                <span className="font-mono">
                  {s.hardware_spec} · {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                </span>

                {canTestLink && (
                  <div className="flex items-center gap-2">
                    {!isConn ? (
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => handleSensorAction(s.id, 'CONNECT_TEST')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                      >
                        {t(lang, 'اختبار تفعيل الاتصال', 'Test Link Connect')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => handleSensorAction(s.id, 'DISCONNECT_TEST')}
                        className="px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 font-bold text-xs"
                      >
                        {t(lang, 'اختبار انقطاع الاتصال', 'Simulate Link Drop')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {s.fault_log.length > 0 && (
                <div className="text-xs bg-[#F6F7F9] border border-slate-200 rounded-xl p-3 space-y-1">
                  <div className="font-extrabold text-slate-800">{t(lang, 'سجل الأعطال والتشخيص:', 'Fault & Diagnostic Log:')}</div>
                  {s.fault_log.slice(0, 3).map((f, idx) => (
                    <div key={idx} className="text-slate-600">
                      <span className="font-mono text-slate-400">{formatDateTime(f.timestamp, lang)}</span> —{' '}
                      {lang === 'ar' ? f.message_ar : f.message_en}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Sensor Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-extrabold text-slate-900">
                {t(lang, 'تسجيل وحدة استشعار جديدة', 'Register New Sensor Unit')}
              </h3>
              <button type="button" onClick={() => setShowAdd(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddSensor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'المؤسسة المرتبطة', 'Facility')}</label>
                <select
                  value={form.facility_id}
                  onChange={(e) => {
                    const fac = facilities.find((f) => f.id === e.target.value);
                    setForm({
                      ...form,
                      facility_id: e.target.value,
                      lat: fac ? String(fac.lat) : form.lat,
                      lng: fac ? String(fac.lng) : form.lng,
                    });
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {lang === 'ar' ? f.name_ar : f.name_en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'رمز الوحدة', 'Unit Code')}</label>
                  <input
                    required
                    placeholder="RASAD-PI-06"
                    value={form.unit_code}
                    onChange={(e) => setForm({ ...form, unit_code: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'واجهة WiFi', 'Interface')}</label>
                  <input
                    required
                    value={form.interface_name}
                    onChange={(e) => setForm({ ...form, interface_name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'اسم الوحدة (عربي)', 'Unit Name (Arabic)')}</label>
                <input
                  required
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value, name_en: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'خط العرض', 'Latitude')}</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'خط الطول', 'Longitude')}</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t(lang, 'التغطية (م)', 'Radius (m)')}</label>
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    required
                    value={form.coverage_radius_m}
                    onChange={(e) => setForm({ ...form, coverage_radius_m: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold">
                  {t(lang, 'إلغاء', 'Cancel')}
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-[#E05252] text-white text-xs font-bold">
                  {t(lang, 'حفظ وتوليد رمز الربط', 'Register & Generate Token')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
