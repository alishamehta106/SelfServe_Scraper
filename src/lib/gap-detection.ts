import type { GapFieldReport, GapReport, HotelStructured } from "@/lib/schema/hotel";

type PathSpec = {
  path: string;
  get: (h: HotelStructured) => unknown;
  isAmenityBool?: boolean;
};

const PATHS: PathSpec[] = [
  { path: "hotel_name", get: (h) => h.hotel_name },
  { path: "contact.phone", get: (h) => h.contact.phone },
  { path: "contact.email", get: (h) => h.contact.email },
  { path: "contact.address", get: (h) => h.contact.address },
  { path: "amenities.pool", get: (h) => h.amenities.pool, isAmenityBool: true },
  { path: "amenities.gym", get: (h) => h.amenities.gym, isAmenityBool: true },
  { path: "amenities.wifi", get: (h) => h.amenities.wifi, isAmenityBool: true },
  { path: "amenities.parking", get: (h) => h.amenities.parking, isAmenityBool: true },
  { path: "amenities.spa", get: (h) => h.amenities.spa, isAmenityBool: true },
  { path: "dining", get: (h) => h.dining },
  { path: "services", get: (h) => h.services },
  { path: "policies.check_in", get: (h) => h.policies.check_in },
  { path: "policies.check_out", get: (h) => h.policies.check_out },
  { path: "policies.pet_policy", get: (h) => h.policies.pet_policy },
  { path: "policies.cancellation_policy", get: (h) => h.policies.cancellation_policy },
  { path: "policies.smoking_policy", get: (h) => h.policies.smoking_policy },
  { path: "room_types", get: (h) => h.room_types },
  { path: "images", get: (h) => h.images },
];

function classifyString(
  value: string,
  confidence: number | undefined,
): GapFieldReport {
  const trimmed = value.trim();
  if (!trimmed) {
    return { status: "missing", confidence: confidence ?? 0 };
  }
  if (confidence !== undefined && confidence < 0.45) {
    return { status: "partial", confidence };
  }
  if (confidence !== undefined && confidence < 0.65) {
    return { status: "uncertain", confidence };
  }
  return { status: "complete", confidence: confidence ?? 0.7 };
}

function classifyAmenity(
  path: string,
  structured: HotelStructured,
  fieldConfidence: Record<string, number>,
): GapFieldReport {
  const conf = fieldConfidence[path] ?? 0;
  const key = path.split(".")[1] as keyof HotelStructured["amenities"];
  const present = structured.amenities[key];
  if (present && conf >= 0.5) {
    return { status: "complete", confidence: conf };
  }
  if (present && conf < 0.5) {
    return { status: "uncertain", confidence: conf };
  }
  if (!present && conf >= 0.55) {
    return {
      status: "complete",
      confidence: conf,
      note: "No positive keyword match for this amenity",
    };
  }
  if (!present && conf > 0.2 && conf < 0.55) {
    return { status: "uncertain", confidence: conf };
  }
  if (!present && conf <= 0.2) {
    return { status: "missing", confidence: conf };
  }
  return { status: "missing", confidence: conf };
}

function classifyDining(dining: HotelStructured["dining"]): GapFieldReport {
  if (!dining.length) return { status: "missing", confidence: 0 };
  const hasDetail = dining.some(
    (d) =>
      d.restaurant_name.trim() &&
      (d.hours.trim() || d.menu_items.length > 0),
  );
  if (hasDetail) return { status: "complete", confidence: 0.65 };
  if (dining.some((d) => d.restaurant_name.trim())) {
    return { status: "partial", confidence: 0.45 };
  }
  return { status: "missing", confidence: 0.2 };
}

function classifyList(
  path: string,
  arr: unknown[],
  fieldConfidence: Record<string, number>,
): GapFieldReport {
  const conf = fieldConfidence[path];
  if (arr.length > 0) {
    return {
      status: conf !== undefined && conf < 0.5 ? "partial" : "complete",
      confidence: conf ?? 0.7,
    };
  }
  if (conf !== undefined && conf > 0.25 && conf < 0.55) {
    return { status: "uncertain", confidence: conf };
  }
  return { status: "missing", confidence: conf ?? 0 };
}

export function detectGaps(
  structured: HotelStructured,
  fieldConfidence: Record<string, number>,
): { gapReport: GapReport; missingFields: string[] } {
  const gapReport: GapReport = {};
  const missingFields: string[] = [];

  for (const spec of PATHS) {
    const path = spec.path;
    let report: GapFieldReport;

    if (spec.isAmenityBool) {
      report = classifyAmenity(path, structured, fieldConfidence);
    } else if (path === "dining") {
      report = classifyDining(structured.dining);
    } else if (path === "services") {
      report = classifyList(path, structured.services, fieldConfidence);
    } else if (path === "room_types") {
      report = classifyList(path, structured.room_types, fieldConfidence);
    } else if (path === "images") {
      report = classifyList(path, structured.images, fieldConfidence);
    } else {
      const v = spec.get(structured);
      report = classifyString(String(v ?? ""), fieldConfidence[path]);
    }

    gapReport[path] = report;
    if (report.status === "missing" || report.status === "partial") {
      missingFields.push(path);
    }
  }

  return { gapReport, missingFields };
}
