"use client";

import { useState } from "react";

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
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <p className="font-medium text-slate-800">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-600">{fullUrl}</p>
      <button
        type="button"
        className="mt-2 text-xs font-medium text-blue-600 underline"
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
  return `${g.status}${g.confidence !== undefined ? ` (${(g.confidence * 100).toFixed(0)}%)` : ""}`;
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
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const reviewUrl = `${origin}/review/${hotelId}/${reviewToken}`;
  const operatorUrl = `${origin}/operator/${hotelId}/${operatorToken}`;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="space-y-2 border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Internal · operator view
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Hotel intake job</h1>
        <p className="text-sm text-slate-600">
          Same underlying record as the hotel-facing review form. You paste the site URL on the
          home page; the hotel completes the review link. This dashboard is for your team only—do
          not share the operator link with the property.
        </p>
        <p className="text-sm text-slate-600">
          <span className="font-medium">Source:</span>{" "}
          <a className="text-blue-600 underline" href={websiteUrl}>
            {websiteUrl}
          </a>
        </p>
        <p className="text-sm">
          Status:{" "}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
            {status}
          </span>
        </p>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold text-amber-950">Do you need to deploy?</h2>
        <p className="mt-2 leading-relaxed">
          Not for testing on one machine: both links use the same origin (for example{" "}
          <code className="rounded bg-white px-1">http://localhost:3000</code>
          ). Your browser can open operator and review side by side. To send a link to someone
          else on the internet, they must reach your server—use a deployed URL (for example Vercel)
          or a tunnel such as{" "}
          <a className="underline" href="https://ngrok.com">
            ngrok
          </a>{" "}
          while developing.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Links</h2>
        <CopyLine label="Send to hotel (review & edit)" fullUrl={reviewUrl} />
        <CopyLine label="Operator dashboard (this page)" fullUrl={operatorUrl} />
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">At a glance</h2>
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
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Dining (scraped draft)</h2>
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
        <h2 className="text-lg font-semibold text-slate-900">Image previews</h2>
        <p className="text-xs text-slate-500">
          Thumbnails load from the original hosts; some sites block hotlinking.
        </p>
        <div className="flex flex-wrap gap-2">
          {structured.images.slice(0, 12).map((src) => (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noreferrer"
              className="block h-24 w-32 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
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

      {status === "completed" ? (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Exports (operator token)</h3>
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              className="text-blue-600 underline"
              href={`/api/hotels/${hotelId}/export?token=${encodeURIComponent(operatorToken)}&format=json`}
            >
              Download JSON report
            </a>
            <a
              className="text-blue-600 underline"
              href={`/api/hotels/${hotelId}/export?token=${encodeURIComponent(operatorToken)}&format=csv`}
            >
              Download CSV report
            </a>
          </div>
        </section>
      ) : (
        <p className="text-sm text-slate-600">
          Exports unlock after the hotel submits the review form. You can still monitor the draft
          above.
        </p>
      )}
    </main>
  );
}
