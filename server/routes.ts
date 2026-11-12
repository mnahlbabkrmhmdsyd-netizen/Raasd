import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, computeRecordHash, hashToken, sanitizeUser } from './db.ts';
import { analyzeFacilityRisk, evaluateWirelessIndicators } from './riskEngine.ts';
import type { SafeUser, SeverityLevel, UserRecord, UserRole, WirelessIndicators } from './types.ts';

export type BroadcastFn = (event: string, payload: unknown, facilityId?: string) => void;

interface AuthedRequest extends Request {
  user?: SafeUser;
  sessionTokenHash?: string;
}

const webauthnChallenges = new Map<string, { challenge: string; userId?: string; expiresAt: number }>();

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'local';
}

export function writeAuditLog(params: {
  user?: SafeUser | null;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  ip?: string;
}) {
  const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, actor_username, actor_role, action, target_type, target_id, details_json, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.user?.id ?? null,
    params.user?.username ?? 'SYSTEM',
    params.user?.role ?? 'SYSTEM',
    params.action,
    params.targetType,
    params.targetId,
    JSON.stringify(params.details ?? {}),
    params.ip ?? 'local',
    new Date().toISOString()
  );
}

export function canAccessFacility(user: SafeUser, facilityId: string): boolean {
  if (user.role === 'ADMIN') return true;
  if (user.authorized_facilities.includes('*')) return true;
  return user.authorized_facilities.includes(facilityId);
}

function getLatestEventHash(): string {
  const row = db
    .prepare('SELECT record_hash FROM detection_events ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .get() as { record_hash: string } | undefined;
  return row?.record_hash ?? 'GENESIS_RASAD_2026';
}

function recomputeFacilityState(facilityId: string) {
  const sensors = db
    .prepare('SELECT connection_status FROM sensors WHERE facility_id = ?')
    .all(facilityId) as Array<{ connection_status: string }>;

  let monitoringStatus: 'ACTIVE' | 'DEGRADED' | 'OFFLINE' = 'OFFLINE';
  if (sensors.length > 0) {
    const connected = sensors.filter((s) => s.connection_status === 'CONNECTED').length;
    if (connected === sensors.length) monitoringStatus = 'ACTIVE';
    else if (connected > 0) monitoringStatus = 'DEGRADED';
    else monitoringStatus = 'OFFLINE';
  }

  const openEvents = db
    .prepare(
      `SELECT severity FROM detection_events WHERE facility_id = ? AND status != 'CLOSED'`
    )
    .all(facilityId) as Array<{ severity: SeverityLevel }>;

  const rank: Record<SeverityLevel, number> = {
    NORMAL: 0,
    WARNING: 1,
    HIGH: 2,
    EMERGENCY: 3,
  };
  let maxRisk: SeverityLevel = 'NORMAL';
  for (const ev of openEvents) {
    if (rank[ev.severity] > rank[maxRisk]) maxRisk = ev.severity;
  }

  db.prepare('UPDATE facilities SET monitoring_status = ?, risk_level = ? WHERE id = ?').run(
    monitoringStatus,
    maxRisk,
    facilityId
  );
}

export function createDetectionEvent(params: {
  facility_id: string;
  sensor_id: string | null;
  source_type: 'LIVE_SENSOR' | 'MANUAL_REPORT' | 'DRILL_SIMULATION';
  event_type_ar: string;
  event_type_en: string;
  indicator_type: string;
  indicators: WirelessIndicators & Record<string, unknown>;
  probabilistic_score: number;
  confidence_pct: number;
  severity: SeverityLevel;
  estimated_lat: number | null;
  estimated_lng: number | null;
  location_precision: 'ESTIMATED_ZONE' | 'REPORTER_PIN' | 'SENSOR_ACTUAL';
}) {
  const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const prevHash = getLatestEventHash();

  const hashPayload = {
    id,
    facility_id: params.facility_id,
    sensor_id: params.sensor_id,
    source_type: params.source_type,
    indicator_type: params.indicator_type,
    probabilistic_score: params.probabilistic_score,
    confidence_pct: params.confidence_pct,
    severity: params.severity,
    created_at: now,
  };
  const recordHash = computeRecordHash(hashPayload, prevHash);

  db.prepare(`
    INSERT INTO detection_events (
      id, facility_id, sensor_id, source_type, event_type_ar, event_type_en, indicator_type,
      indicators_json, probabilistic_score, confidence_pct, severity, estimated_lat, estimated_lng,
      location_precision, status, prev_hash, record_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?)
  `).run(
    id,
    params.facility_id,
    params.sensor_id,
    params.source_type,
    params.event_type_ar,
    params.event_type_en,
    params.indicator_type,
    JSON.stringify(params.indicators),
    params.probabilistic_score,
    params.confidence_pct,
    params.severity,
    params.estimated_lat,
    params.estimated_lng,
    params.location_precision,
    prevHash,
    recordHash,
    now
  );

  recomputeFacilityState(params.facility_id);
  return db.prepare('SELECT * FROM detection_events WHERE id = ?').get(id);
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const rawToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const tHash = hashToken(rawToken);
  const session = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(tHash) as { user_id: string; expires_at: string } | undefined;

  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tHash);
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as
    | UserRecord
    | undefined;
  if (!user || !user.active) {
    res.status(403).json({ error: 'Account disabled or missing' });
    return;
  }

  req.user = sanitizeUser(user);
  req.sessionTokenHash = tHash;
  next();
}

function requireRole(roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }
    next();
  };
}

