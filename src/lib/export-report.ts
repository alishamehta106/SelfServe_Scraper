import type { GapReport, HotelStructured, ProvenanceEntry } from "@/lib/schema/hotel";

export type ExportFieldRow = {
  section: string;
  field: string;
  label: string;
  value: string;
  status: "filled" | "empty";
  source?: string;
  notes?: string;
};

export type ReadableExport = {
  document_version: "2.0";
  generated_at: string;
  workflow: {
    hotel_id: string;
    website_url: string;
    record_status: string;
    hotel_review_url: string;
    operator_dashboard_url?: string;
  };
  at_a_glance: {
    hotel_name: string;
    phone: string;
    email: string;
    address: string;
    contact_summary: string;
  };
  categories: Array<{
    id: string;
    title: string;
    summary_line: string;
    missing_in_category: string[];
    fields: Array<{
      key: string;
      label: string;
      value: string | boolean;
      status: "filled" | "empty";
      source?: string;
    }>;
  }>;
  dining: {
    summary: string;
    rows: HotelStructured["dining"];
  };
  images: {
    urls: string[];
    details: NonNullable<HotelStructured["metadata"]["image_details"]>;
    probe?: HotelStructured["metadata"]["image_probe"];
  };
  provenance_flat: Record<string, ProvenanceEntry<unknown>>;
};

