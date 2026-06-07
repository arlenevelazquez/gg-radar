"use client";

import { useState } from "react";
import type { RadarResponse } from "@/app/api/radar/route";

type Format = "pdf";

/**
 * Sits in the results header next to the totals. POSTs the in-memory
 * RadarResponse to /api/radar/export/<format>, downloads the returned blob.
 * PPTX button lands in Phase 3 — the existing layout already leaves room for
 * a second action next to PDF.
 */
export function ExportButtons({ response }: { response: RadarResponse }) {
  const [downloading, setDownloading] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: Format) {
    setDownloading(format);
    setError(null);
    try {
      const res = await fetch(`/api/radar/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const filenameMatch =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `radar-report.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => download("pdf")}
        disabled={downloading !== null}
        className="bg-white hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed text-brand-700 border border-brand-200 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-2"
      >
        {downloading === "pdf" ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            Generating PDF…
          </>
        ) : (
          "Download PDF"
        )}
      </button>
      {error && <p className="text-xs text-red-600 max-w-[200px] text-right">{error}</p>}
    </div>
  );
}
