"use client";

import { useEffect, useState } from "react";

import type { GapReport, HotelStructured } from "@/lib/schema/hotel";

type Props = {
  hotelId: string;
  operatorToken: string;
  websiteUrl: string;
  status: string;
  structured: HotelStructured;
  gapReport: GapReport;
  reviewToken: string;
};

function CopyLine({ label, fullUrl }: { label: string; fullUrl: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="ss-link-box rounded-2xl p-4 text-sm">
      <p className="font-semibold text-[var(--foreground)]">{label}</p>
      <p className="ss-muted mt-1 break-all font-mono text-xs">{fullUrl}</p>
      <button
        type="button"
        className="mt-3 text-xs font-semibold underline decoration-[var(--accent-2)] decoration-2 underline-offset-4"
        onClick={async () => {
          await navigator.clipboard.writeText(fullUrl);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        }}
      >
        {done ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function gapBadge(path: string, gap: GapReport): string | null {
  const g = gap[path];
  if (!g) return null;
  return g.status;
}

const amenityLabels: Record<string, string> = {
  pool: "Pool",
  gym: "Gym / fitness",
  wifi: "Wi-Fi",
  parking: "Parking",
  spa: "Spa",
  breakfast: "Breakfast",
  accessible_rooms: "Accessible rooms",
  ev_charging: "EV charging",
  meeting_space: "Meeting / event space",
};

export default function OperatorDashboard({
  hotelId,
  operatorToken,
  websiteUrl,
  status,
  structured,
  gapReport,
  reviewToken,
}: Props) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const reviewUrl = `${origin}/review/${hotelId}/${reviewToken}`;
  const operatorUrl = `${origin}/operator/${hotelId}/${operatorToken}`;
  const reviewCompleted = status === "completed";

  return (
    <main className="ss-shell max-w-5xl space-y-6 py-10">
      <header className="space-y-3 border-b border-[var(--border)] pb-6">
        <p className="ss-pill w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
          Operator view
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">Hotel intake</h1>
        <p className="ss-muted text-sm">
          <span className="font-medium">Source:</span>{" "}
          <a className="font-medium underline decoration-[var(--accent-2)] decoration-2 underline-offset-4" href={websiteUrl}>
            {websiteUrl}
          </a>
        </p>
        <p className="text-sm text-[var(--foreground)]">
          Hotel review:{" "}
          <span className="ss-pill rounded-full px-3 py-1 font-semibold">
            {reviewCompleted ? "Completed" : "Not submitted"}
          </span>
        </p>
        <p className="ss-muted text-sm">
          Showing {reviewCompleted ? "hotel-submitted final data" : "scraped draft data"}.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Links</h2>
        <CopyLine label="Send to hotel (review & edit)" fullUrl={reviewUrl} />
        <CopyLine label="Operator dashboard (this page)" fullUrl={operatorUrl} />
      </section>

      <section className="ss-card space-y-3 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">At a glance</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Hotel name</dt>
            <dd className="font-medium text-slate-900">{structured.hotel_name || "—"}</dd>
            {gapBadge("hotel_name", gapReport) ? (
              <dd className="text-xs text-slate-500">Scrape: {gapBadge("hotel_name", gapReport)}</dd>
            ) : null}
          </div>
          <div>
            <dt className="text-slate-500">Phone</dt>
            <dd className="font-medium text-slate-900">{structured.contact.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-900">{structured.contact.email || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Address</dt>
            <dd className="font-medium text-slate-900">{structured.contact.address || "—"}</dd>
          </div>
          {(structured.contact.phones?.length ?? 0) > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Phone numbers</dt>
              <dd className="space-y-1">
                {structured.contact.phones.map((entry, index) => (
                  <p key={`${entry.value}-${index}`} className="text-slate-900">
                    <span className="font-medium">{entry.label}:</span> {entry.value}
                    {entry.note ? <span className="text-slate-500"> · {entry.note}</span> : null}
                  </p>
                ))}
              </dd>
            </div>
          ) : null}
          {(structured.contact.addresses?.length ?? 0) > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Addresses</dt>
              <dd className="space-y-1">
                {structured.contact.addresses.map((entry, index) => (
                  <p key={`${entry.value}-${index}`} className="text-slate-900">
                    <span className="font-medium">{entry.label}:</span> {entry.value}
                    {entry.note ? <span className="text-slate-500"> · {entry.note}</span> : null}
                  </p>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="ss-card space-y-3 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Current details</h2>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <h3 className="font-medium text-slate-800">Amenities</h3>
            <p className="mt-1 text-slate-600">
              {Object.entries(structured.amenities)
                .filter(([, enabled]) => enabled)
                .map(([name]) => amenityLabels[name] ?? name)
                .join(", ") || "None marked available"}
            </p>
          </div>
          <div>
            <h3 className="font-medium text-slate-800">Services</h3>
            <p className="mt-1 text-slate-600">{structured.services.join(", ") || "None listed"}</p>
          </div>
          <div>
            <h3 className="font-medium text-slate-800">Room types</h3>
            <p className="mt-1 text-slate-600">{structured.room_types.join(", ") || "None listed"}</p>
          </div>
          <div>
            <h3 className="font-medium text-slate-800">Policies</h3>
            <dl className="mt-1 space-y-1 text-slate-600">
              <div>
                <dt className="inline font-medium">Check-in:</dt>{" "}
                <dd className="inline">{structured.policies.check_in || "Blank"}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Check-out:</dt>{" "}
                <dd className="inline">{structured.policies.check_out || "Blank"}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Pets:</dt>{" "}
                <dd className="inline">{structured.policies.pet_policy || "Blank"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Dining</h2>
        {structured.dining.length === 0 ? (
          <p className="text-sm text-slate-500">None detected yet.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
            {structured.dining.map((d, i) => (
              <li key={i}>
                <span className="font-medium">{d.restaurant_name || "(unnamed venue)"}</span>
                {d.hours ? ` · ${d.hours}` : ""}
              </li>
            ))}
          </ul>
        )}
        {gapBadge("dining", gapReport) ? (
          <p className="text-xs text-slate-500">Scrape: {gapBadge("dining", gapReport)}</p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Images</h2>
        <div className="flex flex-wrap gap-2">
          {structured.images.slice(0, 12).map((src) => (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noreferrer"
              className="block h-24 w-32 overflow-hidden rounded-2xl border border-[var(--border)] bg-[#fffdf8]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </a>
          ))}
        </div>
      </section>

      <section className="ss-card space-y-3 rounded-[24px] p-5">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Exports</h3>
        {!reviewCompleted ? (
          <p className="ss-muted text-sm">Draft export available now. It updates after hotel review.</p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            className="ss-export-button inline-flex rounded-full px-5 py-3 font-semibold"
            href={`/api/hotels/${hotelId}/export?token=${encodeURIComponent(operatorToken)}&format=json`}
          >
            Download JSON
          </a>
          <a
            className="ss-export-button inline-flex rounded-full px-5 py-3 font-semibold"
            href={`/api/hotels/${hotelId}/export?token=${encodeURIComponent(operatorToken)}&format=csv`}
          >
            Download CSV
          </a>
        </div>
      </section>
    </main>
  );
}
