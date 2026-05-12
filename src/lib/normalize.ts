import type { HotelStructured, ProvenanceEntry } from "@/lib/schema/hotel";

function normPhone(input: string): string {
  const d = input.replace(/[^\d+]/g, "");
  if (d.length < 10) return input.trim();
  return input.replace(/\s+/g, " ").trim();
}

function normTime(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/\ba\.m\./gi, "AM")
    .replace(/\bp\.m\./gi, "PM")
    .trim();
}

function pickStr(scraped: string, staff: string): string {
  return staff.trim() !== "" ? staff.trim() : scraped.trim();
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

function mergeLabeledContacts(
  primary: string,
  scraped: HotelStructured["contact"]["phones"],
  staff: HotelStructured["contact"]["phones"],
): HotelStructured["contact"]["phones"] {
  const seen = new Set<string>();
  const out: HotelStructured["contact"]["phones"] = [];
  for (const entry of [
    { label: "Primary", value: primary, note: "" },
    ...(staff ?? []),
    ...(scraped ?? []),
  ]) {
    const value = entry.value.trim();
    if (!value) continue;
    const key = value.toLowerCase().replace(/\D/g, "") || value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: entry.label.trim() || "Contact", value, note: entry.note.trim() });
  }
  return out;
}

function mergeLabeledAddresses(
  primary: string,
  scraped: HotelStructured["contact"]["addresses"],
  staff: HotelStructured["contact"]["addresses"],
): HotelStructured["contact"]["addresses"] {
  const seen = new Set<string>();
  const out: HotelStructured["contact"]["addresses"] = [];
  for (const entry of [
    { label: "Primary", value: primary, note: "" },
    ...(staff ?? []),
    ...(scraped ?? []),
  ]) {
    const value = entry.value.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: entry.label.trim() || "Address", value, note: entry.note.trim() });
  }
  return out;
}

/** Staff non-empty strings override scraped; arrays come from the form; images merge unique. */
export function mergeStaffOverrides(
  scraped: HotelStructured,
  staff: HotelStructured,
): HotelStructured {
  const phone = normPhone(pickStr(scraped.contact.phone, staff.contact.phone));
  const address = pickStr(scraped.contact.address, staff.contact.address);
  return {
    hotel_name: pickStr(scraped.hotel_name, staff.hotel_name),
    website: scraped.website || staff.website,
    contact: {
      phone,
      email: pickStr(scraped.contact.email, staff.contact.email),
      address,
      phones: mergeLabeledContacts(phone, scraped.contact.phones, staff.contact.phones),
      addresses: mergeLabeledAddresses(address, scraped.contact.addresses, staff.contact.addresses),
    },
    amenities: { ...staff.amenities },
    dining: staff.dining,
    services: staff.services.map((s) => s.trim()).filter(Boolean),
    policies: {
      check_in: normTime(pickStr(scraped.policies.check_in, staff.policies.check_in)),
      check_out: normTime(pickStr(scraped.policies.check_out, staff.policies.check_out)),
      pet_policy: pickStr(scraped.policies.pet_policy, staff.policies.pet_policy),
      cancellation_policy: pickStr(
        scraped.policies.cancellation_policy,
        staff.policies.cancellation_policy,
      ),
      smoking_policy: pickStr(scraped.policies.smoking_policy, staff.policies.smoking_policy),
    },
    room_types: staff.room_types.map((s) => s.trim()).filter(Boolean),
    images: dedupe([...staff.images, ...scraped.images]),
  metadata: {
    scrape_timestamp: scraped.metadata.scrape_timestamp,
    source_pages: scraped.metadata.source_pages,
    image_details:
      staff.metadata.image_details?.length > 0
        ? staff.metadata.image_details
        : (scraped.metadata.image_details ?? []),
    image_probe: staff.metadata.image_probe ?? scraped.metadata.image_probe,
  },
  };
}

function src(scraped: unknown, merged: unknown): "scraper" | "hotel_staff" {
  return JSON.stringify(scraped) === JSON.stringify(merged) ? "scraper" : "hotel_staff";
}

export function buildProvenance(
  scraped: HotelStructured,
  merged: HotelStructured,
): Record<string, ProvenanceEntry<unknown>> {
  const p: Record<string, ProvenanceEntry<unknown>> = {};

  p["hotel_name"] = { value: merged.hotel_name, source: src(scraped.hotel_name, merged.hotel_name) };
  p["contact.phone"] = {
    value: merged.contact.phone,
    source: src(scraped.contact.phone, merged.contact.phone),
  };
  p["contact.email"] = {
    value: merged.contact.email,
    source: src(scraped.contact.email, merged.contact.email),
  };
  p["contact.address"] = {
    value: merged.contact.address,
    source: src(scraped.contact.address, merged.contact.address),
  };
  p["contact.phones"] = {
    value: merged.contact.phones,
    source: src(scraped.contact.phones, merged.contact.phones),
  };
  p["contact.addresses"] = {
    value: merged.contact.addresses,
    source: src(scraped.contact.addresses, merged.contact.addresses),
  };

  for (const k of Object.keys(merged.amenities) as Array<keyof HotelStructured["amenities"]>) {
    const path = `amenities.${k}`;
    p[path] = {
      value: merged.amenities[k],
      source: src(scraped.amenities[k], merged.amenities[k]),
    };
  }

  p["dining"] = { value: merged.dining, source: src(scraped.dining, merged.dining) };
  p["services"] = { value: merged.services, source: src(scraped.services, merged.services) };
  p["room_types"] = {
    value: merged.room_types,
    source: src(scraped.room_types, merged.room_types),
  };
  p["images"] = { value: merged.images, source: src(scraped.images, merged.images) };

  for (const k of Object.keys(merged.policies) as Array<keyof HotelStructured["policies"]>) {
    const path = `policies.${k}`;
    p[path] = {
      value: merged.policies[k],
      source: src(scraped.policies[k], merged.policies[k]),
    };
  }

  p["metadata"] = { value: merged.metadata, source: "merged" };

  return p;
}
