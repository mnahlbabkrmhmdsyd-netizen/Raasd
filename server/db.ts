import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import type { SafeUser, UserRecord } from './types.ts';

const DB_PATH = path.resolve(process.cwd(), 'rasad.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function computeRecordHash(payload: Record<string, unknown>, prevHash: string): string {
  const canonical = JSON.stringify(payload) + '|' + prevHash;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function sanitizeUser(u: UserRecord): SafeUser {
  let authFacilities: string[] = [];
  try {
    authFacilities = JSON.parse(u.authorized_facilities || '[]');
  } catch {
    authFacilities = [];
  }
  return {
    id: u.id,
    username: u.username,
    full_name_ar: u.full_name_ar,
    full_name_en: u.full_name_en,
    role: u.role,
    authorized_facilities: authFacilities,
    biometric_enabled: Boolean(u.biometric_enabled),
    biometric_type: u.biometric_type ?? null,
    biometric_device_label: u.biometric_device_label ?? null,
    biometric_enrolled_at: u.biometric_enrolled_at ?? null,
    active: Boolean(u.active),
    last_login: u.last_login,
    created_at: u.created_at,
  };
}

function seedSudanInfrastructure(now: string) {
  const insertFacility = db.prepare(`
    INSERT INTO facilities (id, code, name_ar, name_en, type, lat, lng, region_ar, region_en, coverage_radius_m, monitoring_status, risk_level, notes_ar, notes_en, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertFacility.run(
    'fac-merowe-dam',
    'MRW-HYDRO-01',
    'سد مروي ومحطة التوليد المائية — مروي',
    'Merowe Dam & Hydro Power Plant — Merowe',
    'GENERATION_PLANT',
    18.6708,
    32.0511,
    'الولاية الشمالية — محلية مروي',
    'Northern State — Merowe Locality',
    1500,
    'OFFLINE',
    'NORMAL',
    'محطة التوليد الكهرومائية الرئيسية بسد مروي بقدرة 1250 ميجاواط المغذية للشبكة القومية السودانية.',
    'Primary 1250MW hydroelectric generation complex at Merowe Dam feeding the Sudan national grid.',
    now
  );
  insertFacility.run(
    'fac-karima-sub',
    'KRM-SUB-220',
    'المحطة التحويلية الرئيسية — كريمة',
    'Karima Primary Switching Substation (220kV)',
    'SUBSTATION',
    18.5544,
    31.8492,
    'الولاية الشمالية — مدينة كريمة',
    'Northern State — Karima City',
    950,
    'OFFLINE',
    'NORMAL',
    'محطة تحويل 220 ك.ف حيوية تربط توليد مروي بأحمال كريمة والولاية الشمالية.',
    'Critical 220kV substation interconnecting Merowe generation to Karima and Northern State loads.',
    now
  );
  insertFacility.run(
    'fac-north-corridor',
    'NTH-TRN-500',
    'مسار أبراج النقل 500 ك.ف — الولاية الشمالية',
    'Northern State 500kV Transmission Corridor',
    'TRANSMISSION_TOWERS',
    18.925,
    31.18,
    'الولاية الشمالية (مروي – كريمة – دنقلا)',
    'Northern State (Merowe – Karima – Dongola)',
    1800,
    'OFFLINE',
    'NORMAL',
    'ممر خطوط النقل فائقة الجهد بالولاية الشمالية؛ يتطلب رصداً موزعاً لتقليص المناطق العمياء.',
    'Extra-high-voltage corridor across Northern State requiring distributed nodes to minimize blind zones.',
    now
  );
  insertFacility.run(
    'fac-khartoum-gen',
    'KRT-GEN-01',
    'محطة توليد الكهرباء الحرارية — الخرطوم بحري / قري',
    'Khartoum North / Garri Power Generation Plant',
    'GENERATION_PLANT',
    15.635,
    32.553,
    'ولاية الخرطوم — قطاع التوليد الشمالي',
    'Khartoum State — Northern Generation Sector',
    1200,
    'OFFLINE',
    'NORMAL',
    'منشأة توليد رئيسية تغذي ولاية الخرطوم والمناطق الصناعية والمرافق الاستراتيجية.',
    'Major thermal power plant supplying Khartoum State critical urban and industrial loads.',
    now
  );
  insertFacility.run(
    'fac-khartoum-ctrl',
    'KRT-NGC-02',
    'مركز التحكم القومي للشبكة الكهربائية — الخرطوم',
    'National Grid Control Center (SCADA) — Khartoum',
    'CONTROL_INFRASTRUCTURE',
    15.588,
    32.5342,
    'ولاية الخرطوم — وسط الخرطوم',
    'Khartoum State — Central Khartoum',
    950,
    'OFFLINE',
    'NORMAL',
    'مركز التحكم الإشرافي القومي SCADA وإدارة استقرار الشبكة الكهربائية السودانية.',
    'National SCADA supervisory control and grid protection dispatch headquarters in Khartoum.',
    now
  );

  const insertSensor = db.prepare(`
    INSERT INTO sensors (id, facility_id, unit_code, name_ar, name_en, hardware_spec, interface_name, lat, lng, coverage_radius_m, connection_status, wifi_interface_status, service_status, power_status, power_pct, last_seen_at, sensor_token_hash, fault_log, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertSensor.run(
    'sen-pi-01',
    'fac-merowe-dam',
    'RASAD-PI-01',
    'وحدة استشعار جسم سد مروي والمدخل الغربي',
    'Merowe Dam West Intake RF Sensor',
    'Raspberry Pi 5 + Alfa AWUS036ACH (Monitor Mode) + Python 3 / Scapy',
    'wlan1mon',
    18.6725,
    32.0495,
    520,
    'DISCONNECTED',
    'DOWN',
    'STOPPED',
    'UNKNOWN',
    null,
    null,
    hashToken('RASAD-PI-01-TOKEN'),
    JSON.stringify([
      {
        timestamp: now,
        code: 'NO_HEARTBEAT',
        message_ar: 'لم تتصل وحدة الاستشعار بالخادم المركزي بعد. المراقبة الحية غير نشطة في هذه المنطقة.',
        message_en: 'Sensor unit has not yet connected to central server. Live monitoring is inactive in this zone.',
      },
    ]),
    now
  );
  insertSensor.run(
    'sen-pi-02',
    'fac-merowe-dam',
    'RASAD-PI-02',
    'وحدة استشعار ساحة التوربينات — مروي',
    'Merowe Turbine Hall East RF Sensor',
    'Raspberry Pi 4B + USB WiFi Monitor Mode + Python 3 / Scapy',
    'wlan1mon',
    18.6688,
    32.0542,
    500,
    'DISCONNECTED',
    'DOWN',
    'STOPPED',
    'UNKNOWN',
    null,
    null,
    hashToken('RASAD-PI-02-TOKEN'),
    JSON.stringify([
      {
        timestamp: now,
        code: 'NO_HEARTBEAT',
        message_ar: 'الوحدة في انتظار التشغيل الميداني والاتصال عبر WebSocket.',
        message_en: 'Unit awaiting field power-up and WebSocket telemetry uplink.',
      },
    ]),
    now
  );
  insertSensor.run(
    'sen-pi-03',
    'fac-karima-sub',
    'RASAD-PI-03',
    'وحدة استشعار المحطة التحويلية — كريمة',
    'Karima 220kV Substation Perimeter Sensor',
    'Raspberry Pi 4B + USB WiFi Monitor Mode + Python 3 / Scapy',
    'wlan1mon',
    18.5551,
    31.8504,
    460,
    'DISCONNECTED',
    'DOWN',
    'STOPPED',
    'UNKNOWN',
    null,
    null,
    hashToken('RASAD-PI-03-TOKEN'),
    JSON.stringify([]),
    now
  );
  insertSensor.run(
    'sen-pi-04',
    'fac-north-corridor',
    'RASAD-PI-04',
    'وحدة استشعار أبراج النقل — الولاية الشمالية',
    'Northern State 500kV Corridor Solar Node',
    'Raspberry Pi Zero 2 W + Solar Backup + USB WiFi Monitor Mode',
    'wlan1mon',
    18.9262,
    31.1815,
    560,
    'DISCONNECTED',
    'DOWN',
    'STOPPED',
    'UNKNOWN',
    null,
    null,
    hashToken('RASAD-PI-04-TOKEN'),
    JSON.stringify([]),
    now
  );
  insertSensor.run(
    'sen-pi-05',
    'fac-khartoum-gen',
    'RASAD-PI-05',
    'وحدة استشعار محطة التوليد — الخرطوم بحري',
    'Khartoum North Power Plant Roof Sensor',
    'Raspberry Pi 5 + Dual-Band USB WiFi Monitor Mode + Scapy',
    'wlan1mon',
    15.6362,
    32.5518,
    500,
    'DISCONNECTED',
    'DOWN',
    'STOPPED',
    'UNKNOWN',
    null,
    null,
    hashToken('RASAD-PI-05-TOKEN'),
    JSON.stringify([]),
    now
  );
  insertSensor.run(
    'sen-pi-06',
    'fac-khartoum-ctrl',
    'RASAD-PI-06',
    'وحدة استشعار مركز التحكم القومي — الخرطوم',
    'Khartoum National Dispatch Roof Sensor',
    'Raspberry Pi 5 + Dual-Band USB WiFi Monitor Mode + Scapy',
    'wlan1mon',
    15.5892,
    32.5355,
    480,
    'DISCONNECTED',
    'DOWN',
    'STOPPED',
    'UNKNOWN',
    null,
    null,
    hashToken('RASAD-PI-06-TOKEN'),
    JSON.stringify([]),
    now
  );
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name_ar TEXT NOT NULL,
      full_name_en TEXT NOT NULL,
      role TEXT NOT NULL,
      authorized_facilities TEXT NOT NULL DEFAULT '[]',
      biometric_enabled INTEGER NOT NULL DEFAULT 0,
      biometric_credential_id TEXT,
      biometric_public_key TEXT,
      biometric_type TEXT,
      biometric_device_label TEXT,
      biometric_enrolled_at TEXT,
      biometric_pin_hash TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS facilities (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      type TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      region_ar TEXT NOT NULL,
      region_en TEXT NOT NULL,
      coverage_radius_m INTEGER NOT NULL DEFAULT 800,
      monitoring_status TEXT NOT NULL DEFAULT 'OFFLINE',
      risk_level TEXT NOT NULL DEFAULT 'NORMAL',
      notes_ar TEXT NOT NULL DEFAULT '',
      notes_en TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sensors (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL,
      unit_code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      hardware_spec TEXT NOT NULL,
      interface_name TEXT NOT NULL DEFAULT 'wlan1mon',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      coverage_radius_m INTEGER NOT NULL DEFAULT 450,
      connection_status TEXT NOT NULL DEFAULT 'DISCONNECTED',
      wifi_interface_status TEXT NOT NULL DEFAULT 'DOWN',
      service_status TEXT NOT NULL DEFAULT 'STOPPED',
      power_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      power_pct INTEGER,
      last_seen_at TEXT,
      sensor_token_hash TEXT NOT NULL,
      fault_log TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS detection_events (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL,
      sensor_id TEXT,
      source_type TEXT NOT NULL,
      event_type_ar TEXT NOT NULL,
      event_type_en TEXT NOT NULL,
      indicator_type TEXT NOT NULL,
      indicators_json TEXT NOT NULL,
      probabilistic_score INTEGER NOT NULL,
      confidence_pct INTEGER NOT NULL,
      severity TEXT NOT NULL,
      estimated_lat REAL,
      estimated_lng REAL,
      location_precision TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW',
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      actions_taken_ar TEXT NOT NULL DEFAULT '',
      actions_taken_en TEXT NOT NULL DEFAULT '',
      prev_hash TEXT NOT NULL,
      record_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      client_uuid TEXT UNIQUE,
      facility_id TEXT NOT NULL,
      reporter_user_id TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      location_desc_ar TEXT NOT NULL,
      location_desc_en TEXT NOT NULL,
      lat REAL,
      lng REAL,
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      supervisor_notes TEXT NOT NULL DEFAULT '',
      attachment_name TEXT,
      attachment_data TEXT,
      status TEXT NOT NULL DEFAULT 'SUBMITTED',
      linked_event_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS response_tasks (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      assigned_to_user_id TEXT,
      assigned_to_name TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ASSIGNED',
      safety_checklist_json TEXT NOT NULL DEFAULT '[]',
      actions_log_json TEXT NOT NULL DEFAULT '[]',
      acknowledged_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      escalated_to TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES detection_events(id) ON DELETE CASCADE,
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_assessments (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL,
      event_id TEXT,
      provider TEXT NOT NULL,
      risk_probability INTEGER NOT NULL,
      confidence_pct INTEGER NOT NULL,
      false_alarm_likelihood TEXT NOT NULL,
      reasoning_ar TEXT NOT NULL,
      reasoning_en TEXT NOT NULL,
      recommended_actions_ar TEXT NOT NULL,
      recommended_actions_en TEXT NOT NULL,
      baseline_comparison_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      actor_username TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL
    );
  `);

  // Ensure newer biometric metadata columns exist on pre-existing databases
  const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has('biometric_type')) {
    db.exec('ALTER TABLE users ADD COLUMN biometric_type TEXT');
  }
  if (!colNames.has('biometric_device_label')) {
    db.exec('ALTER TABLE users ADD COLUMN biometric_device_label TEXT');
  }
  if (!colNames.has('biometric_enrolled_at')) {
    db.exec('ALTER TABLE users ADD COLUMN biometric_enrolled_at TEXT');
  }
  if (!colNames.has('biometric_pin_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN biometric_pin_hash TEXT');
  }

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (userCount.c === 0) {
    const now = new Date().toISOString();
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name_ar, full_name_en, role, authorized_facilities, biometric_enabled, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    insertUser.run(
      'usr-admin-01',
      'admin',
      bcrypt.hashSync('RasadAdmin#2026', 10),
      'م. طارق المنصور — المسؤول الرئيسي',
      'Eng. Tariq Al-Mansour — System Admin',
      'ADMIN',
      JSON.stringify(['*']),
      0,
      now
    );
    insertUser.run(
      'usr-mgr-01',
      'fmanager',
      bcrypt.hashSync('RasadMgr#2026', 10),
      'م. سارة عبدالله — مسؤولة قطاع مروي وكريمة',
      'Eng. Sarah Abdallah — Merowe & Karima Manager',
      'FACILITY_MANAGER',
      JSON.stringify(['fac-merowe-dam', 'fac-karima-sub']),
      0,
      now
    );
    insertUser.run(
      'usr-mon-01',
      'monitor',
      bcrypt.hashSync('RasadMon#2026', 10),
      'أحمد عثمان — مسؤول المراقبة',
      'Ahmed Osman — Monitoring Officer',
      'MONITORING_OFFICER',
      JSON.stringify(['fac-merowe-dam', 'fac-karima-sub', 'fac-khartoum-gen']),
      0,
      now
    );
    insertUser.run(
      'usr-resp-01',
      'responder',
      bcrypt.hashSync('RasadResp#2026', 10),
      'خالد بابكر — مسؤول الاستجابة للطوارئ',
      'Khalid Babiker — Response Officer',
      'RESPONSE_OFFICER',
      JSON.stringify([
        'fac-merowe-dam',
        'fac-karima-sub',
        'fac-north-corridor',
        'fac-khartoum-gen',
        'fac-khartoum-ctrl',
      ]),
      0,
      now
    );
    insertUser.run(
      'usr-view-01',
      'viewer',
      bcrypt.hashSync('RasadView#2026', 10),
      'نورة الحسن — مستخدم مشاهدة',
      'Noura Al-Hassan — Viewer',
      'VIEWER',
      JSON.stringify(['fac-merowe-dam', 'fac-khartoum-gen']),
      0,
      now
    );

    seedSudanInfrastructure(now);

    db.prepare(`
      INSERT INTO audit_logs (id, actor_user_id, actor_username, actor_role, action, target_type, target_id, details_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'aud-init-01',
      null,
      'SYSTEM',
      'SYSTEM',
      'SYSTEM_INITIALIZED',
      'DATABASE',
      'rasad.db',
      JSON.stringify({ region: 'Sudan (Khartoum, Northern State, Karima, Merowe)', facilities_seeded: 5, sensors_seeded: 6, users_seeded: 5 }),
      'localhost',
      now
    );
  } else {
    // Migrate existing legacy placeholder facility coordinates to Sudan (Khartoum, Northern State, Karima, Merowe)
    const legacyCheck = db
      .prepare(`SELECT COUNT(*) as c FROM facilities WHERE id IN ('fac-gen-north', 'fac-sub-c14', 'fac-twr-400', 'fac-ctrl-west')`)
      .get() as { c: number };

    if (legacyCheck.c > 0) {
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        db.exec('DELETE FROM response_tasks; DELETE FROM detection_events; DELETE FROM reports; DELETE FROM sensors; DELETE FROM facilities;');
        seedSudanInfrastructure(now);

        db.prepare('UPDATE users SET authorized_facilities = ? WHERE username = ?').run(
          JSON.stringify(['fac-merowe-dam', 'fac-karima-sub']),
          'fmanager'
        );
        db.prepare('UPDATE users SET authorized_facilities = ? WHERE username = ?').run(
          JSON.stringify(['fac-merowe-dam', 'fac-karima-sub', 'fac-khartoum-gen']),
          'monitor'
        );
        db.prepare('UPDATE users SET authorized_facilities = ? WHERE username = ?').run(
          JSON.stringify([
            'fac-merowe-dam',
            'fac-karima-sub',
            'fac-north-corridor',
            'fac-khartoum-gen',
            'fac-khartoum-ctrl',
          ]),
          'responder'
        );
        db.prepare('UPDATE users SET authorized_facilities = ? WHERE username = ?').run(
          JSON.stringify(['fac-merowe-dam', 'fac-khartoum-gen']),
          'viewer'
        );
      });
      tx();
    }
  }
}
