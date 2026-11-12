import React, { useState } from 'react';
import { Building2, Plus, Edit3, MapPin, Radio, ShieldCheck, AlertTriangle, X } from 'lucide-react';
import type {
  DetectionEvent,
  Facility,
  FacilityType,
  Language,
  ManualReport,
  SafeUser,
  SensorUnit,
} from '../types';
import { FACILITY_TYPE_LABELS, SEVERITY_META, t } from '../i18n';
import { apiFetch } from '../utils/api';
import { FacilityMap } from '../components/FacilityMap';

interface FacilitiesViewProps {
  lang: Language;
  user: SafeUser;
  facilities: Facility[];
  sensors: SensorUnit[];
  events: DetectionEvent[];
  reports: ManualReport[];
  selectedFacilityId: string;
  onSelectFacility: (id: string) => void;
  onRefresh: () => Promise<void>;
}

export const FacilitiesView: React.FC<FacilitiesViewProps> = ({
  lang,
  user,
  facilities,
  sensors,
  events,
  reports,
  selectedFacilityId,
  onSelectFacility,
  onRefresh,
}) => {
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingFac, setEditingFac] = useState<Facility | null>(null);
  const [form, setForm] = useState({
    code: '',
    name_ar: '',
    name_en: '',
    type: 'SUBSTATION' as FacilityType,
    lat: '15.6050',
    lng: '32.5430',
    region_ar: '',
    region_en: '',
    coverage_radius_m: '800',
    notes_ar: '',
    notes_en: '',
  });
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const canCreate = user.role === 'ADMIN';
  const canEdit = user.role === 'ADMIN' || user.role === 'FACILITY_MANAGER';

  const openCreate = () => {
    setForm({
      code: '',
      name_ar: '',
      name_en: '',
      type: 'SUBSTATION',
      lat: '15.6050',
      lng: '32.5430',
      region_ar: '',
      region_en: '',
      coverage_radius_m: '800',
      notes_ar: '',
      notes_en: '',
    });
    setEditingFac(null);
    setErrMsg(null);
    setModalMode('create');
  };

  const openEdit = (fac: Facility) => {
    setForm({
      code: fac.code,
      name_ar: fac.name_ar,
      name_en: fac.name_en,
      type: fac.type,
      lat: String(fac.lat),
      lng: String(fac.lng),
      region_ar: fac.region_ar,
      region_en: fac.region_en,
      coverage_radius_m: String(fac.coverage_radius_m),
      notes_ar: fac.notes_ar,
      notes_en: fac.notes_en,
    });
    setEditingFac(fac);
    setErrMsg(null);
    setModalMode('edit');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrMsg(null);
    try {
      if (modalMode === 'create') {
        await apiFetch('/api/facilities', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            lat: Number(form.lat),
            lng: Number(form.lng),
            coverage_radius_m: Number(form.coverage_radius_m),
          }),
        });
      } else if (modalMode === 'edit' && editingFac) {
        await apiFetch(`/api/facilities/${editingFac.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...form,
            lat: Number(form.lat),
            lng: Number(form.lng),
            coverage_radius_m: Number(form.coverage_radius_m),
          }),
        });
      }
      setModalMode(null);
      await onRefresh();
    } catch (err) {
      setErrMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t(lang, 'إدارة المؤسسات الكهربائية', 'Electrical Facilities Management')}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {t(
              lang,
              'ملف مستقل لكل منشأة يتضمن الموقع الجغرافي ووحدات الاستشعار والتنبيهات وسجل الأحداث.',
              'Dedicated facility dossiers with coordinates, sensors, monitoring status, alerts, and reports.'
            )}
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white font-bold text-sm transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{t(lang, 'إضافة مؤسسة كهربائية', 'Add Electrical Facility')}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {facilities.map((fac) => {
          const fSensors = sensors.filter((s) => s.facility_id === fac.id);
          const fEvents = events.filter((e) => e.facility_id === fac.id);
          const fReports = reports.filter((r) => r.facility_id === fac.id);
          const sev = SEVERITY_META[fac.risk_level];
          const isSelected = fac.id === selectedFacilityId;

          return (
            <div
              key={fac.id}
              className={`border rounded-2xl p-6 bg-white transition-colors ${
                isSelected ? 'border-[#E05252] ring-2 ring-[#E05252]/15' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-xs font-mono font-bold text-slate-500 mb-1">
                    {fac.code} · {lang === 'ar' ? FACILITY_TYPE_LABELS[fac.type].ar : FACILITY_TYPE_LABELS[fac.type].en}
                  </div>
                  <h3 className="font-display text-xl font-extrabold text-slate-900">
                    {lang === 'ar' ? fac.name_ar : fac.name_en}
                  </h3>
                </div>
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${sev.bg} ${sev.text} ${sev.border}`}>
                  {lang === 'ar' ? sev.ar : sev.en}
                </span>
              </div>

              <p className="text-sm font-medium text-slate-600 mb-4">
                {lang === 'ar' ? fac.notes_ar : fac.notes_en}
              </p>

              <div className="grid grid-cols-3 gap-3 mb-5 text-center">
                <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                  <div className="font-mono text-xl font-extrabold text-slate-900 tabular-nums">
                    {fSensors.length}
                  </div>
                  <div className="text-xs font-bold text-slate-500">{t(lang, 'وحدات استشعار', 'Sensors')}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                  <div className="font-mono text-xl font-extrabold text-slate-900 tabular-nums">
                    {fEvents.length}
                  </div>
                  <div className="text-xs font-bold text-slate-500">{t(lang, 'الأحداث', 'Events')}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F6F7F9] border border-slate-200">
                  <div className="font-mono text-xl font-extrabold text-slate-900 tabular-nums">
                    {fReports.length}
                  </div>
                  <div className="text-xs font-bold text-slate-500">{t(lang, 'البلاغات', 'Reports')}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <div className="text-xs font-mono text-slate-500 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {fac.lat.toFixed(4)}, {fac.lng.toFixed(4)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEdit(fac)}
                      className="px-3.5 py-2 rounded-lg border border-slate-300 bg-[#F6F7F9] hover:bg-slate-200 text-xs font-bold text-slate-900 inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{t(lang, 'تعديل', 'Edit')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectFacility(fac.id)}
                    className="px-4 py-2 rounded-lg bg-[#E05252] hover:bg-[#D14242] text-white text-xs font-bold"
                  >
                    {isSelected
                      ? t(lang, 'المؤسسة النشطة', 'Active Facility')
                      : t(lang, 'تحديد كنشطة', 'Set Active')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-extrabold text-slate-900">
                {modalMode === 'create'
                  ? t(lang, 'إضافة مؤسسة كهربائية جديدة', 'Add Electrical Facility')
                  : t(lang, 'تعديل بيانات المؤسسة', 'Edit Facility Details')}
              </h3>
              <button type="button" onClick={() => setModalMode(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm font-bold text-red-800">
                {errMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'رمز المؤسسة', 'Facility Code')}</label>
                <input
                  required
                  disabled={modalMode === 'edit'}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="SUB-E09"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'النوع', 'Facility Type')}</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as FacilityType })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                >
                  <option value="GENERATION_PLANT">{lang === 'ar' ? 'محطة توليد كهرباء' : 'Generation Plant'}</option>
                  <option value="SUBSTATION">{lang === 'ar' ? 'محطة فرعية' : 'Substation'}</option>
                  <option value="TRANSMISSION_TOWERS">{lang === 'ar' ? 'أبراج نقل الكهرباء' : 'Transmission Towers'}</option>
                  <option value="CONTROL_INFRASTRUCTURE">{lang === 'ar' ? 'منشأة تحكم وبنية تحتية' : 'Control Infrastructure'}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'الاسم (عربي)', 'Name (Arabic)')}</label>
                <input
                  required
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'الاسم (إنجليزي)', 'Name (English)')}</label>
                <input
                  required
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'القطاع / المنطقة (عربي)', 'Region (Arabic)')}</label>
                <input
                  value={form.region_ar}
                  onChange={(e) => setForm({ ...form, region_ar: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'القطاع / المنطقة (إنجليزي)', 'Region (English)')}</label>
                <input
                  value={form.region_en}
                  onChange={(e) => setForm({ ...form, region_en: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'خط العرض Latitude', 'Latitude')}</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={form.lat}
                  onChange={(e) => setForm({ ...form, lat: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'خط الطول Longitude', 'Longitude')}</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={form.lng}
                  onChange={(e) => setForm({ ...form, lng: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'نطاق المحيط (متر)', 'Perimeter Radius (m)')}</label>
                <input
                  type="number"
                  min={100}
                  max={10000}
                  required
                  value={form.coverage_radius_m}
                  onChange={(e) => setForm({ ...form, coverage_radius_m: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t(lang, 'ملاحظات تشغيلية', 'Operational Notes')}</label>
                <textarea
                  rows={2}
                  value={form.notes_ar}
                  onChange={(e) => setForm({ ...form, notes_ar: e.target.value, notes_en: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-700"
                >
                  {t(lang, 'إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-sm font-bold"
                >
                  {saving ? t(lang, 'جاري الحفظ...', 'Saving...') : t(lang, 'حفظ البيانات', 'Save Facility')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const MonitoringMapView: React.FC<{
  lang: Language;
  facility: Facility;
  allFacilities: Facility[];
  sensors: SensorUnit[];
  events: DetectionEvent[];
  reports: ManualReport[];
  onSelectFacility: (id: string) => void;
}> = ({ lang, facility, allFacilities, sensors, events, reports, onSelectFacility }) => {
  const [showCoverage, setShowCoverage] = useState(true);
  const [showBlind, setShowBlind] = useState(true);
  const facilitySensors = sensors.filter((s) => s.facility_id === facility.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
            {t(lang, 'خريطة المراقبة التفاعلية — السودان', 'Interactive Monitoring Map — Sudan')}
          </h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {t(
              lang,
              'تنقل بين الخرطوم، الولاية الشمالية، كريمة، ومروي. اضغط على أي وحدة استشعار أو منشأة أو نطاق نشاط لعرض التفاصيل.',
              'Navigate across Khartoum, Northern State, Karima, and Merowe. Click any sensor, facility, or zone for details.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer bg-[#F6F7F9] px-3.5 py-2 rounded-xl border border-slate-200">
            <input
              type="checkbox"
              checked={showCoverage}
              onChange={(e) => setShowCoverage(e.target.checked)}
              className="accent-[#E05252]"
            />
            <span>{t(lang, 'نطاقات التغطية', 'Coverage Radii')}</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer bg-[#F6F7F9] px-3.5 py-2 rounded-xl border border-slate-200">
            <input
              type="checkbox"
              checked={showBlind}
              onChange={(e) => setShowBlind(e.target.checked)}
              className="accent-[#E05252]"
            />
            <span>{t(lang, 'المناطق غير المغطاة', 'Uncovered Zones')}</span>
          </label>
        </div>
      </div>

      <FacilityMap
        lang={lang}
        facility={facility}
        allFacilities={allFacilities}
        sensors={facilitySensors}
        allSensors={sensors}
        events={events}
        reports={reports}
        showCoverage={showCoverage}
        showBlindZones={showBlind}
        onSelectFacility={onSelectFacility}
        heightClass="h-[560px]"
      />
    </div>
  );
};

export const CoverageMapView: React.FC<{
  lang: Language;
  facility: Facility;
  allFacilities: Facility[];
  sensors: SensorUnit[];
  events: DetectionEvent[];
  reports: ManualReport[];
  onSelectFacility: (id: string) => void;
}> = ({ lang, facility, allFacilities, sensors, events, reports, onSelectFacility }) => {
  const facilitySensors = sensors.filter((s) => s.facility_id === facility.id);
  const connected = facilitySensors.filter((s) => s.connection_status === 'CONNECTED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">
          {t(lang, 'خريطة التغطية الأمنية والثغرات', 'Security Coverage & Blind-Zone Map')}
        </h1>
        <p className="text-sm font-medium text-slate-600 mt-1">
          {t(
            lang,
            'توضح هذه اللوحة المناطق التي تتوفر فيها تغطية استشعار فعالة مقابل المناطق غير المغطاة أو غير المؤكدة.',
            'Distinguishes verified active WiFi monitoring coverage from blind spots and disconnected sectors.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'نطاق تغطية المؤسسة المطلوب', 'Target Facility Perimeter')}</div>
          <div className="font-mono text-2xl font-extrabold text-slate-900 tabular-nums">{facility.coverage_radius_m} m</div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'وحدات استشعار تغطي المحيط الآن', 'Sensors Currently Covering')}</div>
          <div className="font-mono text-2xl font-extrabold text-emerald-700 tabular-nums">
            {connected.length} / {facilitySensors.length}
          </div>
        </div>
        <div className="border border-slate-200 rounded-2xl p-5 bg-white">
          <div className="text-xs font-bold text-slate-500 mb-1">{t(lang, 'نسبة الموثوقية المكانية الحالية', 'Active Coverage Confidence')}</div>
          <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            {connected.length === 0 ? (
              <>
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>{t(lang, '0% (الوحدات غير متصلة)', '0% (Sensors Offline)')}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>{Math.round((connected.length / Math.max(1, facilitySensors.length)) * 100)}%</span>
              </>
            )}
          </div>
        </div>
      </div>

      <FacilityMap
        lang={lang}
        facility={facility}
        allFacilities={allFacilities}
        sensors={facilitySensors}
        allSensors={sensors}
        events={events}
        reports={reports}
        showCoverage={true}
        showBlindZones={true}
        onSelectFacility={onSelectFacility}
        heightClass="h-[460px]"
      />

      <div className="border border-slate-200 rounded-2xl bg-white divide-y divide-slate-200">
        <div className="px-5 py-4 bg-[#F6F7F9] font-display text-base font-extrabold text-slate-900">
          {t(lang, 'تفاصيل تغطية كل وحدة استشعار', 'Per-Sensor Coverage Breakdown')}
        </div>
        {facilitySensors.map((s) => (
          <div key={s.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-3">
              <Radio className={`w-5 h-5 ${s.connection_status === 'CONNECTED' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <div>
                <div className="font-extrabold text-slate-900">
                  {s.unit_code} — {lang === 'ar' ? s.name_ar : s.name_en}
                </div>
                <div className="text-xs font-mono text-slate-500">
                  {s.lat.toFixed(5)}, {s.lng.toFixed(5)} · Radius {s.coverage_radius_m}m
                </div>
              </div>
            </div>
            <div className="text-xs font-bold">
              {s.connection_status === 'CONNECTED' ? (
                <span className="text-emerald-700">{t(lang, 'تغطية سلبية نشطة', 'Active Coverage')}</span>
              ) : (
                <span className="text-amber-700">{t(lang, 'منطقة غير مراقبة (الوحدة غير متصلة)', 'Uncovered (Unit Disconnected)')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
