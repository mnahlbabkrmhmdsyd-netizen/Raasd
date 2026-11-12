import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.ts';
import type { SeverityLevel, WirelessIndicators } from './types.ts';

const TRUSTED_OUI_TABLE: Record<string, string> = {
  '60:60:1F': 'SZ DJI Technology Co., Ltd',
  '34:D2:62': 'SZ DJI Technology Co., Ltd',
  '48:1C:B9': 'Autel Robotics Co., Ltd',
  'EC:5B:CD': 'Autel Robotics Co., Ltd',
  '90:3A:E6': 'Parrot SA',
  'A0:14:3D': 'Parrot SA',
  '00:12:1C': 'Parrot SA',
  'E4:7A:2C': 'Ryze Tech (Tello)',
};

const SUSPICIOUS_SSID_PATTERNS = [
  /^DJI[-_]/i,
  /^MAVIC[-_]/i,
  /^PHANTOM[-_]/i,
  /^FPV[-_]/i,
  /^TELLO[-_]/i,
  /^ANAFI[-_]/i,
  /^PARROT[-_]/i,
  /^AUTEL[-_]/i,
  /^SKY[-_]?CAM/i,
];

export interface ProbabilisticEvaluation {
  probabilistic_score: number;
  confidence_pct: number;
  severity: SeverityLevel;
  indicator_type: string;
  matched_factors: {
    factor_key: string;
    points: number;
    max_points: number;
    label_ar: string;
    label_en: string;
  }[];
  single_indicator_capped: boolean;
  normalized_indicators: WirelessIndicators;
}

export function lookupOuiVendor(macOrOui?: string | null): { vendor: string | null; matched: boolean } {
  if (!macOrOui) return { vendor: null, matched: false };
  const cleaned = macOrOui.trim().toUpperCase().replace(/-/g, ':');
  const prefix = cleaned.slice(0, 8);
  const vendor = TRUSTED_OUI_TABLE[prefix] ?? null;
  return { vendor, matched: Boolean(vendor) };
}

export function maskMacAddress(mac?: string | null): string | null {
  if (!mac) return null;
  const parts = mac.trim().toUpperCase().replace(/-/g, ':').split(':');
  if (parts.length < 3) return mac;
  if (parts.length === 6) {
    return `${parts[0]}:${parts[1]}:${parts[2]}:**:**:${parts[5]}`;
  }
  return `${parts.slice(0, 3).join(':')}:**:**`;
}

