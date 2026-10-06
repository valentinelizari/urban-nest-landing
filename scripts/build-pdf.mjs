// Genera Urban_Nest_Presentacion_Propietarios.pdf a partir de pdf/presentacion.html.
// Uso: node scripts/build-pdf.mjs   (requiere playwright y un servidor estático en la raíz, ver README)
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:8765";
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(base + "/pdf/presentacion.html", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: "Urban_Nest_Presentacion_Propietarios.pdf", width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("PDF generado");
