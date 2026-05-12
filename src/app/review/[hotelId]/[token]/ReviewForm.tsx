"use client";

import { useMemo, useRef, useState } from "react";

import { validateStructuredFields } from "@/lib/field-validation";
import type { GapReport, HotelStructured } from "@/lib/schema/hotel";

type Props = {
  hotelId: string;
  token: string;
  websiteUrl: string;
  initialStructured: HotelStructured;
  gapReport: GapReport;
  initialStatus: string;
};

function ensureDining(h: HotelStructured): HotelStructured {
  if (h.dining.length) return h;
  return {
    ...h,
    dining: [{ restaurant_name: "", hours: "", menu_items: [] }],
  };
}

function gapBoxClass(gap: GapReport, path: string): string {
  const g = gap[path];
  if (!g) return "border border-slate-200";
  if (g.status === "missing" || g.status === "partial" || g.status === "uncertain") {
    return "ss-flag border-2";
  }
  return "border border-slate-200";
}

function GapHint({ gap, path }: { gap: GapReport; path: string }) {
  const g = gap[path];
  if (!g) return null;
  return (
    <p className="text-xs text-slate-500">
      Status: <span className="font-medium text-[var(--foreground)]">{g.status}</span>
      {g.note ? ` · ${g.note}` : ""}
    </p>
  );
}

function FieldFeedback({
  issues,
  field,
}: {
  issues: ReturnType<typeof validateStructuredFields>;
  field: string;
}) {
  const matching = issues.filter((issue) => issue.field === field || issue.field.startsWith(`${field}.`));
  if (!matching.length) return null;
  return (
    <div className="space-y-1">
      {matching.map((issue) => (
        <p
          key={`${issue.field}-${issue.message}`}
          className={issue.severity === "error" ? "text-xs text-red-600" : "text-xs text-amber-700"}
        >
          {issue.message}
        </p>
      ))}
    </div>
  );
}

function serializeContacts(rows: Array<{ label: string; value: string; note: string }>): string {
  return rows.map((row) => [row.label, row.value, row.note].join(" | ")).join("\n");
}

function parseContacts(text: string): Array<{ label: string; value: string; note: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [label, value, note] = line.split("|").map((part) => part.trim());
      if (value) return { label: label || `Item ${index + 1}`, value, note: note ?? "" };
      return { label: `Item ${index + 1}`, value: label || "", note: "" };
    });
}

