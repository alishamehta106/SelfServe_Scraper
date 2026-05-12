"use client";

import { useState } from "react";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    hotelId: string;
    token: string;
    reviewPath: string;
    operatorPath: string;
    missingFieldCount: number;
  } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError(String(data.error ?? "Request failed"));
        return;
      }
      setResult({
        hotelId: String(data.hotelId),
        token: String(data.token),
        reviewPath: String(data.reviewPath),
        operatorPath: String(data.operatorPath ?? ""),
        missingFieldCount: Number(data.missingFieldCount ?? 0),
      });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-14">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          MVP pipeline
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Hotel website ingestion
        </h1>
        <p className="text-slate-600">
          Paste a public hotel website URL. The scraper crawls many same-origin pages (respecting
          robots.txt, including sitemap seeds), extracts a structured draft with JSON-LD and image
          context, then gives you two links: an internal operator dashboard and a hotel-facing
          review form that update the same database record.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block text-sm font-medium text-slate-800" htmlFor="url">
          Hotel website URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://www.example-hotel.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 outline-none ring-blue-500/40 focus:ring-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Scraping…" : "Run scraper"}
        </button>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {result ? (
        <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-emerald-950">
          <h2 className="text-lg font-semibold">Scrape complete</h2>
          <p className="text-sm">
            Gap detection flagged{" "}
            <span className="font-semibold">{result.missingFieldCount}</span> fields that need
            attention (missing, partial, or uncertain).
          </p>

          <div className="space-y-2 rounded-xl border border-emerald-300/60 bg-white/80 p-4">
            <h3 className="text-sm font-semibold text-slate-900">1 · Operator (your team)</h3>
            <p className="text-xs text-slate-600">
              Monitor the same record, copy the hotel link, and download exports after submit. Do
              not send this URL to the property.
            </p>
            <a
              className="inline-block break-all text-sm font-medium text-blue-700 underline"
              href={result.operatorPath}
            >
              {origin}
              {result.operatorPath}
            </a>
          </div>

          <div className="space-y-2 rounded-xl border border-emerald-300/60 bg-white/80 p-4">
            <h3 className="text-sm font-semibold text-slate-900">2 · Hotel review (property)</h3>
            <p className="text-xs text-slate-600">
              Secret link—treat like a password. They fill gaps and submit; exports unlock for both
              sides.
            </p>
            <a
              className="inline-block break-all text-sm font-medium text-blue-700 underline"
              href={result.reviewPath}
            >
              {origin}
              {result.reviewPath}
            </a>
          </div>
        </section>
      ) : null}
    </main>
  );
}
