"use client";

import { useEffect, useMemo, useState } from "react";

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

function imageKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.href.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function groupedImages(structured: HotelStructured): Array<{ category: string; urls: string[] }> {
  const groups = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const url of structured.images) {
    const key = imageKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const detail = structured.metadata.image_details?.find((entry) => entry.url === url);
    const category = detail?.category || "General";
    groups.set(category, [...(groups.get(category) ?? []), url]);
  }
  return [...groups.entries()].map(([category, urls]) => ({ category, urls }));
}

function TextBlock({ value }: { value: string }) {
  return <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value || "Blank"}</p>;
}

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
  const [liveStatus, setLiveStatus] = useState(status);
  const [liveStructured, setLiveStructured] = useState(structured);
  const [liveGapReport, setLiveGapReport] = useState(gapReport);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshOperatorData() {
      const res = await fetch(`/api/hotels/${hotelId}/operator?token=${encodeURIComponent(operatorToken)}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        status?: string;
        structured?: HotelStructured;
        gapReport?: GapReport;
      };
      if (data.status) setLiveStatus(data.status);
      if (data.structured) setLiveStructured(data.structured);
      if (data.gapReport) setLiveGapReport(data.gapReport);
    }

    const interval = window.setInterval(() => {
      void refreshOperatorData();
    }, 4000);
    void refreshOperatorData();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hotelId, operatorToken]);

  const reviewUrl = `${origin}/review/${hotelId}/${reviewToken}`;
  const reviewCompleted = liveStatus === "completed";
  const imageGroups = useMemo(() => groupedImages(liveStructured), [liveStructured]);

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
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Hotel review link</h2>
        <CopyLine label="Send to hotel (review & edit)" fullUrl={reviewUrl} />
      </section>

      <section className="ss-card space-y-3 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">General info</h2>
        <TextBlock value={liveStructured.hotel_name} />
        {gapBadge("hotel_name", liveGapReport) ? (
          <p className="text-xs text-slate-500">Scrape: {gapBadge("hotel_name", liveGapReport)}</p>
        ) : null}
      </section>

      <section className="ss-card space-y-4 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Contact</h2>
        <div>
          <h3 className="text-sm font-medium text-slate-800">Phone</h3>
          <TextBlock value={liveStructured.contact.phone} />
        </div>
        {(liveStructured.contact.phones?.length ?? 0) > 0 ? (
          <div>
            <h3 className="text-sm font-medium text-slate-800">Additional phone numbers</h3>
            <div className="mt-1 space-y-1 text-sm text-slate-700">
              {liveStructured.contact.phones.map((entry, index) => (
                <p key={`${entry.value}-${index}`}>
                  <span className="font-medium">{entry.label}:</span> {entry.value}
                  {entry.note ? <span className="text-slate-500"> · {entry.note}</span> : null}
                </p>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <h3 className="text-sm font-medium text-slate-800">Email</h3>
          <TextBlock value={liveStructured.contact.email} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-800">Address</h3>
          <TextBlock value={liveStructured.contact.address} />
        </div>
        {(liveStructured.contact.addresses?.length ?? 0) > 0 ? (
          <div>
            <h3 className="text-sm font-medium text-slate-800">Additional addresses</h3>
            <div className="mt-1 space-y-1 text-sm text-slate-700">
              {liveStructured.contact.addresses.map((entry, index) => (
                <p key={`${entry.value}-${index}`}>
                  <span className="font-medium">{entry.label}:</span> {entry.value}
                  {entry.note ? <span className="text-slate-500"> · {entry.note}</span> : null}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="ss-card space-y-3 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Amenities</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(amenityLabels).map(([key, label]) => (
            <p key={key} className={liveStructured.amenities[key as keyof HotelStructured["amenities"]] ? "text-slate-900" : "text-slate-400"}>
              {label}:{" "}
              {liveStructured.amenities[key as keyof HotelStructured["amenities"]]
                ? "Present"
                : reviewCompleted
                  ? "Not present"
                  : "Not found"}
            </p>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Dining</h2>
        {liveStructured.dining.length === 0 ? (
          <p className="text-sm text-slate-500">None detected yet.</p>
        ) : (
          <div className="grid gap-3">
            {liveStructured.dining.map((d, i) => (
              <div key={i} className="ss-card rounded-[20px] p-4 text-sm">
                <div className="space-y-2">
                  <h3 className="font-semibold text-[var(--foreground)]">
                    {d.restaurant_name || `Restaurant ${i + 1}`}
                  </h3>
                  {d.hours ? <p className="ss-muted whitespace-pre-wrap">{d.hours}</p> : null}
                </div>
                {d.menu_items.length ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Menu items and prices
                    </p>
                    <ul className="mt-2 grid gap-1 text-slate-700 sm:grid-cols-2">
                      {d.menu_items.map((item) => (
                        <li key={item} className="rounded-xl bg-white/70 px-3 py-2">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {gapBadge("dining", liveGapReport) ? (
          <p className="text-xs text-slate-500">Scrape: {gapBadge("dining", liveGapReport)}</p>
        ) : null}
      </section>

      <section className="ss-card space-y-2 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Services</h2>
        <TextBlock value={liveStructured.services.join("\n")} />
      </section>

      <section className="ss-card space-y-4 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Policies</h2>
        {(
          [
            ["check_in", "Check-in"],
            ["check_out", "Check-out"],
            ["pet_policy", "Pet policy"],
            ["cancellation_policy", "Cancellation"],
            ["smoking_policy", "Smoking"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <h3 className="text-sm font-medium text-slate-800">{label}</h3>
            <TextBlock value={liveStructured.policies[key]} />
          </div>
        ))}
      </section>

      <section className="ss-card space-y-2 rounded-[24px] p-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Room types</h2>
        <TextBlock value={liveStructured.room_types.join("\n")} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Images</h2>
        <div className="space-y-4">
          {imageGroups.map((group) => (
            <div key={group.category} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-700">{group.category}</h3>
              <div className="flex flex-wrap gap-2">
                {group.urls.slice(0, 12).map((src) => (
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
            </div>
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