export default function ReviewForm({
  hotelId,
  token,
  websiteUrl,
  initialStructured,
  gapReport,
  initialStatus,
}: Props) {
  const seeded = useMemo(() => {
    const base = structuredClone(initialStructured);
    if (initialStatus === "completed") return base;
    return ensureDining(base);
  }, [initialStructured, initialStatus]);
  const [structured, setStructured] = useState<HotelStructured>(seeded);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locked = status === "completed";
  const fieldIssues = useMemo(() => validateStructuredFields(structured), [structured]);
  const hasBlockingIssues = fieldIssues.some((issue) => issue.severity === "error");

  async function onUpload(file: File) {
    setMessage(null);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("file", file);
    const res = await fetch(`/api/hotels/${hotelId}/upload`, { method: "POST", body: fd });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Upload failed");
      return;
    }
    if (data.url) {
      setStructured((s) => ({ ...s, images: [...s.images, data.url!] }));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    if (hasBlockingIssues) {
      setMessage("Please fix the highlighted contact or image format issues before submitting.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const dining = structured.dining.filter(
      (d) =>
        d.restaurant_name.trim() ||
        d.hours.trim() ||
        d.menu_items.some((m) => m.trim()),
    );
    const payload = {
      ...structured,
      dining,
      services: structured.services.map((s) => s.trim()).filter(Boolean),
      room_types: structured.room_types.map((s) => s.trim()).filter(Boolean),
      images: structured.images.map((s) => s.trim()).filter(Boolean),
    };
    const res = await fetch(`/api/hotels/${hotelId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, structured: payload }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Save failed");
      setSaving(false);
      return;
    }
    setStatus("completed");
    setMessage("Saved. Your updates were submitted to the operator dashboard.");
    setSaving(false);
  }

  return (
    <form onSubmit={onSubmit} className="ss-shell max-w-4xl space-y-6 py-10">
      <header className="space-y-3 border-b border-[var(--border)] pb-6">
        <p className="ss-pill w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          Hotel review
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">Review your hotel details</h1>
        <p className="ss-muted text-sm">
          Source site:{" "}
          <a className="font-medium underline decoration-[var(--accent-2)] decoration-2 underline-offset-4" href={websiteUrl}>
            {websiteUrl}
          </a>
        </p>
        {locked ? (
          <p className="ss-card rounded-2xl px-4 py-3 text-sm">
            Submitted.
          </p>
        ) : (
          <p className="ss-muted max-w-2xl text-sm leading-6">
            Check the prefilled fields, edit anything inaccurate, and submit when complete.
          </p>
        )}
      </header>

      <section className={`ss-card space-y-3 rounded-[24px] p-5 ${gapBoxClass(gapReport, "hotel_name")}`}>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">General info</h2>
        <GapHint gap={gapReport} path="hotel_name" />
        <label className="block text-sm font-medium text-slate-800">Hotel name</label>
        <input
          className="ss-field w-full rounded-xl px-3 py-2"
          value={structured.hotel_name}
          disabled={locked}
          onChange={(e) => setStructured({ ...structured, hotel_name: e.target.value })}
        />
      </section>

      <section className="ss-card space-y-4 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Contact</h2>
        <div className={`space-y-1 rounded-xl p-3 ${gapBoxClass(gapReport, "contact.phone")}`}>
          <label className="text-sm font-medium text-slate-800">Phone</label>
          <GapHint gap={gapReport} path="contact.phone" />
          <input
            className="ss-field w-full rounded-xl px-3 py-2"
            value={structured.contact.phone}
            disabled={locked}
            onChange={(e) =>
              setStructured({
                ...structured,
                contact: { ...structured.contact, phone: e.target.value },
              })
            }
          />
          <FieldFeedback issues={fieldIssues} field="contact.phone" />
        </div>
        <div className="space-y-1 rounded-xl border border-slate-200 p-3">
          <label className="text-sm font-medium text-slate-800">Additional phone numbers</label>
          <p className="text-xs text-slate-500">One per line: Label | phone number | why it belongs here</p>
          <textarea
            className="ss-field min-h-[88px] w-full rounded-xl px-3 py-2 text-sm"
            disabled={locked}
            value={serializeContacts(structured.contact.phones ?? [])}
            onChange={(e) =>
              setStructured({
                ...structured,
                contact: { ...structured.contact, phones: parseContacts(e.target.value) },
              })
            }
          />
          <FieldFeedback issues={fieldIssues} field="contact.phones" />
        </div>
        <div className={`space-y-1 rounded-xl p-3 ${gapBoxClass(gapReport, "contact.email")}`}>
          <label className="text-sm font-medium text-slate-800">Email</label>
          <GapHint gap={gapReport} path="contact.email" />
          <input
            className="ss-field w-full rounded-xl px-3 py-2"
            value={structured.contact.email}
            disabled={locked}
            onChange={(e) =>
              setStructured({
                ...structured,
                contact: { ...structured.contact, email: e.target.value },
              })
            }
          />
          <FieldFeedback issues={fieldIssues} field="contact.email" />
        </div>
        <div className={`space-y-1 rounded-xl p-3 ${gapBoxClass(gapReport, "contact.address")}`}>
          <label className="text-sm font-medium text-slate-800">Address</label>
          <GapHint gap={gapReport} path="contact.address" />
          <textarea
            className="ss-field min-h-[72px] w-full rounded-xl px-3 py-2"
            value={structured.contact.address}
            disabled={locked}
            onChange={(e) =>
              setStructured({
                ...structured,
                contact: { ...structured.contact, address: e.target.value },
              })
            }
          />
          <FieldFeedback issues={fieldIssues} field="contact.address" />
        </div>
        <div className="space-y-1 rounded-xl border border-slate-200 p-3">
          <label className="text-sm font-medium text-slate-800">Additional addresses</label>
          <p className="text-xs text-slate-500">One per line: Label | full street address | why it belongs here</p>
          <textarea
            className="ss-field min-h-[88px] w-full rounded-xl px-3 py-2 text-sm"
            disabled={locked}
            value={serializeContacts(structured.contact.addresses ?? [])}
            onChange={(e) =>
              setStructured({
                ...structured,
                contact: { ...structured.contact, addresses: parseContacts(e.target.value) },
              })
            }
          />
          <FieldFeedback issues={fieldIssues} field="contact.addresses" />
        </div>
      </section>

      <section className="ss-card space-y-3 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Amenities</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["pool", "Pool"],
              ["gym", "Gym / fitness"],
              ["wifi", "Wi‑Fi"],
              ["parking", "Parking"],
              ["spa", "Spa"],
              ["breakfast", "Breakfast"],
              ["accessible_rooms", "Accessible rooms"],
              ["ev_charging", "EV charging"],
              ["meeting_space", "Meeting / event space"],
            ] as const
          ).map(([key, label]) => {
            const path = `amenities.${key}`;
            return (
              <div key={key} className={`space-y-1 rounded-lg p-3 ${gapBoxClass(gapReport, path)}`}>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={Boolean(structured.amenities[key])}
                    onChange={(e) =>
                      setStructured({
                        ...structured,
                        amenities: { ...structured.amenities, [key]: e.target.checked },
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
                <GapHint gap={gapReport} path={path} />
              </div>
            );
          })}
        </div>
      </section>

      <section className={`ss-card space-y-3 rounded-[24px] p-5 ${gapBoxClass(gapReport, "dining")}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Dining</h2>
          {!locked ? (
            <button
              type="button"
              className="text-sm font-semibold underline decoration-[var(--accent-2)] decoration-2 underline-offset-4"
              onClick={() =>
                setStructured({
                  ...structured,
                  dining: [
                    ...structured.dining,
                    { restaurant_name: "", hours: "", menu_items: [] },
                  ],
                })
              }
            >
              Add restaurant
            </button>
          ) : null}
        </div>
        <GapHint gap={gapReport} path="dining" />
        <div className="space-y-4">
          {structured.dining.map((row, idx) => (
            <div key={idx} className="space-y-2 rounded-2xl border border-[var(--border)] bg-[#fffdf8] p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Restaurant {idx + 1}</p>
                {!locked && structured.dining.length > 1 ? (
                  <button
                    type="button"
                  className="text-xs text-[var(--danger)] underline"
                    onClick={() =>
                      setStructured({
                        ...structured,
                        dining: structured.dining.filter((_, i) => i !== idx),
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                className="ss-field w-full rounded-xl px-3 py-2 text-sm"
                placeholder="Restaurant name"
                disabled={locked}
                value={row.restaurant_name}
                onChange={(e) => {
                  const dining = [...structured.dining];
                  dining[idx] = { ...row, restaurant_name: e.target.value };
                  setStructured({ ...structured, dining });
                }}
              />
              <input
                className="ss-field w-full rounded-xl px-3 py-2 text-sm"
                placeholder="Hours"
                disabled={locked}
                value={row.hours}
                onChange={(e) => {
                  const dining = [...structured.dining];
                  dining[idx] = { ...row, hours: e.target.value };
                  setStructured({ ...structured, dining });
                }}
              />
              <textarea
                className="ss-field min-h-[64px] w-full rounded-xl px-3 py-2 text-sm"
                placeholder="Menu items (one per line)"
                disabled={locked}
                value={row.menu_items.join("\n")}
                onChange={(e) => {
                  const dining = [...structured.dining];
                  dining[idx] = {
                    ...row,
                    menu_items: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  };
                  setStructured({ ...structured, dining });
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section className={`ss-card space-y-2 rounded-[24px] p-5 ${gapBoxClass(gapReport, "services")}`}>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Services</h2>
        <GapHint gap={gapReport} path="services" />
        <textarea
          className="ss-field min-h-[96px] w-full rounded-xl px-3 py-2 text-sm"
          placeholder="One service per line (e.g. Concierge)"
          disabled={locked}
          value={structured.services.join("\n")}
          onChange={(e) =>
            setStructured({
              ...structured,
              services: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
            })
          }
        />
      </section>

      <section className="ss-card space-y-3 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Policies</h2>
        {(
          [
            ["policies.check_in", "Check-in"],
            ["policies.check_out", "Check-out"],
            ["policies.pet_policy", "Pet policy"],
            ["policies.cancellation_policy", "Cancellation"],
            ["policies.smoking_policy", "Smoking"],
          ] as const
        ).map(([path, label]) => (
          <div key={path} className={`space-y-1 rounded-xl p-3 ${gapBoxClass(gapReport, path)}`}>
            <label className="text-sm font-medium text-slate-800">{label}</label>
            <GapHint gap={gapReport} path={path} />
            <textarea
              className="ss-field min-h-[64px] w-full rounded-xl px-3 py-2 text-sm"
              disabled={locked}
              value={
                structured.policies[
                  path.split(".")[1] as keyof HotelStructured["policies"]
                ]
              }
              onChange={(e) => {
                const key = path.split(".")[1] as keyof HotelStructured["policies"];
                setStructured({
                  ...structured,
                  policies: { ...structured.policies, [key]: e.target.value },
                });
              }}
            />
            <FieldFeedback issues={fieldIssues} field={path} />
          </div>
        ))}
      </section>

      <section className={`ss-card space-y-2 rounded-[24px] p-5 ${gapBoxClass(gapReport, "room_types")}`}>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Room types</h2>
        <GapHint gap={gapReport} path="room_types" />
        <textarea
          className="ss-field min-h-[96px] w-full rounded-xl px-3 py-2 text-sm"
          placeholder="One room type per line"
          disabled={locked}
          value={structured.room_types.join("\n")}
          onChange={(e) =>
            setStructured({
              ...structured,
              room_types: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
            })
          }
        />
      </section>

      <section className={`ss-card space-y-3 rounded-[24px] p-5 ${gapBoxClass(gapReport, "images")}`}>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Images</h2>
        <GapHint gap={gapReport} path="images" />
        {structured.images.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Review image URLs or upload new property photos.
            </p>
            <div className="flex flex-wrap gap-2">
              {structured.images.slice(0, 16).map((src) => {
                const det = structured.metadata.image_details?.find((d) => d.url === src);
                return (
                  <div
                    key={src}
                    className="w-36 overflow-hidden rounded-2xl border border-[var(--border)] bg-[#fffdf8] shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={det?.alt ?? "Hotel image"}
                      className="h-28 w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    {det?.caption ? (
                      <p className="line-clamp-2 p-1 text-[10px] text-slate-600">{det.caption}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        <textarea
          className="ss-field min-h-[96px] w-full rounded-xl px-3 py-2 text-sm"
          placeholder="Image URLs (one per line). Uploads append automatically."
          disabled={locked}
          value={structured.images.join("\n")}
          onChange={(e) =>
            setStructured({
              ...structured,
              images: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
            })
          }
        />
        <FieldFeedback issues={fieldIssues} field="images" />
        {!locked ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Upload image</label>
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ss-button-secondary inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
              >
                Choose image to upload
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {message ? (
        <p className="rounded-2xl bg-[var(--foreground)] px-4 py-3 text-sm text-[#fffdf8]">{message}</p>
      ) : null}

      {!locked ? (
        <button
          type="submit"
          disabled={saving || hasBlockingIssues}
          className="ss-button rounded-full px-5 py-3 text-sm font-semibold"
        >
          {saving ? "Saving…" : "Submit review"}
        </button>
      ) : null}
    </form>
  );
}
