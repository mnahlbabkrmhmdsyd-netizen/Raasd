import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Building2,
  Layers,
  MapPin,
  Radio,
  AlertTriangle,
  WifiOff,
  Info,
  LocateFixed,
  Compass,
  X,
} from 'lucide-react';
import type { DetectionEvent, Facility, Language, ManualReport, SensorUnit } from '../types';
import { SEVERITY_META, formatDateTime, t } from '../i18n';

export type RegionKey = 'SUDAN' | 'KHARTOUM' | 'MEROWE' | 'KARIMA' | 'NORTHERN' | 'FACILITY';

interface FacilityMapProps {
  lang: Language;
  facility: Facility;
  allFacilities?: Facility[];
  sensors: SensorUnit[];
  allSensors?: SensorUnit[];
  events: DetectionEvent[];
  reports: ManualReport[];
  showCoverage?: boolean;
  showBlindZones?: boolean;
  defaultRegion?: RegionKey;
  heightClass?: string;
  onSelectFacility?: (facilityId: string) => void;
}

type SelectedItem =
  | { kind: 'facility'; data: Facility }
  | { kind: 'sensor'; data: SensorUnit }
  | { kind: 'event'; data: DetectionEvent }
  | { kind: 'report'; data: ManualReport };

const SUDAN_BOUNDS: L.LatLngBoundsExpression = [
  [8.8, 21.8],
  [22.2, 38.6],
];

// Geographic outline of Sudan for clear visual framing on the real Leaflet map
const SUDAN_BORDER_COORDS: L.LatLngExpression[] = [
  [22.0, 25.0],
  [22.0, 31.3],
  [22.0, 36.9],
  [20.2, 37.2],
  [18.2, 38.4],
  [17.0, 36.8],
  [14.2, 36.5],
  [12.3, 35.2],
  [10.8, 34.4],
  [9.8, 33.8],
  [10.2, 31.8],
  [9.4, 29.0],
  [9.6, 26.8],
  [10.5, 24.5],
  [11.0, 22.8],
  [12.8, 21.9],
  [15.8, 22.8],
  [19.5, 24.0],
  [20.0, 25.0],
];

// National HV Grid Corridor linking Khartoum -> Merowe -> Karima -> Northern State
const SUDAN_GRID_CORRIDOR: L.LatLngExpression[] = [
  [15.588, 32.5342], // Khartoum National Control
  [15.635, 32.553],  // Khartoum North Power Plant
  [17.7, 32.35],     // Nile Corridor Relay
  [18.6708, 32.0511], // Merowe Dam Hydro
  [18.5544, 31.8492], // Karima Substation
  [18.925, 31.18],   // Northern State Corridor
];

const SUDAN_PRESETS: Array<{
  key: RegionKey;
  ar: string;
  en: string;
  lat: number;
  lng: number;
  zoom: number;
}> = [
  { key: 'SUDAN', ar: 'خريطة السودان', en: 'Sudan Map', lat: 16.0, lng: 30.2, zoom: 5 },
  { key: 'MEROWE', ar: 'مروي', en: 'Merowe', lat: 18.6708, lng: 32.0511, zoom: 13 },
  { key: 'KARIMA', ar: 'كريمة', en: 'Karima', lat: 18.5544, lng: 31.8492, zoom: 13 },
  { key: 'NORTHERN', ar: 'الولاية الشمالية', en: 'Northern State', lat: 18.78, lng: 31.65, zoom: 8 },
  { key: 'KHARTOUM', ar: 'الخرطوم', en: 'Khartoum', lat: 15.605, lng: 32.543, zoom: 12 },
];

