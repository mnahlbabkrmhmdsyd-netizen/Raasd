import type { FacilityType, Language, NavSection, SeverityLevel, UserRole } from './types';

export const ROLE_LABELS: Record<UserRole, { ar: string; en: string }> = {
  ADMIN: { ar: 'المسؤول الرئيسي', en: 'System Administrator' },
  FACILITY_MANAGER: { ar: 'مسؤول المؤسسة', en: 'Facility Manager' },
  MONITORING_OFFICER: { ar: 'مسؤول المراقبة', en: 'Monitoring Officer' },
  RESPONSE_OFFICER: { ar: 'مسؤول الاستجابة', en: 'Response Officer' },
  VIEWER: { ar: 'مستخدم مشاهدة', en: 'Read-Only Viewer' },
};

export const SEVERITY_META: Record<
  SeverityLevel,
  { ar: string; en: string; bg: string; text: string; border: string; hex: string }
> = {
  NORMAL: {
    ar: 'طبيعي',
    en: 'Normal',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    hex: '#16A34A',
  },
  WARNING: {
    ar: 'تحذير',
    en: 'Warning',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    hex: '#D97706',
  },
  HIGH: {
    ar: 'خطورة مرتفعة',
    en: 'High Risk',
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
    hex: '#EA580C',
  },
  EMERGENCY: {
    ar: 'طوارئ',
    en: 'Emergency',
    bg: 'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-300',
    hex: '#DC2626',
  },
};

export const FACILITY_TYPE_LABELS: Record<FacilityType, { ar: string; en: string }> = {
  GENERATION_PLANT: { ar: 'محطة توليد كهرباء', en: 'Power Generation Plant' },
  SUBSTATION: { ar: 'محطة فرعية / تحويل', en: 'Electrical Substation' },
  TRANSMISSION_TOWERS: { ar: 'أبراج نقل الكهرباء', en: 'Transmission Towers' },
  CONTROL_INFRASTRUCTURE: { ar: 'منشأة بنية تحتية وتحكم', en: 'Grid Control Infrastructure' },
};

export const NAV_ITEMS: { id: NavSection; ar: string; en: string; adminOnly?: boolean }[] = [
  { id: 'overview', ar: 'الرئيسية', en: 'Overview' },
  { id: 'command', ar: 'مركز القيادة الموحد', en: 'Unified Command' },
  { id: 'map', ar: 'خريطة المراقبة', en: 'Monitoring Map' },
  { id: 'facilities', ar: 'المؤسسات الكهربائية', en: 'Electrical Facilities' },
  { id: 'detection', ar: 'كشف المسيرات', en: 'Drone Detection' },
  { id: 'alerts', ar: 'التنبيهات', en: 'Alerts' },
  { id: 'reports', ar: 'البلاغات', en: 'Sighting Reports' },
  { id: 'events', ar: 'سجل الأحداث', en: 'Event & Evidence Log' },
  { id: 'coverage', ar: 'خريطة التغطية الأمنية', en: 'Security Coverage' },
  { id: 'ai', ar: 'الذكاء الاصطناعي', en: 'AI Risk Intelligence' },
  { id: 'response', ar: 'الاستجابة للطوارئ', en: 'Emergency Response' },
  { id: 'sensors', ar: 'وحدات الاستشعار', en: 'Sensor Units' },
  { id: 'analytics', ar: 'التقارير والإحصائيات', en: 'Reports & Analytics' },
  { id: 'users', ar: 'المستخدمون والصلاحيات', en: 'Users & Permissions', adminOnly: true },
  { id: 'settings', ar: 'الإعدادات', en: 'Settings' },
];

export function t(lang: Language, ar: string, en: string): string {
  return lang === 'ar' ? ar : en;
}

export function formatDateTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return lang === 'ar' ? 'غير متوفر' : 'Unavailable';
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
