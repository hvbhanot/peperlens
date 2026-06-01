"use client";

// Client-only loaders for pdf.js and mermaid, pulled from a CDN once and
// memoised on window. Kept out of the bundle so the server build stays clean.

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export async function getPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}

export async function getMermaid() {
  if (window.mermaid) return window.mermaid;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js");
  window.mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
  return window.mermaid;
}

// KaTeX + auto-render for LaTeX math in model output.
export async function getKatex() {
  if (window.renderMathInElement) return window.renderMathInElement;
  if (!document.querySelector("link[data-katex]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";
    link.setAttribute("data-katex", "1");
    document.head.appendChild(link);
  }
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js");
  return window.renderMathInElement;
}

// Extracts plain text (capped) and page count from a PDF ArrayBuffer.
export async function extractPdf(arrayBuffer, pageCap = 40) {
  const pdfjsLib = await getPdfJs();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let collected = "";
  const cap = Math.min(doc.numPages, pageCap);
  for (let p = 1; p <= cap; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    collected += tc.items.map((it) => it.str).join(" ") + "\n\n";
  }
  return { numPages: doc.numPages, text: collected };
}
