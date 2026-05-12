import { z } from "zod";

export const imageDetailSchema = z.object({
  url: z.string(),
  alt: z.string(),
  caption: z.string(),
});

export const imageProbeEntrySchema = z.object({
  url: z.string(),
  bytes: z.number(),
  format: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  error: z.string().optional(),
});

/** Canonical hotel payload (scraper target, form, export). */
export const hotelStructuredSchema = z.object({
  hotel_name: z.string(),
  website: z.string(),
  contact: z.object({
    phone: z.string(),
    email: z.string(),
    address: z.string(),
  }),
  amenities: z.object({
    pool: z.boolean(),
    gym: z.boolean(),
    wifi: z.boolean(),
    parking: z.boolean(),
    spa: z.boolean(),
  }),
  dining: z.array(
    z.object({
      restaurant_name: z.string(),
      hours: z.string(),
      menu_items: z.array(z.string()),
    }),
  ),
  services: z.array(z.string()),
  policies: z.object({
    check_in: z.string(),
    check_out: z.string(),
    pet_policy: z.string(),
    cancellation_policy: z.string(),
    smoking_policy: z.string(),
  }),
  room_types: z.array(z.string()),
  images: z.array(z.string()),
  metadata: z.object({
    scrape_timestamp: z.string(),
    source_pages: z.array(z.string()),
    image_details: z
      .array(imageDetailSchema)
      .optional()
      .transform((x) => x ?? []),
    image_probe: z.array(imageProbeEntrySchema).optional(),
  }),
});

export type HotelStructured = z.infer<typeof hotelStructuredSchema>;
export type ImageDetail = z.infer<typeof imageDetailSchema>;
export type ImageProbeEntry = z.infer<typeof imageProbeEntrySchema>;

export type FieldStatus = "complete" | "partial" | "missing" | "uncertain";

export type GapFieldReport = {
  status: FieldStatus;
  confidence?: number;
  note?: string;
};

export type GapReport = Record<string, GapFieldReport>;

export type ProvenanceEntry<T = unknown> = {
  value: T;
  source: "scraper" | "hotel_staff" | "merged";
};

export type ScrapedPayload = {
  structured: HotelStructured;
  raw_pages: Array<{ url: string; text: string }>;
  fieldConfidence: Record<string, number>;
};

export function emptyHotelStructured(website: string): HotelStructured {
  const ts = new Date().toISOString();
  return {
    hotel_name: "",
    website,
    contact: { phone: "", email: "", address: "" },
    amenities: {
      pool: false,
      gym: false,
      wifi: false,
      parking: false,
      spa: false,
    },
    dining: [],
    services: [],
    policies: {
      check_in: "",
      check_out: "",
      pet_policy: "",
      cancellation_policy: "",
      smoking_policy: "",
    },
    room_types: [],
    images: [],
    metadata: {
      scrape_timestamp: ts,
      source_pages: [],
      image_details: [],
    },
  };
}