export function evaluateWirelessIndicators(input: WirelessIndicators): ProbabilisticEvaluation {
  const factors: ProbabilisticEvaluation['matched_factors'] = [];
  let activeSignals = 0;

  // 1. SSID Pattern Check (max 25 pts - never sufficient alone)
  const ssid = (input.ssid_candidate || '').trim();
  const ssidMatches = ssid.length > 0 && SUSPICIOUS_SSID_PATTERNS.some((rx) => rx.test(ssid));
  if (ssidMatches) {
    activeSignals += 1;
    factors.push({
      factor_key: 'SSID_PATTERN',
      points: 25,
      max_points: 25,
      label_ar: `تطابق نمط معرف شبكة محتمل (${ssid})`,
      label_en: `Candidate drone SSID pattern (${ssid})`,
    });
  }

  // 2. Trusted IEEE OUI / MAC Vendor Check (max 20 pts)
  const ouiCheck = lookupOuiVendor(input.mac_address_masked);
  const ouiMatched = Boolean(input.oui_trusted_match || ouiCheck.matched);
  const ouiVendor = input.oui_vendor || ouiCheck.vendor;
  if (ouiMatched && ouiVendor) {
    activeSignals += 1;
    factors.push({
      factor_key: 'OUI_MAC_MATCH',
      points: 20,
      max_points: 20,
      label_ar: `تطابق بادئة MAC مع قاعدة مصنّعين موثوقة (${ouiVendor})`,
      label_en: `Trusted IEEE OUI manufacturer match (${ouiVendor})`,
    });
  }

  // 3. Sudden RSSI Signal Jump (max 20 pts)
  const rssiDelta = typeof input.rssi_delta_dbm === 'number' ? input.rssi_delta_dbm : 0;
  if (rssiDelta >= 8) {
    activeSignals += 1;
    const pts = rssiDelta >= 15 ? 20 : 14;
    factors.push({
      factor_key: 'RSSI_ANOMALY',
      points: pts,
      max_points: 20,
      label_ar: `ارتفاع مفاجئ في قوة الإشارة (+${rssiDelta} dBm)`,
      label_en: `Sudden RSSI signal surge (+${rssiDelta} dBm)`,
    });
  }

  // 4. Packet Density & Burst Rate (max 15 pts)
  const pps = typeof input.packet_rate_pps === 'number' ? input.packet_rate_pps : 0;
  const baselinePps = typeof input.baseline_pps === 'number' && input.baseline_pps > 0 ? input.baseline_pps : 35;
  if (pps > baselinePps * 2.5 && pps >= 90) {
    activeSignals += 1;
    const pts = pps >= baselinePps * 5 ? 15 : 10;
    factors.push({
      factor_key: 'PACKET_BURST',
      points: pts,
      max_points: 15,
      label_ar: `كثافة حزم غير معتادة (${pps} حزمة/ث مقابل أساس ${baselinePps})`,
      label_en: `Elevated packet burst density (${pps} pps vs ${baselinePps} baseline)`,
    });
  }

  // 5. Video / Telemetry Control Frame Cadence Pattern (max 20 pts, passive metadata only)
  if (input.video_control_pattern) {
    activeSignals += 1;
    factors.push({
      factor_key: 'VIDEO_CONTROL_PATTERN',
      points: 20,
      max_points: 20,
      label_ar: 'نمط تتابع إطارات متسق مع بث فيديو أو تحكم عن بُعد (رصد سلبي للترويسة فقط)',
      label_en: 'Frame cadence consistent with telemetry/video stream (passive header timing only)',
    });
  }

  let rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  let singleIndicatorCapped = false;

  // Enforce non-single-indicator rule: a single indicator alone CANNOT trigger HIGH or EMERGENCY
  if (activeSignals <= 1 && rawScore > 38) {
    rawScore = 38;
    singleIndicatorCapped = true;
  }

  const probabilistic_score = Math.min(100, Math.max(0, rawScore));

  // Confidence depends on multi-indicator corroboration (not just score)
  let confidence_pct = 15;
  if (activeSignals === 1) confidence_pct = 32;
  else if (activeSignals === 2) confidence_pct = 58;
  else if (activeSignals === 3) confidence_pct = 76;
  else if (activeSignals >= 4) confidence_pct = 88;
  if (singleIndicatorCapped) {
    confidence_pct = Math.min(confidence_pct, 34);
  }

  let severity: SeverityLevel = 'NORMAL';
  if (probabilistic_score >= 75 && activeSignals >= 3) {
    severity = 'EMERGENCY';
  } else if (probabilistic_score >= 55 && activeSignals >= 2) {
    severity = 'HIGH';
  } else if (probabilistic_score >= 30) {
    severity = 'WARNING';
  }

  const indicator_type =
    activeSignals > 1
      ? 'MULTI_INDICATOR'
      : factors[0]?.factor_key || 'RSSI_ANOMALY';

  return {
    probabilistic_score,
    confidence_pct,
    severity,
    indicator_type,
    matched_factors: factors,
    single_indicator_capped: singleIndicatorCapped,
    normalized_indicators: {
      ...input,
      mac_address_masked: maskMacAddress(input.mac_address_masked),
      oui_vendor: ouiVendor,
      oui_trusted_match: ouiMatched,
    },
  };
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

export async function analyzeFacilityRisk(params: {
  facility_id: string;
  event_id?: string | null;
}) {
  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(params.facility_id) as
    | Record<string, unknown>
    | undefined;
  if (!facility) {
    throw new Error('Facility not found');
  }

  const recentEvents = db
    .prepare(
      `SELECT id, source_type, indicator_type, indicators_json, probabilistic_score, confidence_pct, severity, created_at
       FROM detection_events WHERE facility_id = ? ORDER BY created_at DESC LIMIT 25`
    )
    .all(params.facility_id) as Array<Record<string, unknown>>;

  const sensors = db
    .prepare('SELECT id, unit_code, connection_status, wifi_interface_status, service_status, last_seen_at FROM sensors WHERE facility_id = ?')
    .all(params.facility_id) as Array<Record<string, unknown>>;

  const targetEvent = params.event_id
    ? (db.prepare('SELECT * FROM detection_events WHERE id = ?').get(params.event_id) as Record<string, unknown> | undefined)
    : recentEvents[0];

  const connectedSensors = sensors.filter((s) => s.connection_status === 'CONNECTED').length;
  const totalHistorical = recentEvents.length;
  const avgScore =
    totalHistorical > 0
      ? Math.round(
          recentEvents.reduce((acc, e) => acc + Number(e.probabilistic_score || 0), 0) / totalHistorical
        )
      : 0;
  const highOrEmergCount = recentEvents.filter(
    (e) => e.severity === 'HIGH' || e.severity === 'EMERGENCY'
  ).length;

  const baselineComparison = {
    connected_sensors: connectedSensors,
    total_sensors: sensors.length,
    historical_events_analyzed: totalHistorical,
    baseline_avg_score: avgScore,
    high_or_emergency_count: highOrEmergCount,
    target_event_score: targetEvent ? Number(targetEvent.probabilistic_score || 0) : 0,
    methodology_note:
      'Statistical baseline comparison + rule-weighted multi-indicator heuristics (No proprietary pre-trained RF ML weights claimed).',
  };

  // Deterministic baseline evaluation (always computed)
  const targetScore = targetEvent ? Number(targetEvent.probabilistic_score || 0) : 0;
  const targetConf = targetEvent ? Number(targetEvent.confidence_pct || 0) : 0;
  let falseAlarmLikelihood = 'HIGH';
  if (targetScore >= 70 && targetConf >= 65) falseAlarmLikelihood = 'LOW';
  else if (targetScore >= 45 && targetConf >= 45) falseAlarmLikelihood = 'MODERATE';

  const fallbackResult = {
    provider: 'STATISTICAL_BASELINE',
    risk_probability: targetEvent ? targetScore : connectedSensors === 0 ? 0 : Math.min(25, avgScore),
    confidence_pct: targetEvent ? targetConf : connectedSensors === 0 ? 0 : 40,
    false_alarm_likelihood: targetEvent ? falseAlarmLikelihood : 'INSUFFICIENT_LIVE_DATA',
    reasoning_ar: targetEvent
      ? `تحليل إحصائي مبني على مقارنة الحدث المحدد (درجة الاحتمال ${targetScore}%، درجة الثقة ${targetConf}%) مع السجل المرجعي للمنشأة (${totalHistorical} أحداث سابقة بمتوسط ${avgScore}%). تقييم احتمالية الإنذار الكاذب: ${falseAlarmLikelihood === 'LOW' ? 'منخفضة لتعدد المؤشرات المتزامنة' : falseAlarmLikelihood === 'MODERATE' ? 'متوسطة وتستدعي التحقق البصري' : 'مرتفعة لعدم كفاية المؤشرات المتطابقة'}. ملاحظة منهجية: لا يدّعي النظام وجود نموذج تعلم عميق مدرب على بيانات طيف حية، بل يعتمد على أوزان احتمالية مفسرة ومقارنة مرجعية.`
      : connectedSensors === 0
      ? `لا توجد وحدات استشعار متصلة حالياً في ${facility.name_ar} ولا توجد أحداث مرصودة لتحليلها. لا يمكن إصدار تقييم تهديد حي دون اتصال وحدة الاستشعار، كما أن الرصد عبر WiFi لا يغطي المسيرات العاملة خارج نطاق WiFi.`
      : `النشاط اللاسلكي ضمن النطاق المرجعي الطبيعي في ${facility.name_ar} بناءً على ${connectedSensors} وحدة متصلة و${totalHistorical} سجل سابق.`,
    reasoning_en: targetEvent
      ? `Statistical baseline evaluation comparing event (${targetScore}% score, ${targetConf}% confidence) against facility history (${totalHistorical} prior records, avg ${avgScore}%). False-alarm likelihood: ${falseAlarmLikelihood}. Methodological transparency: no custom pre-trained RF deep-learning model is claimed; assessment uses deterministic multi-indicator weighting and historical delta comparison.`
      : connectedSensors === 0
      ? `No sensor units are currently connected at ${facility.name_en}, and no live events exist to evaluate. Live aerial risk cannot be inferred while sensors are offline, and WiFi monitoring cannot detect non-WiFi drone protocols.`
      : `Wireless activity remains within normal historical baseline at ${facility.name_en} across ${connectedSensors} connected sensor(s) and ${totalHistorical} prior events.`,
    recommended_actions_ar: targetEvent
      ? [
          'مراجعة تطابق المؤشرات اللاسلكية (SSID + OUI + RSSI) وعدم الاعتماد على مؤشر منفرد.',
          'التحقق البصري الميداني الآمن من محيط المنشأة وتأكيد موقع الحدث التقديري.',
          'توثيق الملاحظات في سجل الأحداث وإغلاق البلاغ أو تصعيده وفق سياسة الطوارئ.',
        ]
      : [
          'التأكد من تشغيل واتصال وحدات الاستشعار (Raspberry Pi + WiFi Monitor Mode) بالشبكة.',
          'الاستمرار في المراقبة الدورية وتفعيل البلاغات اليدوية «رصدت مسيرة» عند الحاجة.',
        ],
    recommended_actions_en: targetEvent
      ? [
          'Verify multi-indicator corroboration (SSID + OUI + RSSI) rather than relying on a single signal.',
          'Conduct safe visual perimeter verification around the estimated activity zone.',
          'Document findings in the tamper-evident event log and escalate or close per SOP.',
        ]
      : [
          'Ensure field Raspberry Pi + WiFi Monitor Mode sensor units are powered and connected.',
          'Maintain visual perimeter vigilance and use manual sighting reports if needed.',
        ],
  };

  const ai = getGeminiClient();
  let finalResult = fallbackResult;

  if (ai && targetEvent) {
    try {
      const prompt = `
You are an explainable Critical Infrastructure RF Risk Analyst inside RASAD (a passive WiFi-based drone indicator monitoring platform for electrical facilities).
STRICT HONESTY CONSTRAINTS:
- NEVER claim to be a custom-trained deep learning RF classifier or claim certainty of drone presence.
- WiFi Monitor Mode is passive and limited (cannot detect non-WiFi RF links like OcuSync/ELRS/900MHz).
- Estimated locations are probabilistic zones, not confirmed coordinates.
- Evaluate false-alarm likelihood rigorously (e.g., nearby consumer WiFi devices, spoofing, or single-indicator noise).

Facility: ${facility.name_en} (${facility.type})
Connected Sensors: ${connectedSensors}/${sensors.length}
Historical Event Count: ${totalHistorical}, Historical Avg Score: ${avgScore}
Target Event:
- Source Type: ${targetEvent.source_type}
- Indicator Type: ${targetEvent.indicator_type}
- Probabilistic Score: ${targetEvent.probabilistic_score}/100
- Confidence: ${targetEvent.confidence_pct}%
- Indicators Payload: ${targetEvent.indicators_json}

Return a structured JSON risk intelligence assessment in both Arabic and English.`;

      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                risk_probability: { type: Type.INTEGER },
                confidence_pct: { type: Type.INTEGER },
                false_alarm_likelihood: { type: Type.STRING },
                reasoning_ar: { type: Type.STRING },
                reasoning_en: { type: Type.STRING },
                recommended_actions_ar: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                recommended_actions_en: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
            },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout after 8000ms')), 8000)
        ),
      ]);

      const parsed = JSON.parse((response.text ?? '{}').trim());
      if (parsed && typeof parsed.reasoning_ar === 'string' && typeof parsed.reasoning_en === 'string') {
        finalResult = {
          provider: 'EXPLAINABLE_AI_ENGINE',
          risk_probability: Math.min(100, Math.max(0, Number(parsed.risk_probability ?? targetScore))),
          confidence_pct: Math.min(100, Math.max(0, Number(parsed.confidence_pct ?? targetConf))),
          false_alarm_likelihood: String(parsed.false_alarm_likelihood || falseAlarmLikelihood),
          reasoning_ar: parsed.reasoning_ar,
          reasoning_en: parsed.reasoning_en,
          recommended_actions_ar: Array.isArray(parsed.recommended_actions_ar)
            ? parsed.recommended_actions_ar
            : fallbackResult.recommended_actions_ar,
          recommended_actions_en: Array.isArray(parsed.recommended_actions_en)
            ? parsed.recommended_actions_en
            : fallbackResult.recommended_actions_en,
        };
      }
    } catch (err) {
      console.warn('Gemini AI reasoning fallback to statistical baseline:', (err as Error).message);
    }
  }

  const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO ai_assessments (id, facility_id, event_id, provider, risk_probability, confidence_pct, false_alarm_likelihood, reasoning_ar, reasoning_en, recommended_actions_ar, recommended_actions_en, baseline_comparison_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.facility_id,
    targetEvent ? String(targetEvent.id) : null,
    finalResult.provider,
    finalResult.risk_probability,
    finalResult.confidence_pct,
    finalResult.false_alarm_likelihood,
    finalResult.reasoning_ar,
    finalResult.reasoning_en,
    JSON.stringify(finalResult.recommended_actions_ar),
    JSON.stringify(finalResult.recommended_actions_en),
    JSON.stringify(baselineComparison),
    now
  );

  return {
    id,
    facility_id: params.facility_id,
    event_id: targetEvent ? String(targetEvent.id) : null,
    ...finalResult,
    baseline_comparison: baselineComparison,
    created_at: now,
  };
}
