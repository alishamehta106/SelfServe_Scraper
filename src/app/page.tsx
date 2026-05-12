"use client";

import { useEffect, useState } from "react";

type IntakeResult = {
  hotelId: string;
  token: string;
  reviewPath: string;
  operatorPath: string;
  missingFieldCount: number;
};

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function runIngestion(body: { url?: string; demo?: true }) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError(String(data.error ?? "Request failed"));
        return;
      }
      const nextResult = {
        hotelId: String(data.hotelId),
        token: String(data.token),
        reviewPath: String(data.reviewPath),
        operatorPath: String(data.operatorPath ?? ""),
        missingFieldCount: Number(data.missingFieldCount ?? 0),
      };
      setResult(nextResult);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runIngestion({ url });
  }

  return (
    <main className="ss-shell flex min-h-screen flex-col gap-8 py-10 sm:py-14">
      <header className="ss-hero min-h-[260px] overflow-hidden rounded-[34px] px-6 py-8 md:px-10">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
            selfserve
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Hotel webpage data scraper
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/80">
            Enter a hotel website, review the scraped details, and export a clean JSON or CSV
            record from the operator view.
          </p>
        </div>
      </header>

      <form
        onSubmit={onSubmit}
        className="ss-panel max-w-3xl space-y-5 rounded-[28px] p-5 sm:p-7"
      >
        <label className="block text-sm font-semibold text-[var(--foreground)]" htmlFor="url">
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
          className="ss-field w-full rounded-xl px-4 py-3 text-base"
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={loading}
            className="ss-button inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
          >
            {loading ? "Scraping..." : "Run scraper"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runIngestion({ demo: true })}
            className="ss-button-secondary inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
          >
            Use demo
          </button>
        </div>
        {error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {result ? (
        <section className="ss-panel max-w-4xl space-y-5 rounded-[28px] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Scrape complete</h2>
            <span className="ss-pill rounded-full px-3 py-1 text-sm font-semibold">
              {result.missingFieldCount} fields to review
            </span>
          </div>

          <p className="ss-muted text-sm">
            Send the hotel link first. Keep the operator link internal.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="ss-link-box space-y-3 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Hotel review</h3>
              <a
                className="inline-block break-all text-sm font-medium underline decoration-[var(--accent-2)] decoration-2 underline-offset-4"
                href={result.reviewPath}
              >
                {origin}
                {result.reviewPath}
              </a>
              <a className="ss-button inline-flex rounded-full px-4 py-2 text-sm font-semibold" href={result.reviewPath}>
                Open review
              </a>
            </div>

            <div className="ss-link-box space-y-3 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Operator view</h3>
              <a
                className="inline-block break-all text-sm font-medium underline decoration-[var(--accent-2)] decoration-2 underline-offset-4"
                href={result.operatorPath}
              >
                {origin}
                {result.operatorPath}
              </a>
              <a className="ss-button-secondary inline-flex rounded-full px-4 py-2 text-sm font-semibold" href={result.operatorPath}>
                Open operator
              </a>
            </div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold underline decoration-[var(--accent-2)] decoration-2 underline-offset-4"
            onClick={() => {
              setResult(null);
            }}
          >
            Clear links
          </button>
        </section>
      ) : null}
    </main>
  );
}
