import type { Language, SafeUser } from '../types';
import { apiFetch, setStoredToken } from './api';
import { t } from '../i18n';

const LOCAL_CRYPTO_KEY_PREFIX = 'rasad_crypto_passkey_v2_';

interface StoredCryptoPasskey {
  credentialId: string;
  privateKeyJwk: JsonWebKey;
  publicKeySpkiBase64: string;
  deviceLabel: string;
  savedAt: string;
}

export class PinRequiredError extends Error {
  reason: 'ENROLL' | 'VERIFY';
  iframeBlocked: boolean;
  constructor(reason: 'ENROLL' | 'VERIFY', iframeBlocked: boolean, message: string) {
    super(message);
    this.reason = reason;
    this.iframeBlocked = iframeBlocked;
  }
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function arrayBufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'RASAD Operator Terminal';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android Fingerprint / Biometric';
  if (/iPhone|iPad/i.test(ua)) return 'Apple TouchID / FaceID';
  if (/Windows/i.test(ua)) return 'Windows Hello / PC';
  if (/Mac/i.test(ua)) return 'macOS TouchID';
  return 'Trusted Browser Terminal';
}

export function isInsideIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export async function checkBiometricCapability(): Promise<{
  webauthnSupported: boolean;
  platformAvailable: boolean;
  inIframe: boolean;
}> {
  const inIframe = isInsideIframe();
  const webauthnSupported =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    Boolean(navigator.credentials?.create);

  let platformAvailable = false;
  if (webauthnSupported && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      platformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      platformAvailable = false;
    }
  }
  return { webauthnSupported, platformAvailable, inIframe };
}

export function getStoredCryptoPasskey(username: string): StoredCryptoPasskey | null {
  try {
    const raw = localStorage.getItem(LOCAL_CRYPTO_KEY_PREFIX + username.trim());
    return raw ? (JSON.parse(raw) as StoredCryptoPasskey) : null;
  } catch {
    return null;
  }
}

function saveStoredCryptoPasskey(username: string, data: StoredCryptoPasskey) {
  localStorage.setItem(LOCAL_CRYPTO_KEY_PREFIX + username.trim(), JSON.stringify(data));
}

export function clearLocalPasskey(username: string) {
  localStorage.removeItem(LOCAL_CRYPTO_KEY_PREFIX + username.trim());
  localStorage.removeItem('rasad_device_passkey_v1_' + username.trim());
}

export interface BiometricEnrollResult {
  user: SafeUser;
  mode: 'WEBAUTHN' | 'CRYPTO_PASSKEY';
  message: string;
}

/**
 * Enrolls a real cryptographic credential for the authorized user:
 * 1) Attempts native FIDO2 / WebAuthn platform fingerprint (`WEBAUTHN`) extracting its real SPKI public key.
 * 2) If WebAuthn is blocked by embedded iframe policy or no biometric sensor is configured:
 *    - If `securityPin` is not supplied yet, throws `PinRequiredError('ENROLL', ...)` so the UI prompts for a verified PIN.
 *    - When `securityPin` is supplied, generates a real WebCrypto ECDSA P-256 keypair (`CRYPTO_PASSKEY`)
 *      and persists its public key + bcrypt-hashed PIN in SQLite.
 */
