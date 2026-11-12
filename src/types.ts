export type Language = 'ar' | 'en';

export type UserRole =
  | 'ADMIN'
  | 'FACILITY_MANAGER'
  | 'MONITORING_OFFICER'
  | 'RESPONSE_OFFICER'
  | 'VIEWER';

export type SeverityLevel = 'NORMAL' | 'WARNING' | 'HIGH' | 'EMERGENCY';

export type FacilityType =
  | 'GENERATION_PLANT'
  | 'SUBSTATION'
  | 'TRANSMISSION_TOWERS'
  | 'CONTROL_INFRASTRUCTURE';

export type NavSection =
  | 'overview'
  | 'command'
  | 'map'
  | 'facilities'
  | 'detection'
  | 'alerts'
  | 'reports'
  | 'events'
  | 'coverage'
  | 'ai'
  | 'response'
  | 'sensors'
  | 'analytics'
  | 'users'
  | 'settings';

export interface SafeUser {
  id: string;
  username: string;
  full_name_ar: string;
  full_name_en: string;
  role: UserRole;
  authorized_facilities: string[];
  biometric_enabled: boolean;
  biometric_type?: 'WEBAUTHN' | 'DEVICE_PASSKEY' | string | null;
  biometric_device_label?: string | null;
  biometric_enrolled_at?: string | null;
  active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface Facility {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  type: FacilityType;
  lat: number;
  lng: number;
  region_ar: string;
  region_en: string;
  coverage_radius_m: number;
  monitoring_status: 'ACTIVE' | 'DEGRADED' | 'OFFLINE';
  risk_level: SeverityLevel;
  notes_ar: string;
  notes_en: string;
  created_at: string;
}

export interface SensorFault {
  timestamp: string;
  code: string;
  message_ar: string;
  message_en: string;
}

export interface SensorUnit {
  id: string;
  facility_id: string;
  unit_code: string;
  name_ar: string;
  name_en: string;
  hardware_spec: string;
  interface_name: string;
  lat: number;
  lng: number;
  coverage_radius_m: number;
  connection_status: 'CONNECTED' | 'DISCONNECTED' | 'MAINTENANCE';
  wifi_interface_status: 'MONITOR_ACTIVE' | 'DOWN' | 'STANDBY';
  service_status: 'SCAPY_RUNNING' | 'STOPPED' | 'ERROR';
  power_status: 'AC_MAINS_OK' | 'BATTERY_BACKUP' | 'LOW_POWER' | 'UNKNOWN';
  power_pct: number | null;
  last_seen_at: string | null;
  fault_log: SensorFault[];
  created_at: string;
}

export interface DetectionEvent {
  id: string;
  facility_id: string;
  sensor_id: string | null;
  source_type: 'LIVE_SENSOR' | 'MANUAL_REPORT' | 'DRILL_SIMULATION';
  event_type_ar: string;
  event_type_en: string;
  indicator_type: string;
  indicators: Record<string, unknown>;
  probabilistic_score: number;
  confidence_pct: number;
  severity: SeverityLevel;
  estimated_lat: number | null;
  estimated_lng: number | null;
  location_precision: 'ESTIMATED_ZONE' | 'REPORTER_PIN' | 'SENSOR_ACTUAL';
  status: 'NEW' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'ESCALATED' | 'CLOSED';
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  actions_taken_ar: string;
  actions_taken_en: string;
  prev_hash: string;
  record_hash: string;
  created_at: string;
}

export interface ManualReport {
  id: string;
  client_uuid?: string | null;
  facility_id: string;
  reporter_user_id: string;
  reporter_name: string;
  location_desc_ar: string;
  location_desc_en: string;
  lat: number | null;
  lng: number | null;
  event_date: string;
  event_time: string;
  description: string;
  severity: SeverityLevel;
  supervisor_notes: string;
  attachment_name: string | null;
  attachment_data: string | null;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'DISPATCHED' | 'CLOSED';
  linked_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResponseChecklistItem {
  id: string;
  label_ar: string;
  label_en: string;
  checked: boolean;
}

export interface ResponseTask {
  id: string;
  event_id: string;
  facility_id: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string;
  priority: SeverityLevel;
  status: 'ASSIGNED' | 'ACKNOWLEDGED' | 'ON_SITE' | 'ESCALATED' | 'CLOSED';
  safety_checklist: ResponseChecklistItem[];
  actions_log: { timestamp: string; actor: string; note: string }[];
  acknowledged_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  escalated_to: string | null;
  created_at: string;
}

export interface AIAssessment {
  id: string;
  facility_id: string;
  event_id: string | null;
  provider: string;
  risk_probability: number;
  confidence_pct: number;
  false_alarm_likelihood: string;
  reasoning_ar: string;
  reasoning_en: string;
  recommended_actions_ar: string[];
  recommended_actions_en: string[];
  baseline_comparison: {
    connected_sensors: number;
    total_sensors: number;
    historical_events_analyzed: number;
    baseline_avg_score: number;
    high_or_emergency_count: number;
    target_event_score: number;
    methodology_note: string;
  };
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_username: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

export interface AnalyticsSummary {
  range: string;
  total_events: number;
  by_severity: Record<SeverityLevel, number>;
  closed_events: number;
  in_progress_events: number;
  alarms_issued: number;
  avg_ack_seconds: number | null;
  avg_response_minutes: number | null;
  sensors_connected: number;
  sensors_total: number;
}

export interface AppSettings {
  language: Language;
  selectedFacilityId: string;
  alarmEnabled: boolean;
  alarmVolume: number;
  alarmRepeats: number;
  autoEscalateSeconds: number;
  browserNotifications: boolean;
  inactivityMinutes: number;
  offlineSimulation: boolean;
  mapShowCoverage: boolean;
  mapShowBlindZones: boolean;
}