export const FacilityMap: React.FC<FacilityMapProps> = ({
  lang,
  facility,
  allFacilities,
  sensors,
  allSensors,
  events,
  reports,
  showCoverage = true,
  showBlindZones = true,
  defaultRegion = 'SUDAN',
  heightClass = 'h-[440px]',
  onSelectFacility,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const disposedRef = useRef(false);

  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street');
  const [activeRegion, setActiveRegion] = useState<RegionKey>(defaultRegion);
  const [tileError, setTileError] = useState(false);
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  const isMapAlive = (map: L.Map | null): map is L.Map => {
    if (!map || disposedRef.current) return false;
    const internal = map as unknown as { _mapPane?: HTMLElement; _container?: HTMLElement };
    return Boolean(internal._mapPane && internal._container && internal._container.isConnected);
  };

  const facilitiesToRender = allFacilities && allFacilities.length > 0 ? allFacilities : [facility];
  const sensorsToRender =
    activeRegion === 'FACILITY'
      ? sensors
      : allSensors && allSensors.length > 0
      ? allSensors
      : sensors;

  const connectedSensors = sensorsToRender.filter((s) => s.connection_status === 'CONNECTED');
  const relevantEvents =
    activeRegion === 'FACILITY'
      ? events.filter((e) => e.facility_id === facility.id && e.status !== 'CLOSED')
      : events.filter((e) => e.status !== 'CLOSED');
  const relevantReports =
    activeRegion === 'FACILITY'
      ? reports.filter((r) => r.facility_id === facility.id)
      : reports;

  // Initialize Leaflet Map centered on Sudan (zoomAnimation disabled to prevent Leaflet unmount _leaflet_pos race)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    disposedRef.current = false;

    const map = L.map(container, {
      center: defaultRegion === 'FACILITY' ? [facility.lat, facility.lng] : [15.8, 30.2],
      zoom: defaultRegion === 'FACILITY' ? 14 : 6,
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });

    const overlays = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    overlayGroupRef.current = overlays;

    const rafId = requestAnimationFrame(() => {
      if (!isMapAlive(map)) return;
      try {
        map.invalidateSize({ animate: false, pan: false });
        if (defaultRegion === 'SUDAN') {
          map.fitBounds(SUDAN_BOUNDS, { padding: [18, 18], animate: false });
        }
      } catch {
        // Ignore if container detached before initial frame
      }
    });

    const resizeObs = new ResizeObserver(() => {
      if (!isMapAlive(map)) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        map.invalidateSize({ animate: false, pan: false });
      } catch {
        // Ignore resize error during teardown
      }
    });
    resizeObs.observe(container);

    return () => {
      disposedRef.current = true;
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      try {
        map.stop();
        map.off();
        map.remove();
      } catch {
        // Ignore teardown errors if pane was already detached
      }
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      overlayGroupRef.current = null;
    };
  }, []);

  // Switch tile base layer (Street OSM vs Satellite Esri)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!isMapAlive(map)) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    setTileError(false);

    const url =
      mapStyle === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const attribution =
      mapStyle === 'satellite' ? 'Esri World Imagery' : '&copy; OpenStreetMap contributors';

    const layer = L.tileLayer(url, {
      maxZoom: 19,
      attribution,
    });

    layer.on('tileerror', () => {
      if (!disposedRef.current) {
        setTileError(true);
      }
    });

    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [mapStyle]);

  // Only zoom into a facility automatically if the user specifically chose FACILITY focus mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!isMapAlive(map) || activeRegion !== 'FACILITY') return;
    map.stop();
    map.setView([facility.lat, facility.lng], 14, { animate: false });
  }, [facility.id, facility.lat, facility.lng, activeRegion]);

  const jumpToRegion = (key: RegionKey) => {
    const map = mapInstanceRef.current;
    setActiveRegion(key);
    if (!isMapAlive(map)) return;
    map.stop();
    if (key === 'SUDAN') {
      map.fitBounds(SUDAN_BOUNDS, { padding: [18, 18], animate: false });
      return;
    }
    if (key === 'FACILITY') {
      map.setView([facility.lat, facility.lng], 14, { animate: false });
      return;
    }
    const preset = SUDAN_PRESETS.find((p) => p.key === key);
    if (preset) {
      map.setView([preset.lat, preset.lng], preset.zoom, { animate: false });
    }
  };

  // Render Sudan National Border, Transmission Corridor, Facilities, Coverage, Sensors & Events
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = overlayGroupRef.current;
    if (!isMapAlive(map) || !group) return;
    group.clearLayers();

    // 0. Sudan geographic outline + National Transmission Corridor
    L.polygon(SUDAN_BORDER_COORDS, {
      color: '#E05252',
      weight: 2,
      dashArray: '8 6',
      fillColor: '#E05252',
      fillOpacity: 0.03,
      interactive: false,
    }).addTo(group);

    L.polyline(SUDAN_GRID_CORRIDOR, {
      color: '#1E293B',
      weight: 2.5,
      dashArray: '6 4',
      opacity: 0.75,
    })
      .bindTooltip(
        t(
          lang,
          'الخط الناقل القومي: الخرطوم — مروي — كريمة — الولاية الشمالية',
          'Sudan National HV Grid Backbone: Khartoum — Merowe — Karima — Northern State'
        ),
        { sticky: true }
      )
      .addTo(group);

    // 1. Facilities outer perimeter rings & HQ markers
    facilitiesToRender.forEach((fac) => {
      const isFocused = fac.id === facility.id;

      if (showBlindZones && (isFocused || activeRegion !== 'FACILITY')) {
        L.circle([fac.lat, fac.lng], {
          radius: fac.coverage_radius_m,
          color: isFocused ? '#E05252' : '#64748B',
          weight: isFocused ? 2 : 1.5,
          dashArray: '6 6',
          fillColor: isFocused ? '#E05252' : '#94A3B8',
          fillOpacity: isFocused ? 0.09 : 0.05,
        })
          .bindTooltip(
            t(
              lang,
              `${fac.name_ar} — نطاق المحيط / مناطق غير مغطاة`,
              `${fac.name_en} — Outer Perimeter / Uncovered Zone`
            ),
            { sticky: true }
          )
          .addTo(group);
      }

      const shortLabel = lang === 'ar' ? fac.name_ar.split('—')[1]?.trim() || fac.code : fac.code;
      const hqIcon = L.divIcon({
        className: 'rasad-div-icon',
        iconSize: [110, 34],
        iconAnchor: [55, 17],
        html: `<div style="padding:4px 9px;border-radius:10px;background:${
          isFocused ? '#E05252' : '#111827'
        };border:2px solid #ffffff;color:#ffffff;display:inline-flex;align-items:center;justify-content:center;gap:5px;font-weight:800;font-size:11px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.3);">${shortLabel}</div>`,
      });
      const hqMarker = L.marker([fac.lat, fac.lng], { icon: hqIcon });
      hqMarker.on('click', () => setSelected({ kind: 'facility', data: fac }));
      hqMarker.bindTooltip(lang === 'ar' ? fac.name_ar : fac.name_en);
      hqMarker.addTo(group);
    });

    // 2. Sensor coverage radii (solid green when CONNECTED, dashed gray when DISCONNECTED)
    if (showCoverage) {
      sensorsToRender.forEach((sensor) => {
        const isConn = sensor.connection_status === 'CONNECTED';
        L.circle([sensor.lat, sensor.lng], {
          radius: sensor.coverage_radius_m,
          color: isConn ? '#16A34A' : '#94A3B8',
          weight: 2,
          dashArray: isConn ? undefined : '5 5',
          fillColor: isConn ? '#16A34A' : '#94A3B8',
          fillOpacity: isConn ? 0.14 : 0.06,
        }).addTo(group);
      });
    }

    // 3. Estimated Activity Zones (NEVER drawn as a confirmed pinpoint location)
    relevantEvents.forEach((ev) => {
      const targetFac = facilitiesToRender.find((f) => f.id === ev.facility_id) || facility;
      const lat = ev.estimated_lat ?? targetFac.lat;
      const lng = ev.estimated_lng ?? targetFac.lng;
      const meta = SEVERITY_META[ev.severity];
      const isEst = ev.location_precision === 'ESTIMATED_ZONE';

      const zoneCircle = L.circle([lat, lng], {
        radius: isEst ? 220 : 85,
        color: meta.hex,
        weight: 2.5,
        dashArray: '7 5',
        fillColor: meta.hex,
        fillOpacity: 0.18,
      });

      zoneCircle.on('click', () => setSelected({ kind: 'event', data: ev }));
      zoneCircle.bindTooltip(
        isEst
          ? t(lang, 'نطاق نشاط تقديري (غير مؤكد)', 'Estimated Activity Zone (Unconfirmed)')
          : t(lang, 'موقع البلاغ المسجل', 'Reported Location')
      );
      zoneCircle.addTo(group);
    });

    // 4. Actual Sensor Unit Markers
    sensorsToRender.forEach((sensor) => {
      const isConn = sensor.connection_status === 'CONNECTED';
      const bg = isConn ? '#16A34A' : '#64748B';
      const senIcon = L.divIcon({
        className: 'rasad-div-icon',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html: `<div style="width:26px;height:26px;border-radius:8px;background:${bg};border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.25);"><div style="width:7px;height:7px;border-radius:9999px;background:#ffffff;"></div></div>`,
      });
      const marker = L.marker([sensor.lat, sensor.lng], { icon: senIcon });
      marker.on('click', () => setSelected({ kind: 'sensor', data: sensor }));
      marker.bindTooltip(
        `${sensor.unit_code} · ${
          isConn ? t(lang, 'متصلة', 'Connected') : t(lang, 'غير متصلة', 'Disconnected')
        }`
      );
      marker.addTo(group);
    });

    // 5. Manual Reporter Pins
    relevantReports.forEach((rep, idx) => {
      const targetFac = facilitiesToRender.find((f) => f.id === rep.facility_id) || facility;
      const lat = rep.lat ?? targetFac.lat + 0.0008 * (idx + 1);
      const lng = rep.lng ?? targetFac.lng - 0.001 * (idx + 1);
      const repIcon = L.divIcon({
        className: 'rasad-div-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#EA580C;border:2.5px solid #ffffff;color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;box-shadow:0 3px 8px rgba(0,0,0,0.25);">!</div>`,
      });
      const marker = L.marker([lat, lng], { icon: repIcon });
      marker.on('click', () => setSelected({ kind: 'report', data: rep }));
      marker.bindTooltip(t(lang, 'بلاغ ميداني: رصدت مسيرة', 'Field Report: Drone Sighted'));
      marker.addTo(group);
    });
  }, [
    facility,
    facilitiesToRender,
    sensorsToRender,
    relevantEvents,
    relevantReports,
    showCoverage,
    showBlindZones,
    activeRegion,
    lang,
  ]);

  return (
    <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden">
      {/* Map Status Header */}
      <div className="px-5 py-3.5 bg-[#F6F7F9] border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
          <Building2 className="w-4 h-4 text-[#E05252]" />
          <span>
            {activeRegion === 'SUDAN'
              ? t(lang, 'خريطة جمهورية السودان — الشبكة القومية للكهرباء', 'Republic of Sudan — National Power Grid Map')
              : lang === 'ar'
              ? facility.name_ar
              : facility.name_en}
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono text-xs text-slate-600 tabular-nums">
            {activeRegion === 'SUDAN'
              ? `${facilitiesToRender.length} ${t(lang, 'مؤسسات', 'Facilities')}`
              : `${facility.lat.toFixed(4)}, ${facility.lng.toFixed(4)}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
            <button
              type="button"
              onClick={() => setMapStyle('street')}
              className={`px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                mapStyle === 'street' ? 'bg-[#E05252] text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t(lang, 'خريطة الشوارع', 'Street Map')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMapStyle('satellite')}
              className={`px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                mapStyle === 'satellite' ? 'bg-[#E05252] text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>{t(lang, 'أقمار صناعية', 'Satellite')}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => jumpToRegion('FACILITY')}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 inline-flex items-center gap-1.5"
          >
            <LocateFixed className="w-3.5 h-3.5 text-[#E05252]" />
            <span>{t(lang, 'تمركز بالمحطة', 'Focus Facility')}</span>
          </button>
        </div>
      </div>

      {/* Sudan Region Quick-Jump Bar */}
      <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 me-1">
          <Compass className="w-4 h-4 text-[#E05252]" />
          <span>{t(lang, 'نطاق السودان:', 'Sudan Regions:')}</span>
        </span>
        {SUDAN_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => jumpToRegion(p.key)}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
              activeRegion === p.key
                ? 'bg-[#E05252] text-white border-[#E05252]'
                : 'bg-[#F6F7F9] text-slate-800 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {lang === 'ar' ? p.ar : p.en}
          </button>
        ))}
        <button
          type="button"
          onClick={() => jumpToRegion('FACILITY')}
          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
            activeRegion === 'FACILITY'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
          }`}
        >
          {t(lang, 'المؤسسة النشطة', 'Active Facility')}
        </button>
      </div>

      {/* Map Legend */}
      <div className="px-5 py-2 bg-[#F6F7F9]/60 border-b border-slate-200 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" />
          {t(lang, 'موقع استشعار فعلي (متصل)', 'Actual Sensor (Connected)')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-slate-500 inline-block" />
          {t(lang, 'استشعار غير متصل', 'Sensor Disconnected')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-600 inline-block" />
          {t(lang, 'موقع مُبلّغ يدوي', 'Reporter Pin')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-dashed border-[#E05252] inline-block" />
          {t(lang, 'حدود السودان ونطاقات النشاط التقديرية', 'Sudan Borders & Estimated Zones')}
        </span>
      </div>

      {/* Offline Sensor Honesty Warning */}
      {connectedSensors.length === 0 && (
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2.5 text-xs sm:text-sm font-bold text-amber-900">
          <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            {t(
              lang,
              'تنبيه الموثوقية: لا توجد وحدات استشعار متصلة حالياً في هذا النطاق — التغطية الحية متوقفة والمناطق الموضحة غير مراقبة فعلياً.',
              'Monitoring Integrity Notice: No sensors are currently connected in this view — live RF coverage is inactive.'
            )}
          </span>
        </div>
      )}

      {tileError && (
        <div className="px-5 py-2 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700">
          {t(
            lang,
            'تعذر تحميل بلاطات الخريطة الجغرافية (قد يكون الاتصال مقطوعاً) — حدود السودان والإحداثيات ونطاقات التغطية تبقى نشطة.',
            'Map tiles unavailable (offline or blocked) — Sudan boundaries, coordinates, and markers remain interactive.'
          )}
        </div>
      )}

      {/* Real Geographical Map Viewport */}
      <div className={`relative w-full ${heightClass} bg-slate-100`}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Interactive Inspector Card */}
        {selected && (
          <div className="absolute bottom-4 start-4 end-4 sm:end-auto sm:w-96 bg-white border border-slate-200 rounded-xl p-4 shadow-lg z-[1000]">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                {selected.kind === 'sensor' && <Radio className="w-4 h-4 text-[#E05252]" />}
                {selected.kind === 'facility' && <Building2 className="w-4 h-4 text-slate-800" />}
                {selected.kind === 'event' && <AlertTriangle className="w-4 h-4 text-[#E05252]" />}
                {selected.kind === 'report' && <MapPin className="w-4 h-4 text-orange-600" />}
                <span>
                  {selected.kind === 'facility' &&
                    (lang === 'ar' ? selected.data.name_ar : selected.data.name_en)}
                  {selected.kind === 'sensor' &&
                    `${selected.data.unit_code} — ${
                      lang === 'ar' ? selected.data.name_ar : selected.data.name_en
                    }`}
                  {selected.kind === 'event' &&
                    (lang === 'ar' ? selected.data.event_type_ar : selected.data.event_type_en)}
                  {selected.kind === 'report' &&
                    t(lang, 'بلاغ ميداني: رصدت مسيرة', 'Field Report: Drone Sighted')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selected.kind === 'sensor' && (
              <div className="text-xs space-y-1.5 text-slate-700">
                <div>
                  <span className="font-bold">{t(lang, 'تصنيف الموقع:', 'Position Type:')}</span>{' '}
                  {t(lang, 'الموقع الفعلي المثبت لوحدة الاستشعار', 'Actual fixed sensor installation')}
                </div>
                <div>
                  <span className="font-bold">{t(lang, 'الحالة:', 'Status:')}</span>{' '}
                  {selected.data.connection_status === 'CONNECTED'
                    ? t(lang, 'متصلة (رصد سلبي نشط)', 'Connected (Active passive scan)')
                    : t(lang, 'غير متصلة (لا توجد مراقبة)', 'Disconnected (No live monitoring)')}
                </div>
                <div className="font-mono text-slate-500">
                  {selected.data.lat.toFixed(5)}, {selected.data.lng.toFixed(5)} · R=
                  {selected.data.coverage_radius_m}m
                </div>
              </div>
            )}

            {selected.kind === 'event' && (
              <div className="text-xs space-y-1.5 text-slate-700">
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {selected.data.location_precision === 'ESTIMATED_ZONE'
                      ? t(
                          lang,
                          'موقع تقديري تقريبي بناءً على RSSI — ليس موقعاً مؤكداً.',
                          'Estimated probabilistic zone from RSSI — not a confirmed location.'
                        )
                      : t(lang, 'الموقع المسجل من قِبل مقدم البلاغ.', 'Location recorded by field reporter.')}
                  </span>
                </div>
                <div>
                  <span className="font-bold">
                    {t(lang, 'الاحتمال / الثقة:', 'Score / Confidence:')}
                  </span>{' '}
                  <span className="font-mono tabular-nums">
                    {selected.data.probabilistic_score}% / {selected.data.confidence_pct}%
                  </span>
                </div>
                <div>{formatDateTime(selected.data.created_at, lang)}</div>
              </div>
            )}

            {selected.kind === 'report' && (
              <div className="text-xs space-y-1.5 text-slate-700">
                <div>
                  <span className="font-bold">{t(lang, 'المبلّغ:', 'Reporter:')}</span>{' '}
                  {selected.data.reporter_name}
                </div>
                <div>{selected.data.description}</div>
                <div className="text-slate-500">
                  {selected.data.event_date} · {selected.data.event_time}
                </div>
              </div>
            )}

            {selected.kind === 'facility' && (
              <div className="text-xs space-y-2 text-slate-700">
                <div className="font-bold text-slate-900">
                  {lang === 'ar' ? selected.data.region_ar : selected.data.region_en}
                </div>
                <div>{lang === 'ar' ? selected.data.notes_ar : selected.data.notes_en}</div>
                <div className="font-mono text-slate-500">
                  {selected.data.lat.toFixed(4)}, {selected.data.lng.toFixed(4)}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectFacility && selected.data.id !== facility.id) {
                        onSelectFacility(selected.data.id);
                      }
                      jumpToRegion('FACILITY');
                      setSelected(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#E05252] hover:bg-[#D14242] text-white font-bold text-xs"
                  >
                    {t(lang, 'تحديد وتقريب الموقع', 'Select & Zoom In')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
