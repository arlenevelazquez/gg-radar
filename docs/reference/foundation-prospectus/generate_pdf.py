#!/usr/bin/env python3
"""
generate_pdf.py — export a foundation prospectus HTML deck to 16:9 PDF.

Usage:
    python3 generate_pdf.py <input.html> <output.pdf>

Requires Playwright with chromium installed:
    pip install --break-system-packages playwright
    playwright install chromium
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright


def export_pdf(html_path: str, pdf_path: str) -> None:
    html_abs = Path(html_path).resolve()
    if not html_abs.exists():
        raise FileNotFoundError(f"HTML file not found: {html_abs}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(
            viewport={"width": 1600, "height": 900},
            device_scale_factor=2,
        )
        page = context.new_page()
        page.goto(f"file://{html_abs}")
        page.wait_for_timeout(1500)  # let fonts + base64 logo settle

        page.pdf(
            path=pdf_path,
            width="16in",
            height="9in",
            print_background=True,
            prefer_css_page_size=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )
        browser.close()
    print(f"PDF exported: {pdf_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 generate_pdf.py <input.html> <output.pdf>", file=sys.stderr)
        sys.exit(1)
    export_pdf(sys.argv[1], sys.argv[2])
