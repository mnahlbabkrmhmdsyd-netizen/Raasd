import React, { useEffect, useState } from 'react';
import {
  Fingerprint,
  Lock,
  User,
  Globe,
  Eye,
  EyeOff,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import type { Language, SafeUser } from '../types';
import { apiFetch, setStoredToken } from '../utils/api';
import {
  PinRequiredError,
  enrollBiometricForUser,
  isInsideIframe,
  loginWithBiometric,
} from '../utils/biometric';
import { unlockAlarmAudio } from '../utils/alarmAudio';
import { t } from '../i18n';
import { RasadLogo } from './RasadLogo';

interface LoginScreenProps {
  lang: Language;
  onToggleLang: () => void;
  onAuthenticated: (user: SafeUser, notice?: string) => void;
  lockedReason?: string | null;
}

interface BiometricStatusRes {
  exists: boolean;
  active?: boolean;
  biometric_enabled: boolean;
  biometric_type?: string | null;
  biometric_device_label?: string | null;
  biometric_enrolled_at?: string | null;
}

const AUTHORIZED_OPERATOR_PROFILES = [
  { username: 'admin', pass: 'RasadAdmin#2026', roleAr: 'المسؤول الرئيسي للنظام', roleEn: 'System Administrator' },
  { username: 'fmanager', pass: 'RasadMgr#2026', roleAr: 'مسؤول قطاع مروي وكريمة', roleEn: 'Merowe & Karima Manager' },
  { username: 'monitor', pass: 'RasadMon#2026', roleAr: 'مسؤول المراقبة والرصد', roleEn: 'Monitoring Officer' },
  { username: 'responder', pass: 'RasadResp#2026', roleAr: 'مسؤول الاستجابة للطوارئ', roleEn: 'Response Officer' },
  { username: 'viewer', pass: 'RasadView#2026', roleAr: 'مستخدم مشاهدة (قراءة فقط)', roleEn: 'Read-Only Viewer' },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({
  lang,
  onToggleLang,
  onAuthenticated,
  lockedReason,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [enrollAfterLogin, setEnrollAfterLogin] = useState(false);
  const [bioStatus, setBioStatus] = useState<BiometricStatusRes | null>(null);
  const [pinPrompt, setPinPrompt] = useState<{
    mode: 'VERIFY' | 'ENROLL';
    pendingUser?: SafeUser;
    pendingToken?: string;
    message: string;
  } | null>(null);
  const [securityPin, setSecurityPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const inIframe = isInsideIframe();

  useEffect(() => {
    const clean = username.trim();
    if (!clean) {
      setBioStatus(null);
      return;
    }
    const timer = window.setTimeout(() => {
      apiFetch<BiometricStatusRes>(`/api/auth/webauthn/status?username=${encodeURIComponent(clean)}`)
        .then((res) => setBioStatus(res))
        .catch(() => setBioStatus(null));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [username]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockAlarmAudio();
    setError(null);
    setInfo(null);
    setPinPrompt(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: SafeUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setStoredToken(data.token);

      if (enrollAfterLogin) {
        try {
          const enrolled = await enrollBiometricForUser({
            username: data.user.username,
            lang,
            tokenOverride: data.token,
          });
          onAuthenticated(enrolled.user, enrolled.message);
          return;
        } catch (bioErr) {
          if (bioErr instanceof PinRequiredError && bioErr.reason === 'ENROLL') {
            setPinPrompt({
              mode: 'ENROLL',
              pendingUser: data.user,
              pendingToken: data.token,
              message: bioErr.message,
            });
            return;
          }
          onAuthenticated(
            data.user,
            t(
              lang,
              `تم تسجيل الدخول. يمكنك إكمال تسجيل البصمة من إعدادات المستخدم (${(bioErr as Error).message}).`,
              `Signed in. You can finish biometric setup in User Settings.`
            )
          );
          return;
        }
      }

      onAuthenticated(data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    unlockAlarmAudio();
    setError(null);
    setInfo(null);
    if (!username.trim()) {
      setError(
        t(
          lang,
          'أدخل اسم المستخدم المعتمد أولاً للتحقق من بصمته المسجلة وصلاحياته.',
          'Enter your authorized username first to verify its enrolled biometric credential and role.'
        )
      );
      return;
    }

    setLoading(true);
    try {
      const verified = await loginWithBiometric({
        username: username.trim(),
        lang,
      });
      onAuthenticated(
        verified.user,
        t(
          lang,
          'تم التحقق الموثوق بالبصمة البيومترية وتسجيل الدخول بنجاح.',
          'Verified biometric authentication succeeded.'
        )
      );
    } catch (err) {
      if (err instanceof PinRequiredError && err.reason === 'VERIFY') {
        setPinPrompt({
          mode: 'VERIFY',
          message: err.message,
        });
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinPrompt) return;
    setError(null);
    setLoading(true);
    try {
      if (pinPrompt.mode === 'VERIFY') {
        const verified = await loginWithBiometric({
          username: username.trim(),
          lang,
          securityPin,
        });
        setSecurityPin('');
        setPinPrompt(null);
        onAuthenticated(
          verified.user,
          t(
            lang,
            'تم التحقق المشفر عبر المفتاح والرمز الأمني وتسجيل الدخول بنجاح.',
            'Cryptographic device key + Security PIN verified successfully.'
          )
        );
      } else if (pinPrompt.mode === 'ENROLL' && pinPrompt.pendingUser) {
        const enrolled = await enrollBiometricForUser({
          username: pinPrompt.pendingUser.username,
          lang,
          securityPin,
          tokenOverride: pinPrompt.pendingToken,
        });
        setSecurityPin('');
        setPinPrompt(null);
        onAuthenticated(enrolled.user, enrolled.message);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-white text-slate-900 flex flex-col lg:flex-row"
    >
      {/* Form Column */}
      <div className="flex-1 flex flex-col justify-between px-5 py-6 sm:px-10 lg:px-14 max-w-2xl mx-auto w-full">
        {/* Top Utility Strip */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 bg-[#F6F7F9] border border-slate-200 px-3 py-1.5 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-[#E05252]" />
            <span>{t(lang, 'شبكة كهرباء السودان — بوابة محمية', 'Sudan Power Grid — Protected Portal')}</span>
          </div>

          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-[#F6F7F9] hover:bg-slate-200/70 text-sm font-bold text-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Globe className="w-4 h-4 text-slate-600" />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>

        {/* Centered Auth Form Container with Official RASAD Logo at Top */}
        <div className="my-auto py-6 sm:py-8">
          <div className="flex flex-col items-center text-center mb-7">
            <RasadLogo
              lang={lang}
              size="xl"
              layout="centered"
              subtitle={t(lang, 'منصة حماية البنية التحتية الكهربائية', 'Critical Power Infrastructure Protection')}
            />
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 mt-5 mb-2 leading-tight">
              {t(lang, 'بوابة الدخول المعتمد', 'Authorized Operator Sign-In')}
            </h1>
            <p className="text-sm sm:text-base font-medium text-slate-600 max-w-md">
              {t(
                lang,
                'الدخول مقصور على الحسابات المعتمدة من المسؤول الرئيسي وفق صلاحيات كل مؤسسة كهربائية.',
                'Access is restricted to accounts provisioned by the System Administrator under facility-scoped permissions.'
              )}
            </p>
          </div>

          {lockedReason && (
            <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900">
              <Lock className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" />
              <div className="text-sm font-semibold">{lockedReason}</div>
            </div>
          )}

          {error && (
            <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-900">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#E05252]" />
              <div className="text-sm font-semibold">{error}</div>
            </div>
          )}

          {info && (
            <div className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-900">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-700" />
              <div className="text-sm font-semibold">{info}</div>
            </div>
          )}

          {/* Security PIN Challenge Box when verifying or enrolling PIN-protected ECDSA credential */}
          {pinPrompt ? (
            <form onSubmit={handlePinSubmit} className="mb-6 p-5 rounded-2xl bg-[#F6F7F9] border-2 border-[#E05252]/40 space-y-4">
              <div className="flex items-start gap-3">
                <KeyRound className="w-5 h-5 text-[#E05252] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-extrabold text-slate-900">
                    {pinPrompt.mode === 'ENROLL'
                      ? t(lang, 'حفظ مفتاح التحقق الأمني في حسابك', 'Save Verified Device Key to Account')
                      : t(lang, 'التحقق الموثوق بالرمز الأمني والبصمة', 'Verified Key & Security PIN Check')}
                  </div>
                  <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                    {pinPrompt.message}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  {t(lang, 'الرمز الأمني (4 إلى 8 أرقام)', 'Security PIN (4–8 digits)')}
                </label>
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#E05252]/30"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 px-5 rounded-xl bg-[#E05252] hover:bg-[#D14242] text-white text-sm font-bold"
                >
                  {loading
                    ? t(lang, 'جاري التحقق التشفيري...', 'Verifying...')
                    : pinPrompt.mode === 'ENROLL'
                    ? t(lang, 'حفظ البصمة التشفيرية والدخول', 'Save Credential & Enter')
                    : t(lang, 'تأكيد التحقق والدخول', 'Verify & Sign In')}
                </button>
                {pinPrompt.mode === 'ENROLL' && pinPrompt.pendingUser && (
                  <button
                    type="button"
                    onClick={() => onAuthenticated(pinPrompt.pendingUser!)}
                    className="py-3 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold"
                  >
                    {t(lang, 'تخطي الآن', 'Skip for now')}
                  </button>
                )}
                {pinPrompt.mode === 'VERIFY' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPinPrompt(null);
                      setSecurityPin('');
                    }}
                    className="py-3 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold"
                  >
                    {t(lang, 'إلغاء', 'Cancel')}
                  </button>
                )}
              </div>

              {inIframe && typeof window !== 'undefined' && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E05252] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>
                    {t(
                      lang,
                      'افتح التطبيق في نافذة مستقلة لاستخدام بصمة الإصبع الحقيقية للجهاز (TouchID / Android)',
                      'Open in standalone tab to use native hardware fingerprint sensor (TouchID / Android)'
                    )}
                  </span>
                </a>
              )}
            </form>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-bold text-slate-800">
                    {t(lang, 'اسم المستخدم', 'Username')}
                  </label>
                  {bioStatus?.exists && (
                    <span
                      className={`text-xs font-bold inline-flex items-center gap-1 ${
                        bioStatus.biometric_enabled ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                      {bioStatus.biometric_enabled
                        ? bioStatus.biometric_type === 'WEBAUTHN'
                          ? t(lang, 'بصمة جهاز بيومترية مسجلة', 'Hardware Biometric Enrolled')
                          : t(lang, 'مفتاح تحقق مشفر مسجل', 'Verified Passkey Enrolled')
                        : t(lang, 'البصمة غير مسجلة بعد', 'Biometric Not Enrolled')}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <User className="w-5 h-5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
                  <input
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t(lang, 'أدخل اسم المستخدم المعتمد', 'Enter authorized username')}
                    className="w-full ps-11 pe-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#E05252]/30 focus:border-[#E05252]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-1.5">
                  {t(lang, 'كلمة المرور', 'Password')}
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full ps-11 pe-12 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#E05252]/30 focus:border-[#E05252]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute top-1/2 -translate-y-1/2 end-3 p-1.5 text-slate-500 hover:text-slate-800"
                    aria-label={t(lang, 'إظهار أو إخفاء كلمة المرور', 'Toggle password visibility')}
                  >
                    {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F6F7F9] border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enrollAfterLogin}
                  onChange={(e) => setEnrollAfterLogin(e.target.checked)}
                  className="accent-[#E05252] w-4 h-4 shrink-0"
                />
                <Fingerprint className="w-4 h-4 text-[#E05252] shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {bioStatus?.biometric_enabled
                    ? t(lang, 'تحديث وحفظ بصمة الإصبع في إعدادات المستخدم بعد الدخول', 'Update & save fingerprint in User Settings after sign-in')
                    : t(lang, 'تسجيل وحفظ بصمة الإصبع في إعدادات المستخدم بعد الدخول', 'Enroll & save fingerprint in User Settings right after sign-in')}
                </span>
              </label>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3.5 px-6 rounded-xl bg-[#E05252] hover:bg-[#D14242] disabled:opacity-60 text-white font-bold text-base transition-colors shadow-sm whitespace-nowrap"
                >
                  {loading
                    ? t(lang, 'جاري التحقق...', 'Verifying...')
                    : t(lang, 'تسجيل الدخول', 'Sign In')}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleBiometricLogin}
                  className={`inline-flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl border font-bold text-base transition-colors whitespace-nowrap ${
                    bioStatus?.biometric_enabled
                      ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900'
                      : 'border-slate-300 bg-[#F6F7F9] hover:bg-slate-200/70 text-slate-900'
                  }`}
                >
                  <Fingerprint className={`w-5 h-5 ${bioStatus?.biometric_enabled ? 'text-emerald-700' : 'text-[#E05252]'}`} />
                  <span>{t(lang, 'التحقق بالبصمة', 'Biometric Sign-In')}</span>
                </button>
              </div>
            </form>
          )}

          <p className="mt-4 text-xs font-medium text-slate-500 leading-relaxed text-center">
            {t(
              lang,
              'سياسة الأمان: لا يُسمح بالتسجيل العشوائي، وتُسجّل جميع محاولات الدخول والخروج. التحقق بالبصمة يتم عبر توقيع تشفيري موثوق محفوظ في إعدادات الحساب.',
              'Security policy: Self-registration is disabled; all access events are audited. Biometric login verifies a real cryptographic signature stored in User Settings.'
            )}
          </p>

          {/* Authorized Operator Profiles Drawer */}
          <div className="mt-5 border border-slate-200 rounded-xl bg-[#F6F7F9]">
            <button
              type="button"
              onClick={() => setShowProfiles((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm font-bold text-slate-800"
            >
              <span>
                {t(
                  lang,
                  'دليل الحسابات التشغيلية المعتمدة (الأدوار الخمسة)',
                  'Authorized Operator Profiles (Five Roles)'
                )}
              </span>
              {showProfiles ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showProfiles && (
              <div className="px-4 pb-4 space-y-2 border-t border-slate-200 pt-3">
                {AUTHORIZED_OPERATOR_PROFILES.map((acc) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => {
                      setUsername(acc.username);
                      setPassword(acc.pass);
                      setPinPrompt(null);
                      setInfo(
                        t(
                          lang,
                          `تم اختيار حساب ${acc.roleAr} (${acc.username}). اضغط "تسجيل الدخول" للمتابعة.`,
                          `Selected ${acc.roleEn} (${acc.username}). Click Sign In to proceed.`
                        )
                      );
                    }}
                    className="w-full text-start px-3.5 py-2.5 rounded-lg bg-white border border-slate-200 hover:border-[#E05252] flex items-center justify-between gap-3 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {lang === 'ar' ? acc.roleAr : acc.roleEn}
                      </div>
                      <div className="text-xs font-mono text-slate-500">
                        {acc.username} · {acc.pass}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#E05252] shrink-0">
                      {t(lang, 'اختيار', 'Select')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs font-semibold text-slate-500 border-t border-slate-200 pt-4 flex items-center justify-between gap-4">
          <span>{t(lang, 'منصة رَصَد لحماية منشآت الكهرباء — السودان', 'RASAD Power Infrastructure Protection — Sudan')}</span>
          <span>{t(lang, 'رصد لاسلكي سلبي مصرح به', 'Passive Authorized RF Monitoring')}</span>
        </div>
      </div>

      {/* Visual Column */}
      <div className="hidden lg:flex lg:w-[46%] bg-[#F6F7F9] border-s border-slate-200 p-10 flex-col justify-between">
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white flex-1 relative min-h-[420px]">
          {!imgFailed ? (
            <img
              src="/src/assets/images/substation_infrastructure_1794509992853.jpg"
              alt={t(lang, 'محطة تحويل كهربائية', 'High-voltage electrical substation')}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-8 text-center">
              <ShieldCheck className="w-16 h-16 text-[#E05252]" />
            </div>
          )}

          <div className="absolute top-5 start-5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm">
            <RasadLogo lang={lang} size="sm" />
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/50 to-transparent p-7 text-white">
            <h2 className="font-display text-2xl font-extrabold mb-2">
              {t(
                lang,
                'رصد مبكر لمؤشرات المسيرات وحماية الشبكة الكهربائية',
                'Early Drone Indicator Detection & Grid Defense'
              )}
            </h2>
            <p className="text-sm font-medium text-slate-200 leading-relaxed">
              {t(
                lang,
                'تغطية جغرافية لحماية سد مروي، كريمة، الولاية الشمالية، ومحطات ومنشآت التحكم بالخرطوم مع إدارة استجابة طوارئ فورية.',
                'Geographic protection for Merowe Dam, Karima, Northern State, and Khartoum control infrastructure with rapid emergency response.'
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-sm font-extrabold text-slate-900 mb-1">
              {t(lang, 'رصد سلبي آمن', 'Passive Sensing')}
            </div>
            <div className="text-xs font-medium text-slate-600">
              {t(lang, 'دون تشويش أو حقن حزم', 'Zero jamming or packet injection')}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-sm font-extrabold text-slate-900 mb-1">
              {t(lang, 'إنذار طوارئ فوري', 'Instant Siren')}
            </div>
            <div className="text-xs font-medium text-slate-600">
              {t(lang, 'صوت عالٍ وتصعيد تلقائي', 'Loud siren & auto-escalation')}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-sm font-extrabold text-slate-900 mb-1">
              {t(lang, 'تحقق بيومتري موثوق', 'Cryptographic Biometric')}
            </div>
            <div className="text-xs font-medium text-slate-600">
              {t(lang, 'مفتاح تشفيري محفوظ بالحساب', 'Saved cryptographic credential')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