export async function enrollBiometricForUser(params: {
  username: string;
  lang: Language;
  securityPin?: string;
  tokenOverride?: string;
}): Promise<BiometricEnrollResult> {
  const { username, lang, securityPin, tokenOverride } = params;
  const customHeaders: Record<string, string> = tokenOverride
    ? { Authorization: `Bearer ${tokenOverride}` }
    : {};

  const opts = await apiFetch<{
    challenge: string;
    rp: { name: string };
    user: { id: string; name: string; displayName: string };
  }>('/api/auth/webauthn/register-options', {
    method: 'POST',
    headers: customHeaders,
  });

  const deviceLabel = getDeviceLabel();
  let iframeOrDeviceBlocked = false;

  if (!securityPin && typeof window !== 'undefined' && window.PublicKeyCredential && navigator.credentials?.create) {
    try {
      const challengeBytes = Uint8Array.from(
        atob(opts.challenge.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0)
      );
      const userIdBytes = Uint8Array.from(
        atob(opts.user.id.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0)
      );

      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: opts.rp,
          user: { id: userIdBytes, name: opts.user.name, displayName: opts.user.displayName },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (cred) {
        const attResp = cred.response as AuthenticatorAttestationResponse & {
          getPublicKey?: () => ArrayBuffer | null;
        };
        const spkiBuf = typeof attResp.getPublicKey === 'function' ? attResp.getPublicKey() : null;

        if (spkiBuf) {
          const res = await apiFetch<{ user: SafeUser }>('/api/auth/webauthn/register-verify', {
            method: 'POST',
            headers: customHeaders,
            body: JSON.stringify({
              credentialId: cred.id,
              publicKey: arrayBufferToBase64(spkiBuf),
              clientDataJSON: base64UrlEncode(attResp.clientDataJSON),
              biometricType: 'WEBAUTHN',
              deviceLabel,
            }),
          });
          return {
            user: res.user,
            mode: 'WEBAUTHN',
            message: t(
              lang,
              'تم تسجيل بصمة الإصبع البيومترية (WebAuthn) وحفظ مفتاحها العام في إعدادات الحساب بنجاح.',
              'Hardware biometric fingerprint (WebAuthn) enrolled and saved to user settings.'
            ),
          };
        }
      }
    } catch {
      iframeOrDeviceBlocked = true;
    }
  } else if (!securityPin) {
    iframeOrDeviceBlocked = true;
  }

  // Hardware WebAuthn could not complete (e.g., restricted iframe or PC without biometric reader)
  if (!securityPin || securityPin.trim().length < 4) {
    throw new PinRequiredError(
      'ENROLL',
      iframeOrDeviceBlocked || isInsideIframe(),
      t(
        lang,
        'قيّد المتصفح أو الإطار المضمّن مستشعر بصمة الجهاز المباشر. أدخل رمز تحقق أماني (4-8 أرقام) لربط مفتاح تشفيري موثوق وحفظه في حسابك، أو افتح التطبيق في نافذة مستقلة لبصمة الجهاز الحقيقية.',
        'Browser or embedded frame restricted direct hardware biometrics. Enter a 4–8 digit Security PIN to bind a cryptographic device key to your account, or open in a standalone tab for native device fingerprint.'
      )
    );
  }

  // Generate real WebCrypto ECDSA P-256 keypair
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(t(lang, 'المتصفح لا يدعم التشفير الآمن WebCrypto.', 'WebCrypto not supported.'));
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const spkiDer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeySpkiBase64 = arrayBufferToBase64(spkiDer);

  const randBytes = new Uint8Array(24);
  crypto.getRandomValues(randBytes);
  const credentialId = `rasad-ecdsa-${base64UrlEncode(randBytes)}`;

  const res = await apiFetch<{ user: SafeUser }>('/api/auth/webauthn/register-verify', {
    method: 'POST',
    headers: customHeaders,
    body: JSON.stringify({
      credentialId,
      publicKey: publicKeySpkiBase64,
      biometricType: 'CRYPTO_PASSKEY',
      deviceLabel,
      pin: securityPin.trim(),
    }),
  });

  saveStoredCryptoPasskey(username, {
    credentialId,
    privateKeyJwk: privateJwk,
    publicKeySpkiBase64,
    deviceLabel,
    savedAt: new Date().toISOString(),
  });

  return {
    user: res.user,
    mode: 'CRYPTO_PASSKEY',
    message: t(
      lang,
      'تم تسجيل المفتاح البيومتري المشفر بالرمز الأمني وحفظه في قاعدة بيانات المستخدم بنجاح.',
      'PIN-protected ECDSA cryptographic passkey registered and persisted to user settings.'
    ),
  };
}

async function signChallengeWithCryptoPasskey(username: string, challenge: string, lang: Language) {
  const stored = getStoredCryptoPasskey(username);
  if (!stored) {
    throw new Error(
      t(
        lang,
        'المفتاح التشفيري المسجل لهذا الحساب غير موجود على هذا المتصفح. سجل الدخول بكلمة المرور ثم أعد التسجيل في إعدادات المستخدم.',
        'Enrolled cryptographic key for this account is not on this browser. Sign in with password and re-enroll in User Settings.'
      )
    );
  }
  const privKey = await crypto.subtle.importKey(
    'jwk',
    stored.privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privKey,
    new TextEncoder().encode(challenge)
  );
  return {
    credentialId: stored.credentialId,
    signature: base64UrlEncode(sigBuf),
  };
}

