import type { DetectionEvent, Facility, ManualReport, ResponseTask, SensorUnit } from '../types';

const SNAPSHOT_KEY = 'rasad_offline_snapshot_v1';
const QUEUE_KEY = 'rasad_offline_report_queue_v1';
const SYNC_LOG_KEY = 'rasad_offline_sync_log_v1';

export interface OfflineSnapshot {
  saved_at: string;
  facilities: Facility[];
  sensors: SensorUnit[];
  events: DetectionEvent[];
  reports: ManualReport[];
  responses: ResponseTask[];
}

export interface QueuedOfflineReport {
  client_uuid: string;
  facility_id: string;
  location_desc_ar: string;
  location_desc_en: string;
  lat: number | null;
  lng: number | null;
  event_date: string;
  event_time: string;
  description: string;
  severity: 'NORMAL' | 'WARNING' | 'HIGH' | 'EMERGENCY';
  supervisor_notes: string;
  attachment_name: string | null;
  attachment_data: string | null;
  queued_at: string;
}

export interface SyncLogItem {
  id: string;
  timestamp: string;
  client_uuid: string;
  facility_id: string;
  outcome: 'SYNCED' | 'DEDUPLICATED' | 'FAILED';
  detail: string;
}

export function saveOfflineSnapshot(snapshot: Omit<OfflineSnapshot, 'saved_at'>) {
  try {
    const payload: OfflineSnapshot = {
      ...snapshot,
      saved_at: new Date().toISOString(),
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadOfflineSnapshot(): OfflineSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OfflineSnapshot;
  } catch {
    return null;
  }
}

export function getQueuedReports(): QueuedOfflineReport[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOfflineReport[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineReport(item: QueuedOfflineReport): QueuedOfflineReport[] {
  const current = getQueuedReports();
  if (current.some((q) => q.client_uuid === item.client_uuid)) {
    return current;
  }
  const next = [item, ...current];
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  return next;
}

export function removeQueuedReport(clientUuid: string): QueuedOfflineReport[] {
  const next = getQueuedReports().filter((q) => q.client_uuid !== clientUuid);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  return next;
}

export function getSyncLog(): SyncLogItem[] {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    return raw ? (JSON.parse(raw) as SyncLogItem[]) : [];
  } catch {
    return [];
  }
}

export function appendSyncLog(entries: SyncLogItem[]): SyncLogItem[] {
  const current = getSyncLog();
  const next = [...entries, ...current].slice(0, 50);
  localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(next));
  return next;
}

export function clearOfflineCache() {
  localStorage.removeItem(SNAPSHOT_KEY);
  localStorage.removeItem(QUEUE_KEY);
  localStorage.removeItem(SYNC_LOG_KEY);
}
