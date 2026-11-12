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

export type SourceType = 'LIVE_SENSOR' | 'MANUAL_REPORT' | 'DRILL_SIMULATION';

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  full_name_ar: string;
  full_name_en: string;
  role: UserRole;
  authorized_facilities: string; // JSON array string
  biometric_enabled: number;
  biometric_credential_id: string | null;
  biometric_public_key: string | null;
  biometric_type?: string | null;
  biometric_device_label?: string | null;
  biometric_enrolled_at?: string | null;
  biometric_pin_hash?: string | null;
  active: number;
  last_login: string | null;
  created_at: string;
}

export interface SafeUser {
  id: string;
  username: string;
  full_name_ar: string;
  full_name_en: string;
  role: UserRole;
  authorized_facilities: string[];
  biometric_enabled: boolean;
  biometric_type?: string | null;
  biometric_device_label?: string | null;
  biometric_enrolled_at?: string | null;
  active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface WirelessIndicators {
  ssid_candidate?: string | null;
  mac_address_masked?: string | null;
  oui_vendor?: string | null;
  oui_trusted_match?: boolean;
  rssi_dbm?: number | null;
  rssi_delta_dbm?: number | null;
  packet_rate_pps?: number | null;
  baseline_pps?: number | null;
  channel?: number | null;
  video_control_pattern?: boolean;
  frame_anomaly?: string | null;
}

export interface FacilityRecord {
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

export interface SensorRecord {
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
  sensor_token_hash: string;
  fault_log: string; // JSON array
  created_at: string;
}