function provSource(
  provenance: Record<string, ProvenanceEntry<unknown>>,
  key: string,
): string | undefined {
  const e = provenance[key];
  return e?.source;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function gapNote(gap: GapReport | undefined, path: string): string | undefined {
  const g = gap?.[path];
  if (!g) return undefined;
  const c = g.confidence !== undefined ? `scrape_confidence=${(g.confidence * 100).toFixed(0)}%` : "";
  return [g.status, c, g.note].filter(Boolean).join(" · ");
}

export function buildReadableExport(params: {
  hotelId: string;
  websiteUrl: string;
  status: string;
  reviewToken: string;
  operatorToken?: string | null;
  data: HotelStructured;
  gapReport?: GapReport;
  provenance?: Record<string, ProvenanceEntry<unknown>> | null;
}): ReadableExport {
  const { hotelId, websiteUrl, status, reviewToken, operatorToken, data, provenance } = params;

  const prov = (provenance ?? {}) as Record<string, ProvenanceEntry<unknown>>;

  const contactFilled = [data.contact.phone, data.contact.email, data.contact.address].filter(
    (x) => x.trim(),
  ).length;
  const contactSummary =
    contactFilled === 0
      ? "No contact details captured."
      : `${contactFilled} of 3 contact slots have text.`;

  const amenityLabels: Record<string, string> = {
    pool: "Pool",
    gym: "Gym / fitness",
    wifi: "Wi‑Fi",
    parking: "Parking",
    spa: "Spa",
  };

  const amenitiesMissing: string[] = [];
  const amenityFields = (Object.keys(data.amenities) as Array<keyof HotelStructured["amenities"]>).map(
    (k) => {
      const path = `amenities.${k}`;
      const v = data.amenities[k];
      const st = v ? "filled" : "empty";
      if (!v) amenitiesMissing.push(amenityLabels[k] ?? k);
      return {
        key: path,
        label: amenityLabels[k] ?? k,
        value: v,
        status: st as "filled" | "empty",
        source: provSource(prov, path),
      };
    },
  );

  const policyLabels: [keyof HotelStructured["policies"], string][] = [
    ["check_in", "Check-in time"],
    ["check_out", "Check-out time"],
    ["pet_policy", "Pet policy"],
    ["cancellation_policy", "Cancellation policy"],
    ["smoking_policy", "Smoking policy"],
  ];

  const policyMissing: string[] = [];
  const policyFields = policyLabels.map(([key, label]) => {
    const path = `policies.${key}`;
    const value = data.policies[key];
    const empty = !String(value).trim();
    if (empty) policyMissing.push(label);
    return {
      key: path,
      label,
      value: str(value),
      status: (empty ? "empty" : "filled") as "filled" | "empty",
      source: provSource(prov, path),
    };
  });

  const diningSummary =
    data.dining.length === 0
      ? "No dining venues captured."
      : `${data.dining.length} dining entr${data.dining.length === 1 ? "y" : "ies"}.`;

  const imageDetails = data.metadata.image_details ?? [];

  return {
    document_version: "2.0",
    generated_at: new Date().toISOString(),
    workflow: {
      hotel_id: hotelId,
      website_url: websiteUrl,
      record_status: status,
      hotel_review_url: `/review/${hotelId}/${reviewToken}`,
      ...(operatorToken
        ? { operator_dashboard_url: `/operator/${hotelId}/${operatorToken}` }
        : {}),
    },
    at_a_glance: {
      hotel_name: data.hotel_name || "(unnamed)",
      phone: data.contact.phone || "",
      email: data.contact.email || "",
      address: data.contact.address || "",
      contact_summary: contactSummary,
    },
    categories: [
      {
        id: "contact",
        title: "Contact",
        summary_line: contactSummary,
        missing_in_category: [
          !data.contact.phone.trim() ? "Phone" : "",
          !data.contact.email.trim() ? "Email" : "",
          !data.contact.address.trim() ? "Address" : "",
        ].filter(Boolean),
        fields: [
          {
            key: "contact.phone",
            label: "Phone",
            value: data.contact.phone,
            status: data.contact.phone.trim() ? "filled" : "empty",
            source: provSource(prov, "contact.phone"),
          },
          {
            key: "contact.email",
            label: "Email",
            value: data.contact.email,
            status: data.contact.email.trim() ? "filled" : "empty",
            source: provSource(prov, "contact.email"),
          },
          {
            key: "contact.address",
            label: "Address",
            value: data.contact.address,
            status: data.contact.address.trim() ? "filled" : "empty",
            source: provSource(prov, "contact.address"),
          },
        ],
      },
      {
        id: "amenities",
        title: "Amenities",
        summary_line:
          amenitiesMissing.length === 0
            ? "All amenity toggles are on (verify against reality)."
            : `Not indicated or off: ${amenitiesMissing.join(", ")}.`,
        missing_in_category: amenitiesMissing,
        fields: amenityFields,
      },
      {
        id: "services",
        title: "Services",
        summary_line:
          data.services.length === 0
            ? "No services list captured."
            : data.services.join("; "),
        missing_in_category: data.services.length ? [] : ["Entire services list"],
        fields: [
          {
            key: "services",
            label: "Services (combined)",
            value: data.services.join("\n"),
            status: data.services.length ? "filled" : "empty",
            source: provSource(prov, "services"),
          },
        ],
      },
      {
        id: "policies",
        title: "Policies",
        summary_line:
          policyMissing.length === 0 ? "All policy slots have text." : `Missing: ${policyMissing.join(", ")}.`,
        missing_in_category: policyMissing,
        fields: policyFields,
      },
      {
        id: "rooms",
        title: "Room types",
        summary_line:
          data.room_types.length === 0
            ? "No room types captured."
            : `${data.room_types.length} room type line(s).`,
        missing_in_category: data.room_types.length ? [] : ["Room types"],
        fields: [
          {
            key: "room_types",
            label: "Room types (combined)",
            value: data.room_types.join("\n"),
            status: data.room_types.length ? "filled" : "empty",
            source: provSource(prov, "room_types"),
          },
        ],
      },
    ],
    dining: {
      summary: diningSummary,
      rows: data.dining,
    },
    images: {
      urls: data.images,
      details: imageDetails,
      probe: data.metadata.image_probe,
    },
    provenance_flat: prov,
  };
}

export function exportToLongFormCsv(
  readable: ReadableExport,
  gapReport?: GapReport,
): string {
  const header = ["section", "field_key", "label", "value", "status", "source", "scrape_gap_notes"];
  const lines: string[][] = [header];

  const esc = (s: string) => {
    const needs = /[",\n]/.test(s);
    const t = s.replace(/"/g, '""');
    return needs ? `"${t}"` : t;
  };

  const push = (row: ExportFieldRow) => {
    lines.push([
      esc(row.section),
      esc(row.field),
      esc(row.label),
      esc(row.value),
      esc(row.status),
      esc(row.source ?? ""),
      esc(row.notes ?? ""),
    ]);
  };

  push({
    section: "AT_A_GLANCE",
    field: "hotel_name",
    label: "Hotel name",
    value: readable.at_a_glance.hotel_name,
    status: readable.at_a_glance.hotel_name === "(unnamed)" ? "empty" : "filled",
    source: provSource(readable.provenance_flat, "hotel_name"),
    notes: gapNote(gapReport, "hotel_name"),
  });
  push({
    section: "AT_A_GLANCE",
    field: "contact.phone",
    label: "Phone",
    value: readable.at_a_glance.phone,
    status: readable.at_a_glance.phone.trim() ? "filled" : "empty",
    source: provSource(readable.provenance_flat, "contact.phone"),
    notes: gapNote(gapReport, "contact.phone"),
  });
  push({
    section: "AT_A_GLANCE",
    field: "contact.email",
    label: "Email",
    value: readable.at_a_glance.email,
    status: readable.at_a_glance.email.trim() ? "filled" : "empty",
    source: provSource(readable.provenance_flat, "contact.email"),
    notes: gapNote(gapReport, "contact.email"),
  });
  push({
    section: "AT_A_GLANCE",
    field: "contact.address",
    label: "Address",
    value: readable.at_a_glance.address,
    status: readable.at_a_glance.address.trim() ? "filled" : "empty",
    source: provSource(readable.provenance_flat, "contact.address"),
    notes: gapNote(gapReport, "contact.address"),
  });

  lines.push([]);
  lines.push(["SECTION_HEADER", esc("— Categories —"), "", "", "", "", ""]);

  for (const cat of readable.categories) {
    lines.push([]);
    lines.push([
      "CATEGORY",
      esc(cat.id),
      esc(cat.title),
      esc(cat.summary_line),
      "",
      "",
      esc(cat.missing_in_category.join("; ")),
    ]);
    for (const f of cat.fields) {
      push({
        section: cat.title,
        field: f.key,
        label: f.label,
        value: typeof f.value === "boolean" ? (f.value ? "Yes" : "No") : String(f.value ?? ""),
        status: f.status,
        source: f.source,
        notes: gapNote(gapReport, f.key),
      });
    }
  }

  lines.push([]);
  lines.push(["SECTION_HEADER", esc("— Dining —"), "", "", "", "", ""]);
  readable.dining.rows.forEach((row, i) => {
    push({
      section: "Dining",
      field: `dining[${i}].restaurant_name`,
      label: `Restaurant ${i + 1} name`,
      value: row.restaurant_name,
      status: row.restaurant_name.trim() ? "filled" : "empty",
      source: provSource(readable.provenance_flat, "dining"),
      notes: gapNote(gapReport, "dining"),
    });
    push({
      section: "Dining",
      field: `dining[${i}].hours`,
      label: `Restaurant ${i + 1} hours`,
      value: row.hours,
      status: row.hours.trim() ? "filled" : "empty",
    });
    push({
      section: "Dining",
      field: `dining[${i}].menu_items`,
      label: `Restaurant ${i + 1} menu items`,
      value: row.menu_items.join(" | "),
      status: row.menu_items.length ? "filled" : "empty",
    });
  });

  lines.push([]);
  lines.push(["SECTION_HEADER", esc("— Images —"), "", "", "", "", ""]);
  readable.images.urls.forEach((u, i) => {
    const det = readable.images.details.find((d) => d.url === u);
    push({
      section: "Images",
      field: `images[${i}]`,
      label: `Image ${i + 1}`,
      value: u,
      status: u.trim() ? "filled" : "empty",
      notes: det ? `alt=${det.alt}; caption=${det.caption}` : "",
    });
  });

  if (readable.images.probe?.length) {
    lines.push([]);
    for (const p of readable.images.probe) {
      push({
        section: "Image probe",
        field: p.url,
        label: "Technical read",
        value: [p.format, p.width, p.height, p.bytes].filter(Boolean).join("×"),
        status: p.error ? "empty" : "filled",
        notes: p.error ?? "",
      });
    }
  }

  return lines.map((r) => r.join(",")).join("\n");
}