async function performWebAuthnAssertion(challenge: string, allowCredentialId: string, lang: Language) {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error(
      t(
        lang,
        'المتصفح الحالي لا يدعم التحقق البيومتري المباشر. استخدم كلمة المرور أو افتح في نافذة مستقلة.',
        'Current browser does not support native biometric assertion.'
      )
    );
  }

  const challengeBytes = Uint8Array.from(
    atob(challenge.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0)
  );
  const credIdBytes = Uint8Array.from(
    atob(allowCredentialId.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0)
  );

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes,
      allowCredentials: [{ id: credIdBytes, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error(t(lang, 'تم إلغاء التحقق بالبصمة.', 'Biometric verification was cancelled.'));
  }

  const resp = assertion.response as AuthenticatorAssertionResponse;
  return {
    credentialId: assertion.id || allowCredentialId,
    clientDataJSON: base64UrlEncode(resp.clientDataJSON),
    authenticatorData: base64UrlEncode(resp.authenticatorData),
    signature: base64UrlEncode(resp.signature),
  };
}

export async function loginWithBiometric(params: {
  username: string;
  lang: Language;
  securityPin?: string;
}): Promise<{ token: string; user: SafeUser }> {
  const { username, lang, securityPin } = params;
  const cleanUser = username.trim();

  const options = await apiFetch<{
    challenge: string;
    allowCredentialId: string;
    biometricType?: string;
  }>('/api/auth/webauthn/login-options', {
    method: 'POST',
    body: JSON.stringify({ username: cleanUser }),
  });

  if (options.biometricType === 'CRYPTO_PASSKEY') {
    if (!securityPin || securityPin.trim().length < 4) {
      throw new PinRequiredError(
        'VERIFY',
        isInsideIframe(),
        t(
          lang,
          'أدخل الرمز الأمني المرتبط بالمفتاح المشفر لإتمام التحقق الموثوق.',
          'Enter your Security Verification PIN linked to this cryptographic device key.'
        )
      );
    }

    const signed = await signChallengeWithCryptoPasskey(cleanUser, options.challenge, lang);
    if (signed.credentialId !== options.allowCredentialId) {
      throw new Error(
        t(
          lang,
          'المفتاح المحلي على هذا المتصفح لا يطابق آخر بصمة محفوظة في الحساب. أعد التسجيل من الإعدادات.',
          'Local key does not match the latest enrolled credential on the server.'
        )
      );
    }

    const verified = await apiFetch<{ token: string; user: SafeUser }>(
      '/api/auth/webauthn/login-verify',
      {
        method: 'POST',
        body: JSON.stringify({
          username: cleanUser,
          credentialId: signed.credentialId,
          signature: signed.signature,
          pin: securityPin.trim(),
        }),
      }
    );
    setStoredToken(verified.token);
    return verified;
  }

  // Real Hardware WebAuthn FIDO2 Assertion
  const assertion = await performWebAuthnAssertion(
    options.challenge,
    options.allowCredentialId,
    lang
  );

  const verified = await apiFetch<{ token: string; user: SafeUser }>(
    '/api/auth/webauthn/login-verify',
    {
      method: 'POST',
      body: JSON.stringify({
        username: cleanUser,
        ...assertion,
      }),
    }
  );
  setStoredToken(verified.token);
  return verified;
}

/**
 * Allows the currently signed-in user to test & verify their saved biometric in User Settings
 * against a live cryptographic challenge on the backend.
 */
export async function verifySavedBiometricSelf(params: {
  username: string;
  lang: Language;
  securityPin?: string;
}): Promise<{ verified: boolean; biometric_type: string; verified_at: string }> {
  const { username, lang, securityPin } = params;
  const options = await apiFetch<{
    challenge: string;
    allowCredentialId: string;
    biometricType?: string;
  }>('/api/auth/webauthn/verify-self-options', {
    method: 'POST',
  });

  if (options.biometricType === 'CRYPTO_PASSKEY') {
    if (!securityPin || securityPin.trim().length < 4) {
      throw new PinRequiredError(
        'VERIFY',
        isInsideIframe(),
        t(
          lang,
          'أدخل الرمز الأمني للتحقق من تطابق المفتاح المشفر المحفوظ في قاعدة البيانات.',
          'Enter your Security PIN to verify your saved cryptographic passkey against the server.'
        )
      );
    }
    const signed = await signChallengeWithCryptoPasskey(username, options.challenge, lang);
    return apiFetch<{ verified: boolean; biometric_type: string; verified_at: string }>(
      '/api/auth/webauthn/verify-self',
      {
        method: 'POST',
        body: JSON.stringify({
          credentialId: signed.credentialId,
          signature: signed.signature,
          pin: securityPin.trim(),
        }),
      }
    );
  }

  const assertion = await performWebAuthnAssertion(
    options.challenge,
    options.allowCredentialId,
    lang
  );
  return apiFetch<{ verified: boolean; biometric_type: string; verified_at: string }>(
    '/api/auth/webauthn/verify-self',
    {
      method: 'POST',
      body: JSON.stringify(assertion),
    }
  );
}
