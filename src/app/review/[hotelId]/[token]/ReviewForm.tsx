"use client";

import { useMemo, useState } from "react";

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
    return "border-2 border-amber-400 bg-amber-50/40";
  }
  return "border border-slate-200";
}

function GapHint({ gap, path }: { gap: GapReport; path: string }) {
  const g = gap[path];
  if (!g) return null;
  const conf =
    g.confidence !== undefined ? ` · confidence ${(g.confidence * 100).toFixed(0)}%` : "";
  return (
    <p className="text-xs text-slate-500">
      Scrape status: <span className="font-medium text-slate-700">{g.status}</span>
      {conf}
      {g.note ? ` · ${g.note}` : ""}
    </p>
  );
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

  const locked = status === "completed";

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
    setMessage("Saved. You can download JSON and CSV below.");
    setSaving(false);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Human review
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Hotel record</h1>
        <p className="text-sm text-slate-600">
          Source site:{" "}
          <a className="text-blue-600 underline" href={websiteUrl}>
            {websiteUrl}
          </a>
        </p>
        {locked ? (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            This review is already submitted. You can still download exports.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Fields with an amber outline were flagged as missing, partial, or
            uncertain during scraping. Staff edits always win on submit.
          </p>
        )}
      </header>

      <section className={`space-y-3 rounded-2xl border bg-white p-4 shadow-sm ${gapBoxClass(gapReport, "hotel_name")}`}>
        <h2 className="text-lg font-semibold text-slate-900">General info</h2>
        <GapHint gap={gapReport} path="hotel_name" />
        <label className="block text-sm font-medium text-slate-800">Hotel name</label>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-2"
          value={structured.hotel_name}
          disabled={locked}
          onChange={(e) => setStructured({ ...structured, hotel_name: e.target.value })}
        />
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
        <div className={`space-y-1 rounded-xl p-3 ${gapBoxClass(gapReport, "contact.phone")}`}>
          <label className="text-sm font-medium text-slate-800">Phone</label>
          <GapHint gap={gapReport} path="contact.phone" />
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={structured.contact.phone}
            disabled={locked}
            onChange={(e) =>
              setStructured({
                ...structured,
                contact: { ...structured.contact, phone: e.target.value },
              })
            }
          />
        </div>
        <div className={`space-y-1 rounded-xl p-3 ${gapBoxClass(gapReport, "contact.email")}`}>
          <label className="text-sm font-medium text-slate-800">Email</label>
          <GapHint gap={gapReport} path="contact.email" />
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={structured.contact.email}
            disabled={locked}
            onChange={(e) =>
              setStructured({
                ...structured,
                contact: { ...structured.contact, email: e.target.value },
              })
            }
          />
        </div>
        <div className={`space-y-1 rounded-xl p-3 ${gapBoxClass(gapReport, "contact.address")}`}>
          <label className="text-sm font-medium text-slate-800">Address</label>
          <GapHint gap={gapReport} path="contact.address" />
          <textarea
            className="min-h-[72px] w-full rounded-lg border border-slate-200 px-3 py-2"
            value={structured.contact.address}
            disabled={locked}
            onChange={(e) =>
              setStructured({
                ...structured,
                contact: { ...structured.contact, address: e.target.value },
              })
            }
          />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Amenities</h2>
        <p className="text-xs text-slate-500">
          Booleans are taken from this form on submit; provenance shows whether each
          value still matches the automated scrape.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["pool", "Pool"],
              ["gym", "Gym / fitness"],
              ["wifi", "Wi‑Fi"],
              ["parking", "Parking"],
              ["spa", "Spa"],
            ] as const
          ).map(([key, label]) => {
            const path = `amenities.${key}`;
            return (
              <div key={key} className={`space-y-1 rounded-lg p-3 ${gapBoxClass(gapReport, path)}`}>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={structured.amenities[key]}
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

      <section className={`space-y-3 rounded-2xl p-4 ${gapBoxClass(gapReport, "dining")}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Dining</h2>
          {!locked ? (
            <button
              type="button"
              className="text-sm text-blue-600 underline"
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
            <div key={idx} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Restaurant {idx + 1}</p>
                {!locked && structured.dining.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs text-red-600 underline"
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
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                className="min-h-[64px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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

      <section className={`space-y-2 rounded-2xl p-4 ${gapBoxClass(gapReport, "services")}`}>
        <h2 className="text-lg font-semibold text-slate-900">Services</h2>
        <GapHint gap={gapReport} path="services" />
        <textarea
          className="min-h-[96px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Policies</h2>
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
              className="min-h-[64px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
          </div>
        ))}
      </section>

      <section className={`space-y-2 rounded-2xl p-4 ${gapBoxClass(gapReport, "room_types")}`}>
        <h2 className="text-lg font-semibold text-slate-900">Room types</h2>
        <GapHint gap={gapReport} path="room_types" />
        <textarea
          className="min-h-[96px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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

      <section className={`space-y-3 rounded-2xl p-4 ${gapBoxClass(gapReport, "images")}`}>
        <h2 className="text-lg font-semibold text-slate-900">Images</h2>
        <GapHint gap={gapReport} path="images" />
        {structured.images.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Previews load from original URLs; some hosts block embedding.
            </p>
            <div className="flex flex-wrap gap-2">
              {structured.images.slice(0, 16).map((src) => {
                const det = structured.metadata.image_details?.find((d) => d.url === src);
                return (
                  <div
                    key={src}
                    className="w-36 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm"
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
          className="min-h-[96px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
        {!locked ? (
          <div>
            <label className="text-sm font-medium text-slate-800">Upload image</label>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}
      </section>

      {message ? (
        <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">{message}</p>
      ) : null}

      {!locked ? (
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Submit review"}
        </button>
      ) : null}

      {status === "completed" ? (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Exports</h3>
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              className="text-blue-600 underline"
              href={`/api/hotels/${hotelId}/export?token=${encodeURIComponent(token)}&format=json`}
            >
              Download JSON
            </a>
            <a
              className="text-blue-600 underline"
              href={`/api/hotels/${hotelId}/export?token=${encodeURIComponent(token)}&format=csv`}
            >
              Download CSV
            </a>
          </div>
        </section>
      ) : null}
    </form>
  );
}