export function createApiRouter(broadcast: BroadcastFn) {
  const router = express.Router();

  // --- AUTHENTICATION ---
  router.post('/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(String(username).trim()) as UserRecord | undefined;

    if (!user || !user.active || !bcrypt.compareSync(String(password), user.password_hash)) {
      writeAuditLog({
        user: user ? sanitizeUser(user) : null,
        action: 'LOGIN_FAILED',
        targetType: 'AUTH',
        targetId: String(username),
        details: { reason: !user ? 'UNKNOWN_USER' : !user.active ? 'DISABLED' : 'BAD_PASSWORD' },
        ip: getClientIp(req),
      });
      res.status(401).json({ error: 'Invalid credentials or inactive account' });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      tokenHash,
      user.id,
      expiresAt,
      now.toISOString()
    );
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now.toISOString(), user.id);

    const safe = sanitizeUser({ ...user, last_login: now.toISOString() });
    writeAuditLog({
      user: safe,
      action: 'LOGIN_SUCCESS',
      targetType: 'AUTH',
      targetId: user.id,
      details: { method: 'PASSWORD' },
      ip: getClientIp(req),
    });

    res.json({ token: rawToken, expires_at: expiresAt, user: safe });
  });

  router.post('/auth/logout', authMiddleware, (req: AuthedRequest, res: Response) => {
    if (req.sessionTokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
    }
    writeAuditLog({
      user: req.user,
      action: 'LOGOUT',
      targetType: 'AUTH',
      targetId: req.user?.id || 'unknown',
      ip: getClientIp(req),
    });
    res.json({ ok: true });
  });

  router.get('/auth/me', authMiddleware, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  function verifyBiometricAssertion(params: {
    user: UserRecord;
    expectedChallenge: string;
    credentialId: string;
    clientDataJSON?: string;
    authenticatorData?: string;
    signature?: string;
    pin?: string;
  }): { ok: boolean; error?: string } {
    const { user, expectedChallenge, credentialId, clientDataJSON, authenticatorData, signature, pin } = params;
    if (!user.biometric_enabled || user.biometric_credential_id !== String(credentialId)) {
      return { ok: false, error: 'Biometric credential mismatch or not enrolled' };
    }

    if (user.biometric_type === 'CRYPTO_PASSKEY') {
      if (!pin || !user.biometric_pin_hash || !bcrypt.compareSync(String(pin), user.biometric_pin_hash)) {
        return { ok: false, error: 'Invalid security verification PIN' };
      }
      if (!signature || !user.biometric_public_key) {
        return { ok: false, error: 'Missing cryptographic key signature' };
      }
      try {
        const spkiDer = Buffer.from(user.biometric_public_key, 'base64');
        const sigBuf = Buffer.from(String(signature), 'base64url');
        const verified = crypto.verify(
          'sha256',
          Buffer.from(expectedChallenge, 'utf8'),
          { key: spkiDer, format: 'der', type: 'spki', dsaEncoding: 'ieee-p1363' },
          sigBuf
        );
        if (!verified) {
          return { ok: false, error: 'Cryptographic passkey signature invalid' };
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'Failed to verify device passkey signature' };
      }
    }

    // Hardware WebAuthn FIDO2 Assertion Verification
    if (!clientDataJSON || !authenticatorData || !signature) {
      return { ok: false, error: 'Incomplete WebAuthn biometric assertion payload' };
    }

    try {
      const clientDataBuf = Buffer.from(String(clientDataJSON), 'base64url');
      const clientData = JSON.parse(clientDataBuf.toString('utf8')) as {
        type?: string;
        challenge?: string;
      };
      if (clientData.type !== 'webauthn.get' || clientData.challenge !== expectedChallenge) {
        return { ok: false, error: 'WebAuthn challenge or assertion type mismatch' };
      }

      const authDataBuf = Buffer.from(String(authenticatorData), 'base64url');
      if (authDataBuf.length < 37) {
        return { ok: false, error: 'Invalid WebAuthn authenticatorData' };
      }
      // Bit 0 (0x01) = User Present (UP)
      if ((authDataBuf[32] & 0x01) === 0) {
        return { ok: false, error: 'Biometric user presence check failed' };
      }

      if (!user.biometric_public_key || user.biometric_public_key === 'webauthn-enrolled') {
        return { ok: false, error: 'Stored WebAuthn public key missing; please re-enroll biometric' };
      }

      const spkiDer = Buffer.from(user.biometric_public_key, 'base64');
      const sigBuf = Buffer.from(String(signature), 'base64url');
      const clientHash = crypto.createHash('sha256').update(clientDataBuf).digest();
      const signedPayload = Buffer.concat([authDataBuf, clientHash]);

      const verified = crypto.verify(
        'sha256',
        signedPayload,
        { key: spkiDer, format: 'der', type: 'spki' },
        sigBuf
      );
      if (!verified) {
        return { ok: false, error: 'Hardware biometric signature verification failed' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Malformed WebAuthn assertion response' };
    }
  }

  // --- WEBAUTHN & BIOMETRIC ENROLLMENT / STATUS / SELF-TEST / LOGIN ---
  router.get('/auth/webauthn/status', (req: Request, res: Response) => {
    const username = String(req.query.username || '').trim();
    if (!username) {
      res.json({ exists: false, biometric_enabled: false });
      return;
    }
    const user = db
      .prepare('SELECT id, active, biometric_enabled, biometric_type, biometric_device_label, biometric_enrolled_at FROM users WHERE username = ?')
      .get(username) as
      | {
          id: string;
          active: number;
          biometric_enabled: number;
          biometric_type: string | null;
          biometric_device_label: string | null;
          biometric_enrolled_at: string | null;
        }
      | undefined;

    if (!user) {
      res.json({ exists: false, biometric_enabled: false });
      return;
    }

    res.json({
      exists: true,
      active: Boolean(user.active),
      biometric_enabled: Boolean(user.biometric_enabled),
      biometric_type: user.biometric_type ?? null,
      biometric_device_label: user.biometric_device_label ?? null,
      biometric_enrolled_at: user.biometric_enrolled_at ?? null,
    });
  });

  router.post('/auth/webauthn/register-options', authMiddleware, (req: AuthedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const challenge = crypto.randomBytes(32).toString('base64url');
    webauthnChallenges.set(`reg:${req.user.id}`, {
      challenge,
      userId: req.user.id,
      expiresAt: Date.now() + 120_000,
    });
    res.json({
      challenge,
      rp: { name: 'RASAD | رَصَد' },
      user: {
        id: Buffer.from(req.user.id).toString('base64url'),
        name: req.user.username,
        displayName: req.user.full_name_en,
      },
    });
  });

  router.post('/auth/webauthn/register-verify', authMiddleware, (req: AuthedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const entry = webauthnChallenges.get(`reg:${req.user.id}`);
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(400).json({ error: 'Biometric registration challenge expired' });
      return;
    }
    const { credentialId, publicKey, clientDataJSON, biometricType, deviceLabel, pin } = req.body || {};
    if (!credentialId || !publicKey) {
      res.status(400).json({ error: 'Missing credentialId or publicKey' });
      return;
    }

    const resolvedType = biometricType === 'CRYPTO_PASSKEY' ? 'CRYPTO_PASSKEY' : 'WEBAUTHN';

    if (resolvedType === 'WEBAUTHN') {
      if (clientDataJSON) {
        try {
          const parsed = JSON.parse(Buffer.from(String(clientDataJSON), 'base64url').toString('utf8')) as {
            type?: string;
            challenge?: string;
          };
          if (parsed.type !== 'webauthn.create' || parsed.challenge !== entry.challenge) {
            res.status(400).json({ error: 'WebAuthn registration challenge mismatch' });
            return;
          }
        } catch {
          res.status(400).json({ error: 'Invalid WebAuthn clientDataJSON' });
          return;
        }
      }
      // Validate SPKI DER public key parses cleanly
      try {
        crypto.createPublicKey({
          key: Buffer.from(String(publicKey), 'base64'),
          format: 'der',
          type: 'spki',
        });
      } catch {
        res.status(400).json({ error: 'Invalid biometric SPKI public key format' });
        return;
      }
    } else {
      if (!pin || String(pin).trim().length < 4 || String(pin).trim().length > 12) {
        res.status(400).json({ error: 'Security PIN (4-12 digits) is required for device passkey enrollment' });
        return;
      }
      try {
        crypto.createPublicKey({
          key: Buffer.from(String(publicKey), 'base64'),
          format: 'der',
          type: 'spki',
        });
      } catch {
        res.status(400).json({ error: 'Invalid ECDSA SPKI public key format' });
        return;
      }
    }

    webauthnChallenges.delete(`reg:${req.user.id}`);
    const now = new Date().toISOString();
    const resolvedLabel = String(
      deviceLabel || (resolvedType === 'WEBAUTHN' ? 'Biometric Sensor' : 'PIN-Protected Device Key')
    ).slice(0, 120);
    const pinHash = resolvedType === 'CRYPTO_PASSKEY' ? bcrypt.hashSync(String(pin).trim(), 10) : null;

    db.prepare(
      `UPDATE users SET biometric_enabled = 1, biometric_credential_id = ?, biometric_public_key = ?, biometric_type = ?, biometric_device_label = ?, biometric_enrolled_at = ?, biometric_pin_hash = ? WHERE id = ?`
    ).run(String(credentialId), String(publicKey), resolvedType, resolvedLabel, now, pinHash, req.user.id);

    writeAuditLog({
      user: req.user,
      action: 'BIOMETRIC_ENROLLED',
      targetType: 'USER',
      targetId: req.user.id,
      details: { biometric_type: resolvedType, device_label: resolvedLabel },
      ip: getClientIp(req),
    });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRecord;
    res.json({ user: sanitizeUser(updated) });
  });

  router.delete('/auth/webauthn', authMiddleware, (req: AuthedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    db.prepare(
      `UPDATE users SET biometric_enabled = 0, biometric_credential_id = NULL, biometric_public_key = NULL, biometric_type = NULL, biometric_device_label = NULL, biometric_enrolled_at = NULL, biometric_pin_hash = NULL WHERE id = ?`
    ).run(req.user.id);

    writeAuditLog({
      user: req.user,
      action: 'BIOMETRIC_REMOVED',
      targetType: 'USER',
      targetId: req.user.id,
      ip: getClientIp(req),
    });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRecord;
    res.json({ user: sanitizeUser(updated) });
  });

  // Self-verification inside User Settings to test & prove saved biometric works cryptographically
  router.post('/auth/webauthn/verify-self-options', authMiddleware, (req: AuthedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRecord | undefined;
    if (!user || !user.biometric_enabled || !user.biometric_credential_id) {
      res.status(400).json({ error: 'No biometric enrolled on this account yet' });
      return;
    }
    const challenge = crypto.randomBytes(32).toString('base64url');
    webauthnChallenges.set(`self:${user.id}`, {
      challenge,
      userId: user.id,
      expiresAt: Date.now() + 120_000,
    });
    res.json({
      challenge,
      allowCredentialId: user.biometric_credential_id,
      biometricType: user.biometric_type || 'WEBAUTHN',
      deviceLabel: user.biometric_device_label || null,
    });
  });

  router.post('/auth/webauthn/verify-self', authMiddleware, (req: AuthedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const entry = webauthnChallenges.get(`self:${req.user.id}`);
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(400).json({ error: 'Verification challenge expired' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as UserRecord | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { credentialId, clientDataJSON, authenticatorData, signature, pin } = req.body || {};
    const check = verifyBiometricAssertion({
      user,
      expectedChallenge: entry.challenge,
      credentialId: String(credentialId || ''),
      clientDataJSON,
      authenticatorData,
      signature,
      pin,
    });
    if (!check.ok) {
      res.status(401).json({ error: check.error || 'Biometric verification failed' });
      return;
    }
    webauthnChallenges.delete(`self:${req.user.id}`);
    writeAuditLog({
      user: req.user,
      action: 'BIOMETRIC_VERIFIED_IN_SETTINGS',
      targetType: 'USER',
      targetId: req.user.id,
      details: { biometric_type: user.biometric_type },
      ip: getClientIp(req),
    });
    res.json({ verified: true, biometric_type: user.biometric_type, verified_at: new Date().toISOString() });
  });

  router.post('/auth/webauthn/login-options', (req: Request, res: Response) => {
    const { username } = req.body || {};
    if (!username) {
      res.status(400).json({ error: 'Username is required for biometric verification' });
      return;
    }
    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(String(username).trim()) as UserRecord | undefined;

    if (!user || !user.active || !user.biometric_enabled || !user.biometric_credential_id) {
      res.status(400).json({
        error: 'Biometric authentication is not enrolled for this authorized account. Sign in with password first and enroll in User Settings.',
      });
      return;
    }

    const challenge = crypto.randomBytes(32).toString('base64url');
    webauthnChallenges.set(`login:${user.username}`, {
      challenge,
      userId: user.id,
      expiresAt: Date.now() + 120_000,
    });

    res.json({
      challenge,
      allowCredentialId: user.biometric_credential_id,
      biometricType: user.biometric_type || 'WEBAUTHN',
      deviceLabel: user.biometric_device_label || null,
    });
  });

  router.post('/auth/webauthn/login-verify', (req: Request, res: Response) => {
    const { username, credentialId, clientDataJSON, authenticatorData, signature, pin } = req.body || {};
    if (!username || !credentialId) {
      res.status(400).json({ error: 'Username and credentialId required' });
      return;
    }
    const entry = webauthnChallenges.get(`login:${String(username).trim()}`);
    if (!entry || entry.expiresAt < Date.now()) {
      res.status(401).json({ error: 'Biometric login challenge expired' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(entry.userId) as
      | UserRecord
      | undefined;
    if (!user || !user.active) {
      res.status(401).json({ error: 'Account disabled or missing' });
      return;
    }

    const check = verifyBiometricAssertion({
      user,
      expectedChallenge: entry.challenge,
      credentialId: String(credentialId),
      clientDataJSON,
      authenticatorData,
      signature,
      pin,
    });

    if (!check.ok) {
      writeAuditLog({
        user: sanitizeUser(user),
        action: 'BIOMETRIC_LOGIN_FAILED',
        targetType: 'AUTH',
        targetId: user.id,
        details: { reason: check.error },
        ip: getClientIp(req),
      });
      res.status(401).json({ error: check.error || 'Biometric verification failed' });
      return;
    }

    webauthnChallenges.delete(`login:${user.username}`);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      tokenHash,
      user.id,
      expiresAt,
      now.toISOString()
    );
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now.toISOString(), user.id);

    const safe = sanitizeUser({ ...user, last_login: now.toISOString() });
    writeAuditLog({
      user: safe,
      action: 'LOGIN_SUCCESS',
      targetType: 'AUTH',
      targetId: user.id,
      details: { method: user.biometric_type === 'CRYPTO_PASSKEY' ? 'CRYPTO_PASSKEY_PIN' : 'WEBAUTHN_FIDO2_SIGNATURE' },
      ip: getClientIp(req),
    });

    res.json({ token: rawToken, expires_at: expiresAt, user: safe });
  });

  // --- USERS & RBAC (ADMIN ONLY) ---
  router.get('/users', authMiddleware, requireRole(['ADMIN']), (_req: AuthedRequest, res: Response) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRecord[];
    res.json({ users: rows.map(sanitizeUser) });
  });

  router.post('/users', authMiddleware, requireRole(['ADMIN']), (req: AuthedRequest, res: Response) => {
    const { username, password, full_name_ar, full_name_en, role, authorized_facilities } = req.body || {};
    if (!username || !password || !full_name_ar || !role) {
      res.status(400).json({ error: 'Missing required user fields' });
      return;
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(String(username).trim());
    if (existing) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    const id = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const facilitiesJson = JSON.stringify(Array.isArray(authorized_facilities) ? authorized_facilities : []);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name_ar, full_name_en, role, authorized_facilities, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      String(username).trim(),
      bcrypt.hashSync(String(password), 10),
      String(full_name_ar),
      String(full_name_en || full_name_ar),
      String(role),
      facilitiesJson,
      now
    );

    writeAuditLog({
      user: req.user,
      action: 'USER_CREATED',
      targetType: 'USER',
      targetId: id,
      details: { username, role, authorized_facilities },
      ip: getClientIp(req),
    });

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord;
    res.status(201).json({ user: sanitizeUser(created) });
  });

  router.patch('/users/:id', authMiddleware, requireRole(['ADMIN']), (req: AuthedRequest, res: Response) => {
    const { id } = req.params;
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { role, authorized_facilities, active, full_name_ar, full_name_en, reset_password } = req.body || {};
    const nextRole = role ?? target.role;
    const nextFac =
      authorized_facilities !== undefined
        ? JSON.stringify(authorized_facilities)
        : target.authorized_facilities;
    const nextActive = active !== undefined ? (active ? 1 : 0) : target.active;
    const nextHash = reset_password ? bcrypt.hashSync(String(reset_password), 10) : target.password_hash;

    db.prepare(
      'UPDATE users SET role = ?, authorized_facilities = ?, active = ?, full_name_ar = ?, full_name_en = ?, password_hash = ? WHERE id = ?'
    ).run(
      nextRole,
      nextFac,
      nextActive,
      full_name_ar ?? target.full_name_ar,
      full_name_en ?? target.full_name_en,
      nextHash,
      id
    );

    if (nextActive === 0) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }

    writeAuditLog({
      user: req.user,
      action: 'USER_UPDATED',
      targetType: 'USER',
      targetId: id,
      details: { role: nextRole, active: Boolean(nextActive), authorized_facilities },
      ip: getClientIp(req),
    });

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord;
    res.json({ user: sanitizeUser(updated) });
  });

  // --- FACILITIES ---
  router.get('/facilities', authMiddleware, (req: AuthedRequest, res: Response) => {
    const all = db.prepare('SELECT * FROM facilities ORDER BY created_at ASC').all() as Array<
      Record<string, unknown>
    >;
    const scoped = all.filter((f) => canAccessFacility(req.user!, String(f.id)));
    res.json({ facilities: scoped });
  });

  router.post(
    '/facilities',
    authMiddleware,
    requireRole(['ADMIN']),
    (req: AuthedRequest, res: Response) => {
      const { code, name_ar, name_en, type, lat, lng, region_ar, region_en, coverage_radius_m, notes_ar, notes_en } =
        req.body || {};
      if (!code || !name_ar || !type || lat === undefined || lng === undefined) {
        res.status(400).json({ error: 'Missing required facility fields' });
        return;
      }
      const id = `fac-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO facilities (id, code, name_ar, name_en, type, lat, lng, region_ar, region_en, coverage_radius_m, monitoring_status, risk_level, notes_ar, notes_en, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OFFLINE', 'NORMAL', ?, ?, ?)
      `).run(
        id,
        String(code).trim().toUpperCase(),
        String(name_ar),
        String(name_en || name_ar),
        String(type),
        Number(lat),
        Number(lng),
        String(region_ar || 'القطاع التشغيلي'),
        String(region_en || 'Operational Sector'),
        Number(coverage_radius_m || 800),
        String(notes_ar || ''),
        String(notes_en || ''),
        now
      );

      writeAuditLog({
        user: req.user,
        action: 'FACILITY_CREATED',
        targetType: 'FACILITY',
        targetId: id,
        details: { code, name_ar },
        ip: getClientIp(req),
      });

      const created = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
      broadcast('facility:updated', created, id);
      res.status(201).json({ facility: created });
    }
  );

  router.patch(
    '/facilities/:id',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER']),
    (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      if (!canAccessFacility(req.user!, id)) {
        res.status(403).json({ error: 'Access denied to this facility' });
        return;
      }
      const existing = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Facility not found' });
        return;
      }
      const { name_ar, name_en, type, lat, lng, region_ar, region_en, coverage_radius_m, notes_ar, notes_en } =
        req.body || {};

      db.prepare(`
        UPDATE facilities SET name_ar = ?, name_en = ?, type = ?, lat = ?, lng = ?, region_ar = ?, region_en = ?, coverage_radius_m = ?, notes_ar = ?, notes_en = ?
        WHERE id = ?
      `).run(
        name_ar ?? existing.name_ar,
        name_en ?? existing.name_en,
        type ?? existing.type,
        lat !== undefined ? Number(lat) : existing.lat,
        lng !== undefined ? Number(lng) : existing.lng,
        region_ar ?? existing.region_ar,
        region_en ?? existing.region_en,
        coverage_radius_m !== undefined ? Number(coverage_radius_m) : existing.coverage_radius_m,
        notes_ar ?? existing.notes_ar,
        notes_en ?? existing.notes_en,
        id
      );

      writeAuditLog({
        user: req.user,
        action: 'FACILITY_UPDATED',
        targetType: 'FACILITY',
        targetId: id,
        ip: getClientIp(req),
      });

      const updated = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
      broadcast('facility:updated', updated, id);
      res.json({ facility: updated });
    }
  );

  // --- SENSORS ---
  router.get('/sensors', authMiddleware, (req: AuthedRequest, res: Response) => {
    const all = db.prepare('SELECT * FROM sensors ORDER BY created_at ASC').all() as Array<
      Record<string, unknown>
    >;
    const scoped = all
      .filter((s) => canAccessFacility(req.user!, String(s.facility_id)))
      .map((s) => ({
        ...s,
        sensor_token_hash: undefined, // never expose token hash
        fault_log: JSON.parse(String(s.fault_log || '[]')),
      }));
    res.json({ sensors: scoped });
  });

  router.post(
    '/sensors',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER']),
    (req: AuthedRequest, res: Response) => {
      const { facility_id, unit_code, name_ar, name_en, hardware_spec, interface_name, lat, lng, coverage_radius_m } =
        req.body || {};
      if (!facility_id || !unit_code || !name_ar) {
        res.status(400).json({ error: 'Missing required sensor fields' });
        return;
      }
      if (!canAccessFacility(req.user!, String(facility_id))) {
        res.status(403).json({ error: 'Unauthorized facility' });
        return;
      }
      const id = `sen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const rawSensorToken = `rasad_sen_${crypto.randomBytes(16).toString('hex')}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO sensors (id, facility_id, unit_code, name_ar, name_en, hardware_spec, interface_name, lat, lng, coverage_radius_m, connection_status, wifi_interface_status, service_status, power_status, power_pct, sensor_token_hash, fault_log, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISCONNECTED', 'DOWN', 'STOPPED', 'UNKNOWN', NULL, ?, '[]', ?)
      `).run(
        id,
        String(facility_id),
        String(unit_code).trim().toUpperCase(),
        String(name_ar),
        String(name_en || name_ar),
        String(hardware_spec || 'Raspberry Pi + USB WiFi Monitor Mode + Python 3 / Scapy'),
        String(interface_name || 'wlan1mon'),
        Number(lat || 15.6),
        Number(lng || 32.53),
        Number(coverage_radius_m || 450),
        hashToken(rawSensorToken),
        now
      );

      recomputeFacilityState(String(facility_id));
      writeAuditLog({
        user: req.user,
        action: 'SENSOR_REGISTERED',
        targetType: 'SENSOR',
        targetId: id,
        details: { unit_code, facility_id },
        ip: getClientIp(req),
      });

      const created = db.prepare('SELECT * FROM sensors WHERE id = ?').get(id) as Record<string, unknown>;
      broadcast('sensor:updated', { ...created, sensor_token_hash: undefined, fault_log: [] }, String(facility_id));
      res.status(201).json({
        sensor: { ...created, sensor_token_hash: undefined, fault_log: [] },
        provisioning_token: rawSensorToken,
      });
    }
  );

  // Real hardware sensor heartbeat & passive indicator ingestion (Raspberry Pi / Scapy endpoint)
  router.post('/sensors/ingest', (req: Request, res: Response) => {
    const sensorToken = req.headers['x-sensor-token'] as string | undefined;
    const { unit_code, wifi_interface_status, service_status, power_status, power_pct, indicators, estimated_lat, estimated_lng } =
      req.body || {};

    if (!sensorToken || !unit_code) {
      res.status(401).json({ error: 'x-sensor-token header and unit_code are required' });
      return;
    }

    const sensor = db.prepare('SELECT * FROM sensors WHERE unit_code = ?').get(String(unit_code)) as
      | Record<string, unknown>
      | undefined;
    if (!sensor || sensor.sensor_token_hash !== hashToken(sensorToken)) {
      res.status(403).json({ error: 'Invalid sensor credentials' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE sensors SET connection_status = 'CONNECTED', wifi_interface_status = ?, service_status = ?, power_status = ?, power_pct = ?, last_seen_at = ?
      WHERE id = ?
    `).run(
      String(wifi_interface_status || 'MONITOR_ACTIVE'),
      String(service_status || 'SCAPY_RUNNING'),
      String(power_status || 'AC_MAINS_OK'),
      power_pct !== undefined ? Number(power_pct) : null,
      now,
      sensor.id
    );

    recomputeFacilityState(String(sensor.facility_id));
    const updatedSensor = db.prepare('SELECT * FROM sensors WHERE id = ?').get(sensor.id) as Record<string, unknown>;
    broadcast(
      'sensor:updated',
      { ...updatedSensor, sensor_token_hash: undefined, fault_log: JSON.parse(String(updatedSensor.fault_log || '[]')) },
      String(sensor.facility_id)
    );

    let createdEvent = null;
    if (indicators && typeof indicators === 'object') {
      const evaluation = evaluateWirelessIndicators(indicators as WirelessIndicators);
      if (evaluation.probabilistic_score >= 25) {
        createdEvent = createDetectionEvent({
          facility_id: String(sensor.facility_id),
          sensor_id: String(sensor.id),
          source_type: 'LIVE_SENSOR',
          event_type_ar: 'مؤشرات نشاط لاسلكي محتمل لمركبة مسيرة (رصد سلبي)',
          event_type_en: 'Candidate Drone Wireless Activity Indicators (Passive)',
          indicator_type: evaluation.indicator_type,
          indicators: {
            ...evaluation.normalized_indicators,
            matched_factors: evaluation.matched_factors,
            single_indicator_capped: evaluation.single_indicator_capped,
          },
          probabilistic_score: evaluation.probabilistic_score,
          confidence_pct: evaluation.confidence_pct,
          severity: evaluation.severity,
          estimated_lat: estimated_lat !== undefined ? Number(estimated_lat) : Number(sensor.lat),
          estimated_lng: estimated_lng !== undefined ? Number(estimated_lng) : Number(sensor.lng),
          location_precision: 'ESTIMATED_ZONE',
        });
        broadcast('event:created', createdEvent, String(sensor.facility_id));
      }
    }

    res.json({ ok: true, sensor_id: sensor.id, event: createdEvent });
  });

  // Labeled Simulation / Connection Test for QA & Training Drills (explicitly marked DRILL_SIMULATION, never disguised as live RF capture)
  router.post(
    '/sensors/:id/drill',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'MONITORING_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const sensor = db.prepare('SELECT * FROM sensors WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!sensor) {
        res.status(404).json({ error: 'Sensor not found' });
        return;
      }
      if (!canAccessFacility(req.user!, String(sensor.facility_id))) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const { action, indicators } = req.body || {};
      const now = new Date().toISOString();

      if (action === 'CONNECT_TEST') {
        db.prepare(`
          UPDATE sensors SET connection_status = 'CONNECTED', wifi_interface_status = 'MONITOR_ACTIVE', service_status = 'SCAPY_RUNNING', power_status = 'AC_MAINS_OK', power_pct = 98, last_seen_at = ?
          WHERE id = ?
        `).run(now, id);
        recomputeFacilityState(String(sensor.facility_id));
        writeAuditLog({
          user: req.user,
          action: 'SENSOR_TEST_LINK_CONNECTED',
          targetType: 'SENSOR',
          targetId: id,
          ip: getClientIp(req),
        });
      } else if (action === 'DISCONNECT_TEST') {
        const faults = JSON.parse(String(sensor.fault_log || '[]'));
        faults.unshift({
          timestamp: now,
          code: 'LINK_LOST',
          message_ar: 'انقطع الاتصال بوحدة الاستشعار — تم إيقاف حالة المراقبة الحية للمنطقة.',
          message_en: 'Sensor unit link lost — live monitoring status disabled for this zone.',
        });
        db.prepare(`
          UPDATE sensors SET connection_status = 'DISCONNECTED', wifi_interface_status = 'DOWN', service_status = 'STOPPED', fault_log = ?
          WHERE id = ?
        `).run(JSON.stringify(faults.slice(0, 20)), id);
        recomputeFacilityState(String(sensor.facility_id));

        const offlineEvt = createDetectionEvent({
          facility_id: String(sensor.facility_id),
          sensor_id: id,
          source_type: 'LIVE_SENSOR',
          event_type_ar: `انقطاع اتصال وحدة الاستشعار (${sensor.unit_code})`,
          event_type_en: `Sensor Unit Disconnected (${sensor.unit_code})`,
          indicator_type: 'SENSOR_OFFLINE',
          indicators: { unit_code: sensor.unit_code, interface: sensor.interface_name },
          probabilistic_score: 60,
          confidence_pct: 100,
          severity: 'WARNING',
          estimated_lat: Number(sensor.lat),
          estimated_lng: Number(sensor.lng),
          location_precision: 'SENSOR_ACTUAL',
        });
        broadcast('event:created', offlineEvt, String(sensor.facility_id));
        writeAuditLog({
          user: req.user,
          action: 'SENSOR_DISCONNECTED_ALERT',
          targetType: 'SENSOR',
          targetId: id,
          ip: getClientIp(req),
        });
      } else if (action === 'DRILL_DETECTION') {
        const ind: WirelessIndicators = indicators || {
          ssid_candidate: 'DJI_MAVIC_AIR2',
          mac_address_masked: '60:60:1F:8A:4C:12',
          rssi_dbm: -52,
          rssi_delta_dbm: 17,
          packet_rate_pps: 240,
          baseline_pps: 32,
          channel: 6,
          video_control_pattern: true,
        };
        const evaluation = evaluateWirelessIndicators(ind);
        const drillEvt = createDetectionEvent({
          facility_id: String(sensor.facility_id),
          sensor_id: id,
          source_type: 'DRILL_SIMULATION',
          event_type_ar: '[تمرين محاكاة تدريبي] رصد مؤشرات مسيرة محتملة عبر WiFi',
          event_type_en: '[Training Drill Simulation] Candidate Drone WiFi Indicators',
          indicator_type: evaluation.indicator_type,
          indicators: {
            ...evaluation.normalized_indicators,
            matched_factors: evaluation.matched_factors,
            single_indicator_capped: evaluation.single_indicator_capped,
          },
          probabilistic_score: evaluation.probabilistic_score,
          confidence_pct: evaluation.confidence_pct,
          severity: evaluation.severity,
          estimated_lat: Number(sensor.lat) + 0.0014,
          estimated_lng: Number(sensor.lng) + 0.0012,
          location_precision: 'ESTIMATED_ZONE',
        });
        broadcast('event:created', drillEvt, String(sensor.facility_id));
        writeAuditLog({
          user: req.user,
          action: 'DRILL_SIMULATION_TRIGGERED',
          targetType: 'EVENT',
          targetId: String((drillEvt as Record<string, unknown>).id),
          details: { score: evaluation.probabilistic_score, severity: evaluation.severity },
          ip: getClientIp(req),
        });
        const updatedSensor = db.prepare('SELECT * FROM sensors WHERE id = ?').get(id) as Record<string, unknown>;
        broadcast(
          'sensor:updated',
          { ...updatedSensor, sensor_token_hash: undefined, fault_log: JSON.parse(String(updatedSensor.fault_log || '[]')) },
          String(sensor.facility_id)
        );
        res.json({ event: drillEvt, evaluation });
        return;
      }

      const updatedSensor = db.prepare('SELECT * FROM sensors WHERE id = ?').get(id) as Record<string, unknown>;
      const payload = {
        ...updatedSensor,
        sensor_token_hash: undefined,
        fault_log: JSON.parse(String(updatedSensor.fault_log || '[]')),
      };
      broadcast('sensor:updated', payload, String(sensor.facility_id));
      const fac = db.prepare('SELECT * FROM facilities WHERE id = ?').get(String(sensor.facility_id));
      broadcast('facility:updated', fac, String(sensor.facility_id));
      res.json({ sensor: payload });
    }
  );

  // --- DETECTION EVENTS & TAMPER-EVIDENT CHAIN ---
  router.get('/events', authMiddleware, (req: AuthedRequest, res: Response) => {
    const all = db
      .prepare('SELECT * FROM detection_events ORDER BY created_at DESC LIMIT 200')
      .all() as Array<Record<string, unknown>>;
    const scoped = all
      .filter((e) => canAccessFacility(req.user!, String(e.facility_id)))
      .map((e) => ({
        ...e,
        indicators: JSON.parse(String(e.indicators_json || '{}')),
      }));
    res.json({ events: scoped });
  });

  router.get('/events/verify-chain', authMiddleware, (_req: AuthedRequest, res: Response) => {
    const all = db
      .prepare('SELECT * FROM detection_events ORDER BY created_at ASC, rowid ASC')
      .all() as Array<Record<string, unknown>>;
    let prev = 'GENESIS_RASAD_2026';
    let brokenAt: string | null = null;
    for (const ev of all) {
      const payload = {
        id: ev.id,
        facility_id: ev.facility_id,
        sensor_id: ev.sensor_id,
        source_type: ev.source_type,
        indicator_type: ev.indicator_type,
        probabilistic_score: ev.probabilistic_score,
        confidence_pct: ev.confidence_pct,
        severity: ev.severity,
        created_at: ev.created_at,
      };
      const expected = computeRecordHash(payload, prev);
      if (ev.prev_hash !== prev || ev.record_hash !== expected) {
        brokenAt = String(ev.id);
        break;
      }
      prev = String(ev.record_hash);
    }
    res.json({ valid: brokenAt === null, checked_count: all.length, broken_at: brokenAt });
  });

  router.post(
    '/events/:id/acknowledge',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'MONITORING_OFFICER', 'RESPONSE_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const ev = db.prepare('SELECT * FROM detection_events WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!ev) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      if (!canAccessFacility(req.user!, String(ev.facility_id))) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE detection_events SET status = CASE WHEN status = 'NEW' THEN 'ACKNOWLEDGED' ELSE status END, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?`
      ).run(req.user!.full_name_ar, now, id);

      writeAuditLog({
        user: req.user,
        action: 'ALERT_ACKNOWLEDGED',
        targetType: 'EVENT',
        targetId: id,
        details: { acknowledged_at: now },
        ip: getClientIp(req),
      });

      const updated = db.prepare('SELECT * FROM detection_events WHERE id = ?').get(id) as Record<string, unknown>;
      broadcast('event:updated', { ...updated, indicators: JSON.parse(String(updated.indicators_json || '{}')) }, String(ev.facility_id));
      res.json({ event: { ...updated, indicators: JSON.parse(String(updated.indicators_json || '{}')) } });
    }
  );

  router.post(
    '/events/:id/escalate',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'MONITORING_OFFICER', 'RESPONSE_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const ev = db.prepare('SELECT * FROM detection_events WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!ev) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      if (!canAccessFacility(req.user!, String(ev.facility_id))) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      const { reason } = req.body || {};
      db.prepare(`UPDATE detection_events SET status = 'ESCALATED' WHERE id = ?`).run(id);
      writeAuditLog({
        user: req.user,
        action: 'ALERT_ESCALATED_TO_HIGHER_AUTHORITY',
        targetType: 'EVENT',
        targetId: id,
        details: { reason: reason || 'Unacknowledged timeout / critical severity' },
        ip: getClientIp(req),
      });
      const updated = db.prepare('SELECT * FROM detection_events WHERE id = ?').get(id) as Record<string, unknown>;
      broadcast('event:updated', { ...updated, indicators: JSON.parse(String(updated.indicators_json || '{}')) }, String(ev.facility_id));
      res.json({ event: { ...updated, indicators: JSON.parse(String(updated.indicators_json || '{}')) } });
    }
  );

  router.patch(
    '/events/:id/status',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'RESPONSE_OFFICER', 'MONITORING_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const ev = db.prepare('SELECT * FROM detection_events WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!ev || !canAccessFacility(req.user!, String(ev.facility_id))) {
        res.status(403).json({ error: 'Not found or access denied' });
        return;
      }
      const { status, actions_taken_ar, actions_taken_en } = req.body || {};
      db.prepare(
        `UPDATE detection_events SET status = ?, actions_taken_ar = COALESCE(?, actions_taken_ar), actions_taken_en = COALESCE(?, actions_taken_en) WHERE id = ?`
      ).run(status ?? ev.status, actions_taken_ar ?? null, actions_taken_en ?? null, id);

      recomputeFacilityState(String(ev.facility_id));
      writeAuditLog({
        user: req.user,
        action: 'EVENT_STATUS_UPDATED',
        targetType: 'EVENT',
        targetId: id,
        details: { status },
        ip: getClientIp(req),
      });
      const updated = db.prepare('SELECT * FROM detection_events WHERE id = ?').get(id) as Record<string, unknown>;
      broadcast('event:updated', { ...updated, indicators: JSON.parse(String(updated.indicators_json || '{}')) }, String(ev.facility_id));
      res.json({ event: { ...updated, indicators: JSON.parse(String(updated.indicators_json || '{}')) } });
    }
  );

  // --- MANUAL REPORTS ("رصدت مسيرة") & OFFLINE SYNC ---
  router.get('/reports', authMiddleware, (req: AuthedRequest, res: Response) => {
    const all = db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all() as Array<
      Record<string, unknown>
    >;
    const scoped = all.filter((r) => canAccessFacility(req.user!, String(r.facility_id)));
    res.json({ reports: scoped });
  });

  function insertReportWithDedupe(user: SafeUser, body: Record<string, unknown>, ip: string) {
    const clientUuid = body.client_uuid ? String(body.client_uuid) : null;
    if (clientUuid) {
      const existing = db.prepare('SELECT * FROM reports WHERE client_uuid = ?').get(clientUuid);
      if (existing) return { report: existing, deduplicated: true };
    }

    const facilityId = String(body.facility_id || '');
    if (!canAccessFacility(user, facilityId)) {
      throw new Error('Forbidden facility');
    }

    const id = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const severity = (String(body.severity || 'HIGH').toUpperCase() as SeverityLevel);

    const linkedEvent = createDetectionEvent({
      facility_id: facilityId,
      sensor_id: null,
      source_type: 'MANUAL_REPORT',
      event_type_ar: 'بلاغ ميداني يدوي: رصدت مسيرة',
      event_type_en: 'Manual Field Report: Drone Sighted',
      indicator_type: 'MANUAL_SIGHTING',
      indicators: {
        location_desc: body.location_desc_ar || body.location_desc_en,
        description: body.description,
        reporter: user.full_name_ar,
      },
      probabilistic_score: severity === 'EMERGENCY' ? 85 : severity === 'HIGH' ? 68 : 45,
      confidence_pct: 65,
      severity,
      estimated_lat: body.lat !== undefined && body.lat !== null ? Number(body.lat) : null,
      estimated_lng: body.lng !== undefined && body.lng !== null ? Number(body.lng) : null,
      location_precision: 'REPORTER_PIN',
    }) as Record<string, unknown>;

    db.prepare(`
      INSERT INTO reports (
        id, client_uuid, facility_id, reporter_user_id, reporter_name, location_desc_ar, location_desc_en,
        lat, lng, event_date, event_time, description, severity, supervisor_notes, attachment_name, attachment_data,
        status, linked_event_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?)
    `).run(
      id,
      clientUuid,
      facilityId,
      user.id,
      user.full_name_ar,
      String(body.location_desc_ar || body.location_desc_en || 'محيط المنشأة'),
      String(body.location_desc_en || body.location_desc_ar || 'Facility Perimeter'),
      body.lat !== undefined && body.lat !== null ? Number(body.lat) : null,
      body.lng !== undefined && body.lng !== null ? Number(body.lng) : null,
      String(body.event_date || now.slice(0, 10)),
      String(body.event_time || now.slice(11, 16)),
      String(body.description || ''),
      severity,
      String(body.supervisor_notes || ''),
      body.attachment_name ? String(body.attachment_name) : null,
      body.attachment_data ? String(body.attachment_data) : null,
      String(linkedEvent.id),
      now,
      now
    );

    writeAuditLog({
      user,
      action: 'MANUAL_REPORT_SUBMITTED',
      targetType: 'REPORT',
      targetId: id,
      details: { facility_id: facilityId, severity, client_uuid: clientUuid },
      ip,
    });

    broadcast('event:created', linkedEvent, facilityId);
    const created = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    broadcast('report:created', created, facilityId);
    return { report: created, deduplicated: false };
  }

  router.post(
    '/reports',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'MONITORING_OFFICER', 'RESPONSE_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      try {
        const result = insertReportWithDedupe(req.user!, req.body || {}, getClientIp(req));
        res.status(result.deduplicated ? 200 : 201).json(result);
      } catch (err) {
        res.status(403).json({ error: (err as Error).message });
      }
    }
  );

  router.post(
    '/reports/sync',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'MONITORING_OFFICER', 'RESPONSE_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const results = [];
      for (const item of items) {
        try {
          const r = insertReportWithDedupe(req.user!, item, getClientIp(req));
          results.push({ client_uuid: item.client_uuid, status: r.deduplicated ? 'DEDUPLICATED' : 'SYNCED', report: r.report });
        } catch (err) {
          results.push({ client_uuid: item.client_uuid, status: 'FAILED', error: (err as Error).message });
        }
      }
      res.json({ results });
    }
  );

  router.patch(
    '/reports/:id',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'RESPONSE_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const rep = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!rep || !canAccessFacility(req.user!, String(rep.facility_id))) {
        res.status(403).json({ error: 'Not found or access denied' });
        return;
      }
      const { status, supervisor_notes } = req.body || {};
      const now = new Date().toISOString();
      db.prepare('UPDATE reports SET status = ?, supervisor_notes = ?, updated_at = ? WHERE id = ?').run(
        status ?? rep.status,
        supervisor_notes ?? rep.supervisor_notes,
        now,
        id
      );
      writeAuditLog({
        user: req.user,
        action: 'REPORT_UPDATED',
        targetType: 'REPORT',
        targetId: id,
        details: { status },
        ip: getClientIp(req),
      });
      const updated = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
      res.json({ report: updated });
    }
  );

  // --- EMERGENCY RESPONSE TASKS ---
  router.get('/responses', authMiddleware, (req: AuthedRequest, res: Response) => {
    const all = db.prepare('SELECT * FROM response_tasks ORDER BY created_at DESC').all() as Array<
      Record<string, unknown>
    >;
    const scoped = all
      .filter((t) => canAccessFacility(req.user!, String(t.facility_id)))
      .map((t) => ({
        ...t,
        safety_checklist: JSON.parse(String(t.safety_checklist_json || '[]')),
        actions_log: JSON.parse(String(t.actions_log_json || '[]')),
      }));
    res.json({ tasks: scoped });
  });

  router.post(
    '/responses',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'MONITORING_OFFICER', 'RESPONSE_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      const { event_id, facility_id, assigned_to_name, priority } = req.body || {};
      if (!event_id || !facility_id || !assigned_to_name) {
        res.status(400).json({ error: 'event_id, facility_id, and assigned_to_name required' });
        return;
      }
      if (!canAccessFacility(req.user!, String(facility_id))) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      const id = `rsp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();
      const defaultChecklist = [
        {
          id: 'chk-1',
          label_ar: 'الالتزام بمسافة الأمان الكهربائية وعدم الاقتراب من موصلات الجهد العالي',
          label_en: 'Maintain HV electrical safety clearance around energized conductors',
          checked: false,
        },
        {
          id: 'chk-2',
          label_ar: 'حماية الطاقم الميداني في موقع محصّن وتجنب محاولة إسقاط أي جسم يدوياً',
          label_en: 'Shelter field staff safely; never attempt physical interception or jamming',
          checked: false,
        },
        {
          id: 'chk-3',
          label_ar: 'تأكيد وضع تشغيل وحدات المحطة وإبلاغ مركز التحكم بالشبكة عند اللزوم',
          label_en: 'Verify substation operational status and notify Grid Dispatch if impacted',
          checked: false,
        },
        {
          id: 'chk-4',
          label_ar: 'توثيق المسار التقديري بصرياً وتسجيل وقت انتهاء النشاط',
          label_en: 'Visually document estimated flight bearing and record clearance timestamp',
          checked: false,
        },
      ];

      db.prepare(`
        INSERT INTO response_tasks (id, event_id, facility_id, assigned_to_user_id, assigned_to_name, priority, status, safety_checklist_json, actions_log_json, started_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?, ?, ?)
      `).run(
        id,
        String(event_id),
        String(facility_id),
        req.user!.id,
        String(assigned_to_name),
        String(priority || 'HIGH'),
        JSON.stringify(defaultChecklist),
        JSON.stringify([
          {
            timestamp: now,
            actor: req.user!.full_name_ar,
            note: 'تم إنشاء مهمة الاستجابة وتكليف الفريق الميداني',
          },
        ]),
        now,
        now
      );

      db.prepare(`UPDATE detection_events SET status = 'IN_PROGRESS' WHERE id = ?`).run(String(event_id));
      writeAuditLog({
        user: req.user,
        action: 'RESPONSE_TASK_CREATED',
        targetType: 'RESPONSE_TASK',
        targetId: id,
        details: { event_id, assigned_to_name },
        ip: getClientIp(req),
      });

      const created = db.prepare('SELECT * FROM response_tasks WHERE id = ?').get(id) as Record<string, unknown>;
      const payload = {
        ...created,
        safety_checklist: defaultChecklist,
        actions_log: JSON.parse(String(created.actions_log_json)),
      };
      broadcast('response:updated', payload, String(facility_id));
      res.status(201).json({ task: payload });
    }
  );

  router.patch(
    '/responses/:id',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'RESPONSE_OFFICER']),
    (req: AuthedRequest, res: Response) => {
      const { id } = req.params;
      const task = db.prepare('SELECT * FROM response_tasks WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined;
      if (!task || !canAccessFacility(req.user!, String(task.facility_id))) {
        res.status(403).json({ error: 'Not found or access denied' });
        return;
      }
      const { status, safety_checklist, action_note, escalated_to } = req.body || {};
      const now = new Date().toISOString();
      const logs = JSON.parse(String(task.actions_log_json || '[]'));
      if (action_note) {
        logs.push({ timestamp: now, actor: req.user!.full_name_ar, note: String(action_note) });
      }
      const nextStatus = status ?? task.status;
      const ackAt = nextStatus === 'ACKNOWLEDGED' && !task.acknowledged_at ? now : task.acknowledged_at;
      const compAt = nextStatus === 'CLOSED' ? now : task.completed_at;

      db.prepare(`
        UPDATE response_tasks SET status = ?, safety_checklist_json = ?, actions_log_json = ?, acknowledged_at = ?, completed_at = ?, escalated_to = COALESCE(?, escalated_to)
        WHERE id = ?
      `).run(
        nextStatus,
        safety_checklist ? JSON.stringify(safety_checklist) : task.safety_checklist_json,
        JSON.stringify(logs),
        ackAt,
        compAt,
        escalated_to ?? null,
        id
      );

      if (nextStatus === 'CLOSED') {
        db.prepare(`UPDATE detection_events SET status = 'CLOSED' WHERE id = ?`).run(String(task.event_id));
        recomputeFacilityState(String(task.facility_id));
      } else if (nextStatus === 'ESCALATED') {
        db.prepare(`UPDATE detection_events SET status = 'ESCALATED' WHERE id = ?`).run(String(task.event_id));
      }

      writeAuditLog({
        user: req.user,
        action: 'RESPONSE_TASK_UPDATED',
        targetType: 'RESPONSE_TASK',
        targetId: id,
        details: { status: nextStatus, action_note },
        ip: getClientIp(req),
      });

      const updated = db.prepare('SELECT * FROM response_tasks WHERE id = ?').get(id) as Record<string, unknown>;
      const payload = {
        ...updated,
        safety_checklist: JSON.parse(String(updated.safety_checklist_json || '[]')),
        actions_log: JSON.parse(String(updated.actions_log_json || '[]')),
      };
      broadcast('response:updated', payload, String(task.facility_id));
      res.json({ task: payload });
    }
  );

  // --- AI RISK INTELLIGENCE ---
  router.get('/ai/assessments', authMiddleware, (req: AuthedRequest, res: Response) => {
    const all = db.prepare('SELECT * FROM ai_assessments ORDER BY created_at DESC LIMIT 30').all() as Array<
      Record<string, unknown>
    >;
    const scoped = all
      .filter((a) => canAccessFacility(req.user!, String(a.facility_id)))
      .map((a) => ({
        ...a,
        recommended_actions_ar: JSON.parse(String(a.recommended_actions_ar || '[]')),
        recommended_actions_en: JSON.parse(String(a.recommended_actions_en || '[]')),
        baseline_comparison: JSON.parse(String(a.baseline_comparison_json || '{}')),
      }));
    res.json({ assessments: scoped });
  });

  router.post('/ai/analyze', authMiddleware, async (req: AuthedRequest, res: Response) => {
    const { facility_id, event_id } = req.body || {};
    if (!facility_id || !canAccessFacility(req.user!, String(facility_id))) {
      res.status(403).json({ error: 'Authorized facility_id required' });
      return;
    }
    try {
      const result = await analyzeFacilityRisk({ facility_id: String(facility_id), event_id: event_id || null });
      writeAuditLog({
        user: req.user,
        action: 'AI_RISK_ANALYSIS_RUN',
        targetType: 'FACILITY',
        targetId: String(facility_id),
        details: { provider: result.provider, risk_probability: result.risk_probability },
        ip: getClientIp(req),
      });
      res.json({ assessment: result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- AUDIT LOGS & ANALYTICS ---
  router.get(
    '/audit-logs',
    authMiddleware,
    requireRole(['ADMIN', 'FACILITY_MANAGER', 'MONITORING_OFFICER']),
    (_req: AuthedRequest, res: Response) => {
      const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all() as Array<
        Record<string, unknown>
      >;
      res.json({
        logs: logs.map((l) => ({
          ...l,
          details: JSON.parse(String(l.details_json || '{}')),
        })),
      });
    }
  );

  router.get('/analytics', authMiddleware, (req: AuthedRequest, res: Response) => {
    const range = String(req.query.range || 'monthly');
    const nowMs = Date.now();
    const cutoffMs =
      range === 'daily'
        ? nowMs - 24 * 3600_000
        : range === 'weekly'
        ? nowMs - 7 * 24 * 3600_000
        : nowMs - 30 * 24 * 3600_000;

    const allEvents = db.prepare('SELECT * FROM detection_events').all() as Array<Record<string, unknown>>;
    const scopedEvents = allEvents.filter(
      (e) =>
        canAccessFacility(req.user!, String(e.facility_id)) &&
        new Date(String(e.created_at)).getTime() >= cutoffMs
    );

    const allSensors = db.prepare('SELECT * FROM sensors').all() as Array<Record<string, unknown>>;
    const scopedSensors = allSensors.filter((s) => canAccessFacility(req.user!, String(s.facility_id)));

    const allResponses = db.prepare('SELECT * FROM response_tasks').all() as Array<Record<string, unknown>>;
    const scopedResponses = allResponses.filter((r) => canAccessFacility(req.user!, String(r.facility_id)));

    const bySeverity = {
      NORMAL: scopedEvents.filter((e) => e.severity === 'NORMAL').length,
      WARNING: scopedEvents.filter((e) => e.severity === 'WARNING').length,
      HIGH: scopedEvents.filter((e) => e.severity === 'HIGH').length,
      EMERGENCY: scopedEvents.filter((e) => e.severity === 'EMERGENCY').length,
    };

    const closedCount = scopedEvents.filter((e) => e.status === 'CLOSED').length;
    const openCount = scopedEvents.filter((e) => e.status !== 'CLOSED').length;

    const ackDurations = scopedEvents
      .filter((e) => e.acknowledged_at)
      .map((e) => (new Date(String(e.acknowledged_at)).getTime() - new Date(String(e.created_at)).getTime()) / 1000);
    const avgAckSec =
      ackDurations.length > 0
        ? Math.round(ackDurations.reduce((a, b) => a + b, 0) / ackDurations.length)
        : null;

    const completedDurations = scopedResponses
      .filter((r) => r.completed_at && r.started_at)
      .map((r) => (new Date(String(r.completed_at)).getTime() - new Date(String(r.started_at)).getTime()) / 60000);
    const avgResponseMin =
      completedDurations.length > 0
        ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length)
        : null;

    res.json({
      range,
      total_events: scopedEvents.length,
      by_severity: bySeverity,
      closed_events: closedCount,
      in_progress_events: openCount,
      alarms_issued: scopedEvents.filter((e) => e.severity === 'HIGH' || e.severity === 'EMERGENCY').length,
      avg_ack_seconds: avgAckSec,
      avg_response_minutes: avgResponseMin,
      sensors_connected: scopedSensors.filter((s) => s.connection_status === 'CONNECTED').length,
      sensors_total: scopedSensors.length,
    });
  });

  return router;
}
