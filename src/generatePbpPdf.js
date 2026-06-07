// ─────────────────────────────────────────────────────────────────────────
//  Powered by Positive — Novated Lease Quote (PDF generator)
//  Customer-facing 2-page A4 quote (+ optional LCA supplement page).
//  Loads jsPDF from CDN on first call. Logo loaded from /public.
//  Matches the design in "Powered by Positive Quote Redesign.html".
// ─────────────────────────────────────────────────────────────────────────

const LOGO_URL = "/powered-by-positive.svg";
const ECM_LEARN_MORE_URL = "https://positivesalarypackaging.com.au/employee-contribution-method/";

// Palette (mirrors the design system; tuned to match the mockup)
const C = {
  blue:    [10, 80, 211],   blueD:   [8, 64, 168],
  blue100: [225, 236, 251], blueOn:  [170, 200, 255],
  lime:    [161, 226, 32],  limeD:   [141, 180, 26],
  ink:     [11, 16, 18],    ink2:    [45, 47, 40],
  muted:   [74, 77, 67],    wh:      [255, 255, 250],
  bg:      [255, 255, 250], bg2:     [244, 245, 238],
  line:    [229, 231, 224], orange:  [232, 162, 26],
  textOnDarkM: [170, 173, 160],
};

const W = 210, H = 297, M = 14;
const CW = W - M * 2;
const fmt = (n, d = 0) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fmtPct = (n) => (n * 100).toFixed(2) + "%";
// "Fortnightly" is an adjective; the noun is "fortnight". Use for any "per X" /
// "$X/X" copy where the slot needs a noun, not an adverb.
const cycleNoun = (label) => ({
  weekly: "week",
  fortnightly: "fortnight",
  monthly: "month",
  "bi-monthly": "two months",
}[String(label || "").toLowerCase()] || String(label || "").toLowerCase());

let _logoCache = null;

// Logo is an SVG — we cache the raw source text so each call can parse a fresh
// element (svg2pdf mutates the DOM element it renders).
async function loadLogo() {
  if (_logoCache !== null) return _logoCache;
  try {
    const r = await fetch(LOGO_URL);
    if (!r.ok) { _logoCache = ""; return _logoCache; }
    _logoCache = await r.text();
    return _logoCache;
  } catch (e) {
    console.warn("[PBP] logo load failed:", e);
    _logoCache = "";
    return _logoCache;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}

async function ensureJsPDF() {
  if (!window.jspdf) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  }
  // svg2pdf.js adds doc.svg(element, opts) — vector SVG embedding
  if (!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.svg)) {
    await loadScript("https://unpkg.com/svg2pdf.js@2.4.0/dist/svg2pdf.umd.min.js");
  }
}

// Render an SVG source string into the doc at (x, y, w, h) in PDF mm.
// Falls back to a text wordmark if the logo failed to load.
//
// svg2pdf.js can leave doc state polluted (text char-space, font, fill color,
// graphics matrix) after rendering, which causes downstream issues like spaced-out
// glyph rendering ("L e a r n  m o r e") and missing fills. We wrap each call in
// save/restoreGraphicsState AND explicitly reset jsPDF text/draw state afterwards.
async function drawLogoSVG(doc, svgText, x, y, w, h) {
  if (!svgText) return false;
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
  const svgEl = svgDoc.documentElement;
  if (!svgEl || svgEl.nodeName === "parsererror") return false;
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden";
  host.appendChild(svgEl);
  document.body.appendChild(host);
  let savedState = false;
  try {
    doc.saveGraphicsState(); savedState = true;
    await doc.svg(svgEl, { x, y, width: w, height: h });
    doc.restoreGraphicsState(); savedState = false;
    // Reset state svg2pdf may have changed
    if (doc.setCharSpace) doc.setCharSpace(0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    doc.setFillColor(0, 0, 0);
    doc.setTextColor(0, 0, 0);
    return true;
  } catch (e) {
    console.error("[PBP] SVG render failed:", e);
    if (savedState) { try { doc.restoreGraphicsState(); } catch (_) {} }
    return false;
  } finally {
    host.remove();
  }
}

// Tiny font helpers
function f(doc, weight) { doc.setFont("helvetica", weight || "normal"); }
function tx(doc, color) { doc.setTextColor(...color); }
function fi(doc, color) { doc.setFillColor(...color); }
function dr(doc, color) { doc.setDrawColor(...color); }

// Dashed horizontal line (jsPDF dashes for separators)
function dash(doc, x1, y, x2) {
  // Wrap in save/restore so dashed-line state (colour, width, dash pattern) can't
  // leak into subsequent stroked draws.
  doc.saveGraphicsState();
  dr(doc, C.line);
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([0.6, 0.6], 0);
  doc.line(x1, y, x2, y);
  doc.restoreGraphicsState();
}

// Vector right-pointing arrow drawn at (x, y) with given length (mm).
// Uses current FILL colour for the head and DRAW colour for the shaft —
// caller must set both (fi+dr) to the same colour before calling.
function drawArrow(doc, x, y, size) {
  const len = size || 3.2;
  const head = len * 0.42;
  const lw = doc.getLineWidth();
  doc.setLineWidth(0.45);
  doc.line(x, y, x + len - head + 0.2, y);
  doc.triangle(
    x + len - head, y - head * 0.55,
    x + len,        y,
    x + len - head, y + head * 0.55,
    "F"
  );
  doc.setLineWidth(lw);
}

// Draws a rect with square left corners and rounded right corners. Used for
// the lime accent on the vehicle hero so the stripe's right corners pick up
// the panel's radius without relying on PDF clipping (which proved flaky).
function drawRightRoundedRect(doc, x, y, w, h, r, style) {
  const k = 0.5523;  // cubic-bezier approximation of a quarter circle
  doc.lines(
    [
      [w - r, 0],                               // top edge → start of TR curve
      [k * r, 0, r, r - k * r, r, r],           // TR quarter curve
      [0, h - 2 * r],                           // right edge
      [0, k * r, -(r - k * r), r, -r, r],       // BR quarter curve
      [-(w - r), 0],                            // bottom edge → back to left
      // closing line on left edge added automatically by `true` below
    ],
    x, y, [1, 1], style, true
  );
}

// Typographic vehicle hero used when no vehicleImage is supplied.
// Reads as intentional design, not a missing-asset placeholder.
function drawVehicleHero(doc, x, y, w, h, name, classLabel, isEV) {
  const R = 6;
  const stripeW = Math.min(20, w * 0.18);

  // Blue panel — single rounded rect (all 4 corners).
  fi(doc, C.blue);
  doc.roundedRect(x, y, w, h, R, R, "F");

  // Lime stripe — custom path: square on left (against the blue), rounded on
  // right (against the panel edge). No clipping needed.
  fi(doc, C.lime);
  drawRightRoundedRect(doc, x + w - stripeW, y, stripeW, h, R, "F");

  // Outline
  dr(doc, C.line); doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, R, R, "S");

  // Eyebrow
  f(doc, "bold"); doc.setFontSize(6); tx(doc, [255, 255, 255]);
  const eyebrow = (isEV ? "EV  \u00b7  " : "") + String(classLabel || "").toUpperCase();
  doc.text(eyebrow, x + 6, y + 8);

  // Name
  const innerW = w - stripeW - 12;
  f(doc, "bold"); doc.setFontSize(16); tx(doc, [255, 255, 255]);
  const nameLines = doc.splitTextToSize(name || classLabel || "", innerW).slice(0, 2);
  const lh = 6.5;
  const bandTop = y + 11;
  const bandBottom = y + h - 10;
  const blockH = (nameLines.length - 1) * lh;
  const startY = bandTop + (bandBottom - bandTop + blockH) / 2 - lh * 0.2;
  nameLines.forEach((line, i) => {
    doc.text(line, x + 6, startY - (nameLines.length - 1 - i) * lh);
  });
}

// Draws a vehicle image clipped to the same rounded panel shape.
function drawVehicleImage(doc, imgData, x, y, w, h) {
  const R = 6;
  doc.saveGraphicsState();
  doc.roundedRect(x, y, w, h, R, R);  // path only
  doc.clip();
  try {
    doc.addImage(imgData, "JPEG", x, y, w, h, undefined, "FAST");
  } catch (e) {
    fi(doc, C.bg2);
    doc.rect(x, y, w, h, "F");
  }
  doc.restoreGraphicsState();
  dr(doc, C.line); doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, R, R, "S");
}

// Small pictogram inside a soft circular badge — used in the "Everything
// included" cells on page 1. Outline icons matching the Lucide-style SVGs in
// the redesign HTML mockup. All shapes drawn from a 24x24 viewBox; (cx, cy)
// is the badge centre, r is the badge radius. Icon spans roughly 1.4 * r.
function drawInclusionIcon(doc, cx, cy, r, type) {
  // Soft circular badge
  fi(doc, C.blue100);
  doc.circle(cx, cy, r, "F");

  // Icon stroke setup — thin outline, rounded ends/joins (Lucide style)
  dr(doc, C.blue); fi(doc, C.blue100);
  doc.setLineWidth(0.32);
  doc.setLineCap("round");
  doc.setLineJoin("round");

  // (vbx, vby) in 24-unit viewBox → PDF coordinates, scaled to fit ~1.4*r.
  const s = (r * 1.45) / 24;
  const X = (vbx) => cx + (vbx - 12) * s;
  const Y = (vby) => cy + (vby - 12) * s;
  const L = (x1, y1, x2, y2) => doc.line(X(x1), Y(y1), X(x2), Y(y2));
  const C2 = (vbx, vby, vbr) => doc.circle(X(vbx), Y(vby), vbr * s, "S");

  switch (type) {
    case "car": {
      // Body
      doc.roundedRect(X(3), Y(14), 18 * s, 5 * s, 1.5 * s, 1.5 * s, "S");
      // Roof (3 segments approximating the rounded top)
      doc.lines(
        [[2 * s, -5 * s], [14 * s, 0], [2 * s, 5 * s]],
        X(3), Y(14), [1, 1], "S", false
      );
      C2(7, 19, 1.6); C2(17, 19, 1.6);
      break;
    }
    case "fuel": {
      // Cab (approximate truck cab)
      doc.lines(
        [[11 * s, 0], [3 * s, 5 * s], [0, 6 * s], [-1 * s, 1 * s]],
        X(5), Y(6), [1, 1], "S", false
      );
      // Trailer body
      doc.lines(
        [[13 * s, 0], [0, 5 * s], [-9 * s, 0]],
        X(2), Y(13), [1, 1], "S", false
      );
      C2(7, 18, 1.6); C2(16, 18, 1.6);
      break;
    }
    case "bolt": {
      // Lucide zap: stroked lightning
      doc.lines(
        [[-9 * s, 11 * s], [8 * s, 0], [-1 * s, 7 * s], [9 * s, -11 * s], [-8 * s, 0], [1 * s, -7 * s]],
        X(13), Y(3), [1, 1], "S", true
      );
      break;
    }
    case "plate": {
      // Rego — document with lines (matches redesign "rego" icon)
      doc.roundedRect(X(4), Y(4), 16 * s, 16 * s, 2 * s, 2 * s, "S");
      L(8, 9, 16, 9);
      L(8, 13, 16, 13);
      L(8, 17, 13, 17);
      break;
    }
    case "wrench": {
      // Simplified wrench head + diagonal handle
      C2(15, 7, 2.4);
      const lwSaved = doc.getLineWidth();
      doc.setLineWidth(0.55);
      L(13, 9, 4, 18.5);
      doc.setLineWidth(lwSaved);
      C2(4, 18.5, 1);
      break;
    }
    case "shield": {
      // Shield (M12 3 4 6 v6 c0 4.5 3.4 8.5 8 9 4.6 -.5 8 -4.5 8 -9 V6 l-8 -3 Z)
      doc.lines(
        [
          [-8 * s, 3 * s],
          [0, 6 * s],
          [4 * s, 5.5 * s],
          [4 * s, 1.5 * s],
          [4 * s, -1.5 * s],
          [4 * s, -5.5 * s],
          [0, -6 * s],
          [-8 * s, -3 * s],
        ],
        X(12), Y(3), [1, 1], "S", true
      );
      // Check mark
      L(9, 12, 11, 14);
      L(11, 14, 15, 10);
      break;
    }
    case "wheel": {
      // Tyre/spoked wheel — outer ring, hub, 8 spokes
      C2(12, 12, 9);
      C2(12, 12, 3.2);
      L(12, 3, 12, 6);     L(12, 18, 12, 21);
      L(3, 12, 6, 12);     L(18, 12, 21, 12);
      L(5.6, 5.6, 7.7, 7.7);    L(16.3, 16.3, 18.4, 18.4);
      L(5.6, 18.4, 7.7, 16.3);  L(16.3, 7.7, 18.4, 5.6);
      break;
    }
    case "clock": {
      C2(12, 12, 9);
      L(12, 7, 12, 12);
      L(12, 12, 15, 14);
      break;
    }
    default:
      C2(12, 12, 4);
  }

  // Reset stroke/cap/join so subsequent draws aren't affected
  doc.setLineCap("butt");
  doc.setLineJoin("miter");
  doc.setLineWidth(0.15);
  dr(doc, C.line);
}

// ───────── HEADER STRIP (used on all pages) ─────────
async function drawHeader(doc, logoData, meta) {
  const ok = await drawLogoSVG(doc, logoData, M, 10, 32, 9.6);
  if (!ok) {
    f(doc, "bold"); doc.setFontSize(11); tx(doc, C.blue);
    doc.text("POWERED BY POSITIVE", M, 16);
  }
  dr(doc, C.line); doc.setLineWidth(0.3);
  doc.line(M + 36, 11, M + 36, 19);
  f(doc, "bold"); doc.setFontSize(8); tx(doc, C.ink);
  doc.text(meta.tagTitle || "NOVATED LEASE", M + 39, 14);
  f(doc, "normal"); doc.setFontSize(7); tx(doc, C.muted);
  doc.text(meta.tagSub || "INDICATIVE QUOTE", M + 39, 18);

  // Top-right meta
  let mx = W - M;
  const rev = [...(meta.right || [])].reverse();
  rev.forEach(([k, v]) => {
    f(doc, "bold"); doc.setFontSize(9); tx(doc, C.ink);
    doc.text(String(v), mx, 16, { align: "right" });
    f(doc, "bold"); doc.setFontSize(5.5); tx(doc, C.muted);
    doc.text(String(k).toUpperCase(), mx, 11.5, { align: "right" });
    const tw = Math.max(doc.getTextWidth(String(v)) + 0, doc.getTextWidth(String(k))) + 8;
    mx -= Math.max(20, tw);
  });
}

// ───────── FOOTER STRIP (used on all pages) ─────────
async function drawFooter(doc, broker, logoData) {
  const y = 280;
  dr(doc, C.line); doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);

  // Avatar (initials in circle)
  const ini = (broker.name || "Broker").split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  fi(doc, C.blue);
  doc.circle(M + 3, y + 4, 2.6, "F");
  f(doc, "bold"); doc.setFontSize(6.2); tx(doc, C.wh);
  doc.text(ini, M + 3, y + 5, { align: "center" });

  // Left — broker block
  f(doc, "bold"); doc.setFontSize(5.5); tx(doc, C.muted);
  doc.text("YOUR BROKER", M + 8, y + 3);
  f(doc, "bold"); doc.setFontSize(7.5); tx(doc, C.ink2);
  doc.text(broker.name || "Your broker", M + 8, y + 6);
  f(doc, "normal"); doc.setFontSize(6.5); tx(doc, C.muted);
  doc.text((broker.phone || "") + "  ·  " + (broker.email || ""), M + 8, y + 9);

  // Right — Powered by Positive logo + head-office number inline (phone left of logo)
  const logoW = 18, logoH = 5.4;
  const logoX = W - M - logoW;
  const logoY = y + 4 - logoH / 2;
  await drawLogoSVG(doc, logoData, logoX, logoY, logoW, logoH);
  f(doc, "bold"); doc.setFontSize(8); tx(doc, C.blue);
  doc.text("1300 946 527", logoX - 2.5, y + 5.7, { align: "right" });
}

// ───────── PAGE 1 ─────────
async function drawPage1(doc, d, logoData) {
  const { quoteId, quoteDate, broker, customer, leaseTerm, annualKm, cycleLabel, cycleDiv,
          vehicleName, carClass, isEV, runningItems, monthlyRunning, mgmtFee, effectiveRate,
          driveaway, gstClaimed, applicationFee, c, annualFuel, totalSavingOverTerm,
          gstSaving } = d;

  await drawHeader(doc, logoData, {
    tagTitle: "NOVATED LEASE", tagSub: "INDICATIVE QUOTE",
    right: [["Quote", quoteId], ["Issued", quoteDate], ["Valid", "30 days"]],
  });

  let y = 28;

  // Eyebrow — only claim a customer name when we actually have one. Employer
  // and state still help a broker triage a printed quote when name is missing.
  fi(doc, C.lime); doc.circle(M + 1.4, y - 0.7, 0.9, "F");
  f(doc, "bold"); doc.setFontSize(7); tx(doc, C.blue);
  const ctxBits = [customer.employer, customer.state].filter(Boolean);
  const eyebrow = (customer.name
    ? ["Prepared for " + customer.name, ...ctxBits].join("  ·  ")
    : ["Indicative quote", ...ctxBits].join("  ·  ")
  ).toUpperCase();
  doc.text(eyebrow, M + 3.5, y);

  // Method pill (right)
  const methodLabel = isEV ? "EV · FBT EXEMPT" : "ECM · STATUTORY 20%";
  f(doc, "bold"); doc.setFontSize(6.5);
  const pillW = doc.getTextWidth(methodLabel) + 6;
  if (isEV) { fi(doc, C.lime); tx(doc, C.ink2); }
  else      { fi(doc, C.blue100); tx(doc, C.blue); }
  doc.roundedRect(W - M - pillW, y - 3.2, pillW, 4.8, 2, 2, "F");
  doc.text(methodLabel, W - M - pillW / 2, y + 0.2, { align: "center" });

  y += 6;

  // Hero title — shrink-then-wrap. Stay single-line as long as we can; allow
  // up to 2 lines at 18pt if the name still overflows. Never truncates silently.
  const ptMM = 0.3528;
  const titleText = vehicleName || carClass;
  let titleSize = 18;
  for (const sz of [24, 21, 18]) {
    f(doc, "bold"); doc.setFontSize(sz);
    if (doc.getTextWidth(titleText) <= CW) { titleSize = sz; break; }
    titleSize = sz;
  }
  f(doc, "bold"); doc.setFontSize(titleSize); tx(doc, C.ink);
  const titleLines = doc.getTextWidth(titleText) <= CW
    ? [titleText]
    : doc.splitTextToSize(titleText, CW).slice(0, 2);
  const titleLH = titleSize * ptMM * 1.15;
  titleLines.forEach((line, i) => {
    doc.text(line, M, y + 6 + i * titleLH);
  });

  y += 10 + (titleLines.length - 1) * titleLH;

  // Hero subtitle
  f(doc, "normal"); doc.setFontSize(10); tx(doc, C.muted);
  const subtitle = leaseTerm + "-year novated lease  ·  " + annualKm.toLocaleString() +
    " km/year  ·  paid " + cycleLabel.toLowerCase() + " from " +
    (isEV ? "pre-tax salary" : "pre-tax + post-tax salary");
  doc.text(subtitle, M, y + 5);

  y += 9;

  // ─── Hero grid: vehicle visual + number stack ───
  const heroH = 60;
  const heroLeftW = (CW - 6) * 0.575;
  const stackX = M + heroLeftW + 6;
  const stackW = CW - heroLeftW - 6;

  // Vehicle visual (left)
  fi(doc, C.bg2); dr(doc, C.line); doc.setLineWidth(0.25);
  if (d.vehicleImage) {
    drawVehicleImage(doc, d.vehicleImage, M, y, heroLeftW, heroH);
  } else {
    drawVehicleHero(doc, M, y, heroLeftW, heroH, vehicleName || carClass, carClass, isEV);
  }

  // Spec chips (bottom of vehicle box)
  const chips = [];
  if (d.vehicle.make)    chips.push(["MAKE", d.vehicle.make]);
  if (d.vehicle.model)   chips.push(["MODEL", d.vehicle.model]);
  if (d.vehicle.variant) chips.push(["VARIANT", d.vehicle.variant]);
  chips.push(["CLASS", carClass]);
  let cx = M + 3;
  const cyChip = y + heroH - 5;
  chips.slice(0, 4).forEach(([k, v]) => {
    const label = k + " " + v;
    f(doc, "bold"); doc.setFontSize(5.5);
    const lw = doc.getTextWidth(label) + 5;
    if (cx + lw > M + heroLeftW - 3) return;
    fi(doc, C.wh); dr(doc, C.line); doc.setLineWidth(0.15);
    doc.roundedRect(cx, cyChip - 3, lw, 4, 1.2, 1.2, "FD");
    tx(doc, C.blue); doc.text(k, cx + 1.5, cyChip);
    tx(doc, C.ink2); doc.text(v, cx + 1.5 + doc.getTextWidth(k) + 1.2, cyChip);
    cx += lw + 1.5;
  });

  // Hero number stack — top (dark hero card)
  const numH = (heroH - 5) * 0.62;
  fi(doc, C.ink);
  doc.roundedRect(stackX, y, stackW, numH, 4, 4, "F");
  f(doc, "bold"); doc.setFontSize(6.5); tx(doc, C.textOnDarkM);
  doc.text("NET COST TO YOUR TAKE-HOME PAY", stackX + 5, y + 6);
  // Big number = net wage impact per cycle
  const netPerCycle = c.pcAnnualTotal - (isEV ? c.pcTaxSavingEV : c.pcTaxSavingECM);
  f(doc, "bold"); doc.setFontSize(32); tx(doc, C.wh);
  doc.text(fmt(netPerCycle, 0), stackX + 5, y + numH / 2 + 7);
  f(doc, "normal"); doc.setFontSize(8); tx(doc, C.textOnDarkM);
  doc.text("per " + cycleNoun(cycleLabel) + "  ·  everything included", stackX + 5, y + numH - 4);

  // Hero number stack — bottom (lime savings card)
  const savY = y + numH + 5;
  const savH = heroH - numH - 5;
  fi(doc, C.lime);
  doc.roundedRect(stackX, savY, stackW, savH, 4, 4, "F");
  f(doc, "bold"); doc.setFontSize(6.5); tx(doc, [Math.round(C.ink2[0] * 0.9), Math.round(C.ink2[1] * 0.9), Math.round(C.ink2[2] * 0.9)]);
  doc.text("YOU KEEP", stackX + 5, savY + 5.5);
  f(doc, "bold"); doc.setFontSize(18); tx(doc, C.ink);
  doc.text(fmt(totalSavingOverTerm, 0), stackX + 5, savY + 13);
  f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.ink2);
  doc.text(
    "tax savings over " + leaseTerm + " yrs + " + fmt(gstSaving, 0) + " GST claimed",
    stackX + 5, savY + 17.5
  );

  y = y + heroH + 10;

  // ─── EVERYTHING INCLUDED ───
  f(doc, "bold"); doc.setFontSize(7.5); tx(doc, C.blue);
  doc.text("EVERYTHING INCLUDED IN YOUR PAYMENT", M, y);
  f(doc, "normal"); doc.setFontSize(7); tx(doc, C.muted);
  doc.text("per " + cycleNoun(cycleLabel) + ", GST-inclusive",
    M + doc.getTextWidth("EVERYTHING INCLUDED IN YOUR PAYMENT") + 6, y);

  y += 3;

  function getRunning(key) {
    const r = (runningItems || []).find((x) => x.key === key);
    return r ? r.annualVal : 0;
  }
  const incCells = [
    { lbl: "Lease",                            amt: (c.mFin * 12) / cycleDiv,        sub: "finance",    icon: "car" },
    { lbl: isEV ? "Charging" : "Fuel",         amt: annualFuel / cycleDiv,           sub: isEV ? "per km" : "@ pump", icon: isEV ? "bolt" : "fuel" },
    { lbl: "Rego",                             amt: getRunning("rego") / cycleDiv,   sub: customer.state || "rego", icon: "plate" },
    { lbl: "Service",                          amt: getRunning("service") / cycleDiv,sub: "scheduled",  icon: "wrench" },
    { lbl: "Insurance",                        amt: getRunning("insurance") / cycleDiv, sub: "comp.",   icon: "shield" },
    { lbl: "Tyres",                            amt: getRunning("tyres") / cycleDiv,  sub: "replace",    icon: "wheel" },
    { lbl: "Mgmt",                             amt: (mgmtFee * 12) / cycleDiv,       sub: "admin",      icon: "clock" },
  ];
  const incCellW = (CW - 6 * 1.5) / 7;
  const incCellH = 22;
  incCells.forEach((cell, i) => {
    const ix = M + i * (incCellW + 1.5);
    fi(doc, C.bg); dr(doc, C.line); doc.setLineWidth(0.15);
    doc.roundedRect(ix, y, incCellW, incCellH, 2, 2, "FD");
    // Icon — 5mm circle in blue100 with a simple pictogram drawn on top
    drawInclusionIcon(doc, ix + incCellW / 2, y + 5.5, 2.4, cell.icon);
    // Label
    f(doc, "bold"); doc.setFontSize(6.5); tx(doc, C.ink2);
    doc.text(cell.lbl, ix + incCellW / 2, y + 13, { align: "center" });
    // Amount (lead figure)
    f(doc, "bold"); doc.setFontSize(9); tx(doc, C.blue);
    doc.text(fmt(cell.amt, 0), ix + incCellW / 2, y + 17.5, { align: "center" });
    // Sub
    f(doc, "normal"); doc.setFontSize(5.5); tx(doc, C.muted);
    doc.text(cell.sub, ix + incCellW / 2, y + 20.5, { align: "center" });
  });

  y += incCellH + 8;

  // ─── COMPARISON ───
  f(doc, "bold"); doc.setFontSize(7.5); tx(doc, C.blue);
  doc.text("WHY SALARY PACKAGE IT?", M, y);
  y += 4;

  const cmpW = (CW - 4) / 2;
  const cmpH = 38;

  // Cash purchase (left)
  fi(doc, C.bg); dr(doc, C.line); doc.setLineWidth(0.15);
  doc.roundedRect(M, y, cmpW, cmpH, 3, 3, "FD");
  f(doc, "bold"); doc.setFontSize(6.5); tx(doc, C.muted);
  doc.text("CASH PURCHASE", M + 4, y + 6);
  f(doc, "bold"); doc.setFontSize(20); tx(doc, C.ink);
  doc.text(fmt(c.pcAnnualTotal, 0), M + 4, y + 17);
  f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.muted);
  doc.text("per " + cycleNoun(cycleLabel) + " after-tax", M + 4, y + 21.5);
  fi(doc, C.bg2);
  doc.roundedRect(M + 4, y + 24, cmpW - 8, 2, 1, 1, "F");
  fi(doc, C.ink2);
  doc.roundedRect(M + 4, y + 24, cmpW - 8, 2, 1, 1, "F");
  f(doc, "normal"); doc.setFontSize(7); tx(doc, C.muted);
  doc.text("Buy from take-home — cover running costs yourself.", M + 4, y + 32);

  // Salary package (right) — blue card
  const rx = M + cmpW + 4;
  fi(doc, C.blue);
  doc.roundedRect(rx, y, cmpW, cmpH, 3, 3, "F");
  f(doc, "bold"); doc.setFontSize(6.5); tx(doc, C.blueOn);
  doc.text(isEV ? "SALARY PACKAGE · FBT EXEMPT" : "SALARY PACKAGE · ECM", rx + 4, y + 6);
  f(doc, "bold"); doc.setFontSize(20); tx(doc, C.lime);
  doc.text(fmt(netPerCycle, 0), rx + 4, y + 17);
  f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.blueOn);
  doc.text("per " + cycleNoun(cycleLabel) + " to take-home", rx + 4, y + 21.5);
  fi(doc, [35, 95, 195]);
  doc.roundedRect(rx + 4, y + 24, cmpW - 8, 2, 1, 1, "F");
  const ratio = Math.max(0.4, Math.min(0.99, netPerCycle / Math.max(0.01, c.pcAnnualTotal)));
  fi(doc, C.lime);
  doc.roundedRect(rx + 4, y + 24, (cmpW - 8) * ratio, 2, 1, 1, "F");
  f(doc, "normal"); doc.setFontSize(7); tx(doc, C.blueOn);
  const saved = c.pcAnnualTotal - netPerCycle;
  const detail = "Save ~" + fmt(saved, 0) + "/" + cycleNoun(cycleLabel) +
    " = " + fmt(totalSavingOverTerm, 0) + " over " + leaseTerm + " yrs";
  doc.text(detail, rx + 4, y + 32);

  y += cmpH + 8;

  // ─── BREAKDOWN 3 cards ───
  const bdW = (CW - 4 * 2) / 3;
  const bdH = 38;

  function drawBd(x, title, rows) {
    fi(doc, C.bg); dr(doc, C.line); doc.setLineWidth(0.15);
    doc.roundedRect(x, y, bdW, bdH, 3, 3, "FD");
    f(doc, "bold"); doc.setFontSize(7); tx(doc, C.blue);
    doc.text(title.toUpperCase(), x + 4, y + 6);
    fi(doc, C.lime);
    doc.rect(x + 4, y + 6.8, doc.getTextWidth(title.toUpperCase()), 0.6, "F");
    // Distribute rows evenly between the title and bottom padding so all 3
    // cards fill the same height regardless of row count.
    const contentTop = 11;
    const contentH = bdH - contentTop - 3;
    const rowLH = contentH / rows.length;
    let ry = y + contentTop;
    rows.forEach(([k, v, accent]) => {
      f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.muted);
      doc.text(k, x + 4, ry + 3);
      f(doc, "bold"); tx(doc, accent || C.ink2);
      doc.text(String(v), x + bdW - 4, ry + 3, { align: "right" });
      dash(doc, x + 4, ry + rowLH - 2.5, x + bdW - 4);
      ry += rowLH;
    });
  }

  drawBd(M, "Pricing", [
    ["Drive-away",      fmt(driveaway, 2)],
    ["GST claimed",     fmt(gstClaimed, 2)],
    ["Application fee", fmt(applicationFee, 2)],
  ]);
  drawBd(M + bdW + 4, "Lease structure", [
    ["Term",        leaseTerm + " yrs (" + (leaseTerm * 12) + " mo)"],
    ["Kilometres",  annualKm.toLocaleString() + " / yr"],
    ["Residual ex GST (" + fmtPct(c.residualPct) + ")", fmt(c.residualExGST, 2)],
  ]);
  const cycShort = cycleLabel.toLowerCase() === "weekly" ? "wk" :
                   cycleLabel.toLowerCase() === "monthly" ? "mo" :
                   cycleLabel.toLowerCase() === "bi-monthly" ? "bm" : "fn";
  drawBd(M + (bdW + 4) * 2, isEV ? "Your EV tax position" : "Your ECM tax position", [
    ["Gross salary",                    fmt(d.annualSalary, 2)],
    ["Pre-tax / " + cycShort,           fmt(isEV ? c.pcSsEV : c.pcSsECM, 2)],
    [isEV ? "Post-tax / " + cycShort : "Post-tax (ECM) / " + cycShort,
                                        isEV ? "$0.00 (exempt)" : fmt(c.pcEcm, 2), isEV ? C.limeD : C.ink2],
    ["Tax saved / " + cycShort,         "~" + fmt(isEV ? c.pcTaxSavingEV : c.pcTaxSavingECM, 2), C.blue],
  ]);

  await drawFooter(doc, broker, logoData);
}

// ───────── PAGE 2 ─────────
async function drawPage2(doc, d, logoData) {
  const { quoteId, quoteDate, broker, customer, leaseTerm, annualKm, cycleLabel,
          isEV, vehicleName, carClass, c, gstSaving, totalSavingOverTerm } = d;

  await drawHeader(doc, logoData, {
    tagTitle: "NEXT STEP", tagSub: "Quote " + quoteId,
    right: customer.name
      ? [["Customer", customer.name], ["Issued", quoteDate]]
      : [["Issued", quoteDate]],
  });

  let y = 28;

  // Title block
  f(doc, "bold"); doc.setFontSize(7.5); tx(doc, C.blue);
  doc.text("NEXT STEP", M, y);
  f(doc, "bold"); doc.setFontSize(22); tx(doc, C.ink);
  doc.text("Ready to move forward?", M, y + 9);
  f(doc, "normal"); doc.setFontSize(9); tx(doc, C.muted);
  const p2Sub = doc.splitTextToSize(
    "A quick recap of the figures, the terms we're working under, and how to take the next step — your broker handles the application from here, and Powered by Positive picks it up once it's accepted.",
    CW - 20
  );
  doc.text(p2Sub, M, y + 15);

  y += 15 + p2Sub.length * 3.6 + 4;

  // Recap band (5 cells)
  const recapH = 16;
  fi(doc, C.bg2);
  doc.roundedRect(M, y, CW, recapH, 3, 3, "F");
  const netPerCycle = c.pcAnnualTotal - (isEV ? c.pcTaxSavingEV : c.pcTaxSavingECM);
  const veh = (vehicleName || carClass).split(" ").slice(0, 3).join(" ");
  const recapCells = [
    ["Vehicle", veh, "", null],
    ["Term · KM", leaseTerm + " yrs · " + Math.round(annualKm / 1000) + "k", "per year", null],
    ["Method", isEV ? "EV" : "ECM", isEV ? "FBT exempt" : "Statutory 20%", null],
    ["Per " + cycleNoun(cycleLabel), fmt(netPerCycle, 0), "net to take-home", C.blue],
    [leaseTerm + "-yr saving", fmt(totalSavingOverTerm, 0), "+ " + fmt(gstSaving, 0) + " GST", C.limeD],
  ];
  const rcW = CW / 5;
  recapCells.forEach(([k, v, s, color], i) => {
    const cx = M + i * rcW;
    f(doc, "bold"); doc.setFontSize(5.5); tx(doc, C.muted);
    doc.text(k.toUpperCase(), cx + 3, y + 4);
    f(doc, "bold"); doc.setFontSize(8.5); tx(doc, color || C.ink);
    doc.text(String(v), cx + 3, y + 9);
    f(doc, "normal"); doc.setFontSize(6); tx(doc, C.muted);
    doc.text(s, cx + 3, y + 13);
  });

  y += recapH + 4;

  // ECM explainer (ECM-only)
  if (!isEV) {
    const ecmH = 18;
    fi(doc, C.bg); dr(doc, C.line); doc.setLineWidth(0.2);
    doc.roundedRect(M, y, CW, ecmH, 3, 3, "FD");
    fi(doc, C.blue100);
    doc.roundedRect(M + 3, y + 3, 12, 12, 2, 2, "F");
    f(doc, "bold"); doc.setFontSize(9); tx(doc, C.blue);
    doc.text("ECM", M + 9, y + 10.5, { align: "center" });

    f(doc, "bold"); doc.setFontSize(9); tx(doc, C.ink);
    doc.text("What is the Employee Contribution Method?", M + 18, y + 6);
    f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.muted);
    const ecmText = doc.splitTextToSize(
      "ECM offsets your car's Fringe Benefits Tax by paying part of the lease from your post-tax salary — equal to 20% of the drive-away price each year. It zeroes out the FBT bill while keeping the rest of the lease pre-tax.",
      CW - 60
    );
    doc.text(ecmText, M + 18, y + 9.5);

    // Learn more button — dynamic width with vector arrow, inset from ECM card edge
    f(doc, "bold"); doc.setFontSize(7);
    const lmLabel = "Learn more";
    const lmArrowGap = 4.2;
    const lmTW = doc.getTextWidth(lmLabel) + lmArrowGap;
    const lmW = lmTW + 8;
    const lmX = W - M - lmW - 4;   // inset 4mm from the ECM container's right edge
    const lmY = y + 5.5;
    fi(doc, C.blue);
    doc.roundedRect(lmX, lmY, lmW, 7, 1.5, 1.5, "F");
    tx(doc, C.wh);
    const lmContentX = lmX + (lmW - lmTW) / 2;
    const lmLabelW = doc.getTextWidth(lmLabel);
    doc.text(lmLabel, lmContentX, lmY + 4.6);
    fi(doc, C.wh); dr(doc, C.wh);
    drawArrow(doc, lmContentX + lmLabelW + 1.2, lmY + 3.6, 3);
    doc.link(lmX, lmY, lmW, 7, { url: ECM_LEARN_MORE_URL });

    y += ecmH + 4;
  }

  // Broker card
  const brH = 18;
  fi(doc, C.bg); dr(doc, C.line); doc.setLineWidth(0.2);
  doc.roundedRect(M, y, CW, brH, 3, 3, "FD");
  const brokerIni = (broker.name || "Broker").split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  fi(doc, C.blue);
  doc.circle(M + 9, y + brH / 2, 5.5, "F");
  dr(doc, C.lime); doc.setLineWidth(0.7);
  doc.circle(M + 9, y + brH / 2, 5.8, "D");
  f(doc, "bold"); doc.setFontSize(10); tx(doc, C.wh);
  doc.text(brokerIni, M + 9, y + brH / 2 + 1.5, { align: "center" });

  f(doc, "bold"); doc.setFontSize(6.5); tx(doc, C.blue);
  doc.text("YOUR BROKER  ·  PRIMARY CONTACT", M + 19, y + 5);
  f(doc, "bold"); doc.setFontSize(11); tx(doc, C.ink);
  doc.text(broker.name || "Your broker", M + 19, y + 10);
  f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.muted);
  doc.text((broker.phone || "") + "  ·  " + (broker.email || ""), M + 19, y + 14);

  y += brH + 4;

  // Pathways
  const pwH = 36;
  const pwW1 = (CW - 5) * 0.58;
  const pwW2 = CW - pwW1 - 5;

  // Primary
  fi(doc, C.blue);
  doc.roundedRect(M, y, pwW1, pwH, 3, 3, "F");
  f(doc, "bold"); doc.setFontSize(6); tx(doc, C.blueOn);
  doc.text("OPTION A  ·  RECOMMENDED", M + 4, y + 5);
  f(doc, "bold"); doc.setFontSize(11); tx(doc, C.wh);
  doc.text("Start your application online", M + 4, y + 10.5);
  f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.blueOn);
  const pwBody = doc.splitTextToSize(
    "Secure form, pre-filled with everything on this quote. About 10 minutes — Powered by Positive picks it up after.",
    pwW1 - 8
  );
  doc.text(pwBody, M + 4, y + 14.5);
  // CTA button — dynamic width with vector arrow
  fi(doc, C.lime);
  doc.roundedRect(M + 4, y + pwH - 10, 50, 7, 1.5, 1.5, "F");
  f(doc, "bold"); doc.setFontSize(8); tx(doc, C.ink2);
  doc.text("Begin application", M + 6, y + pwH - 5.3);
  fi(doc, C.ink2); dr(doc, C.ink2);
  drawArrow(doc, M + 6 + doc.getTextWidth("Begin application") + 1.6, y + pwH - 6.3, 3.2);
  // CTA hook — the dev can wire this URL to Salesforce
  doc.link(M + 4, y + pwH - 10, 50, 7, { url: "https://positivesalarypackaging.tfaforms.net/38" });

  // Secondary
  fi(doc, C.bg2); dr(doc, C.line); doc.setLineWidth(0.2);
  doc.roundedRect(M + pwW1 + 5, y, pwW2, pwH, 3, 3, "FD");
  f(doc, "bold"); doc.setFontSize(6); tx(doc, C.muted);
  doc.text("OPTION B", M + pwW1 + 9, y + 5);
  f(doc, "bold"); doc.setFontSize(11); tx(doc, C.ink);
  doc.text("Walk through it on the phone", M + pwW1 + 9, y + 10.5);
  f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.muted);
  const pwBody2 = doc.splitTextToSize(
    "Prefer to chat first? Your broker can take you through privacy consent and the application together.",
    pwW2 - 8
  );
  doc.text(pwBody2, M + pwW1 + 9, y + 14.5);
  // Option B — phone CTA. Icon box removed; the label + phone number carry it.
  f(doc, "bold"); doc.setFontSize(5.5); tx(doc, C.muted);
  doc.text("CALL YOUR BROKER", M + pwW1 + 9, y + pwH - 9.5);
  f(doc, "bold"); doc.setFontSize(11); tx(doc, C.ink);
  doc.text(broker.phone || "—", M + pwW1 + 9, y + pwH - 5.5);

  y += pwH + 5;

  // Terms
  f(doc, "bold"); doc.setFontSize(7.5); tx(doc, C.blue);
  doc.text("WHAT YOU'RE AGREEING TO WHEN YOU START", M, y);
  y += 3.5;
  const termsArr = [
    ["Privacy consent — ", "you allow your broker and Powered by Positive to collect, use and share the information needed to arrange your novated lease (insurer, financier, employer, dealer) in line with the Privacy Policy."],
    ["Figures ",            "are based on the vehicle pricing and salary information you provided and may change. FBT, taxation rates and tax savings shown are estimates only." + (isEV ? " EV FBT exemption applies (eligible BEVs/PHEVs under $91,387 drive-away)." : " ECM applies because this vehicle is not eligible for the EV FBT exemption.")],
    ["Lease payment ",      "is based on a 2-month deferred lease structure. All applications are subject to normal credit criteria. Powered by Positive is not a financial adviser — seek independent advice before signing."],
    ["Fees ",               "may be incurred by manufacturers or suppliers in case of cancellation or amendment after the vehicle order is placed."],
  ];
  termsArr.forEach(([head, body], i) => {
    // Number badge
    fi(doc, C.blue100);
    doc.roundedRect(M, y, 4.5, 4.5, 1.2, 1.2, "F");
    f(doc, "bold"); doc.setFontSize(6.5); tx(doc, C.blue);
    doc.text(String(i + 1), M + 2.2, y + 3.2, { align: "center" });

    // All term type at 7pt — set BEFORE measuring/wrapping so widths match what
    // gets drawn. splitTextToSize uses the live font state.
    doc.setFontSize(7);
    f(doc, "bold");
    const headWidth = doc.getTextWidth(head);
    const termW = CW - 9;
    f(doc, "normal");
    // First line shares its row with the bold head → narrower target width.
    // Remaining lines wrap to the full column.
    const firstFit  = doc.splitTextToSize(body, termW - headWidth)[0] || "";
    const remainder = body.slice(firstFit.length).replace(/^\s+/, "");
    const restLines = remainder ? doc.splitTextToSize(remainder, termW) : [];
    const lineH = 3;

    const lineY = y + 3.2;
    f(doc, "bold"); tx(doc, C.ink);
    doc.text(head, M + 6.5, lineY);
    f(doc, "normal"); tx(doc, C.ink2);
    doc.text(firstFit, M + 6.5 + headWidth, lineY);
    restLines.forEach((line, k) => {
      doc.text(line, M + 6.5, lineY + (k + 1) * lineH);
    });
    y += (1 + restLines.length) * lineH + 2.5;
  });

  y += 1;

  // Consent callout
  const consH = 12;
  fi(doc, [245, 252, 222]);
  doc.roundedRect(M, y, CW, consH, 1.5, 1.5, "F");
  fi(doc, C.lime);
  doc.rect(M, y, 1.2, consH, "F");
  f(doc, "bold"); doc.setFontSize(7.5); tx(doc, C.ink);
  doc.text("Starting the application doesn't commit you to the lease.", M + 4, y + 4.5);
  f(doc, "normal"); doc.setFontSize(7); tx(doc, C.ink2);
  const consLines = doc.splitTextToSize(
    "You'll see final figures and full credit terms before anything is signed — this just gives your broker the green light to prepare the documents.",
    CW - 6
  );
  doc.text(consLines, M + 4, y + 8);

  y += consH + 3;

  // Disclaimer
  f(doc, "bold"); doc.setFontSize(6); tx(doc, C.ink2);
  doc.text("DISCLAIMER", M, y);
  y += 2.6;
  f(doc, "normal"); doc.setFontSize(6); tx(doc, C.muted);
  const disc = doc.splitTextToSize(
    "Running cost items and budgeted amounts are estimates only. This quote is indicative and does not constitute financial or taxation advice. Powered by Positive recommends seeking independent advice prior to entering any novated lease arrangement. Quote reference " + quoteId + " · issued " + quoteDate + " · valid for 30 days.",
    CW
  );
  doc.text(disc, M, y);

  await drawFooter(doc, broker, logoData);
}

// ───────── PAGE 3 (LCA SUPPLEMENT) — only when LCA applies ─────────
async function drawPage3LCA(doc, d, logoData) {
  const { quoteId, quoteDate, broker, customer, leaseTerm, c, cycleLabel, cycleDiv, monthlyRunning, mgmtFee } = d;

  await drawHeader(doc, logoData, {
    tagTitle: "SUPPLEMENT", tagSub: "Luxury car adjustment",
    right: customer.name
      ? [["Customer", customer.name], ["Quote", quoteId], ["Issued", quoteDate]]
      : [["Quote", quoteId], ["Issued", quoteDate]],
  });

  let y = 28;

  f(doc, "bold"); doc.setFontSize(7.5); tx(doc, C.blue);
  doc.text("SUPPLEMENT", M, y);
  f(doc, "bold"); doc.setFontSize(22); tx(doc, C.ink);
  doc.text("Why there's a luxury car adjustment.", M, y + 9);
  f(doc, "normal"); doc.setFontSize(9); tx(doc, C.muted);
  const sub = doc.splitTextToSize(
    "When a vehicle's drive-away price is above the ATO luxury car depreciation limit ($69,674 ex-GST), the financier can't deduct the full lease interest from corporate tax. The shortfall is recovered through the lease — this page shows you how.",
    CW - 10
  );
  doc.text(sub, M, y + 15);

  y += 15 + sub.length * 3.6 + 4;

  // Yearly LCA table
  const yrs = (c.lca && c.lca.years) || [];
  const cols = ["Year", "Depreciation", "Interest", "Shortfall", "After-tax · gross-up"];
  const colW = CW / cols.length;
  fi(doc, C.blue);
  doc.rect(M, y, CW, 7, "F");
  f(doc, "bold"); doc.setFontSize(7); tx(doc, C.wh);
  cols.forEach((h, i) => {
    const cx = M + i * colW + (i === 0 ? 3 : colW - 3);
    doc.text(h.toUpperCase(), cx, y + 4.6, { align: i === 0 ? "left" : "right" });
  });
  y += 7;
  let totDep = 0, totInt = 0, totSf = 0, totSs = 0;
  yrs.forEach((yr, i) => {
    fi(doc, i % 2 === 0 ? C.bg : C.bg2);
    doc.rect(M, y, CW, 6, "F");
    f(doc, "normal"); doc.setFontSize(7.5); tx(doc, C.ink2);
    doc.text("Year " + yr.yr, M + 3, y + 4);
    f(doc, "bold");
    doc.text(fmt(yr.dep, 2),      M + colW * 2 - 3, y + 4, { align: "right" });
    doc.text(fmt(yr.interest, 2), M + colW * 3 - 3, y + 4, { align: "right" });
    doc.text(fmt(yr.shortfall, 2),M + colW * 4 - 3, y + 4, { align: "right" });
    doc.text(fmt(yr.ss, 2),       M + colW * 5 - 3, y + 4, { align: "right" });
    totDep += yr.dep; totInt += yr.interest; totSf += yr.shortfall; totSs += yr.ss;
    y += 6;
  });
  fi(doc, C.bg2);
  doc.rect(M, y, CW, 7, "F");
  f(doc, "bold"); doc.setFontSize(7.5); tx(doc, C.ink);
  doc.text(leaseTerm + "-year total", M + 3, y + 4.6);
  doc.text(fmt(totDep, 2), M + colW * 2 - 3, y + 4.6, { align: "right" });
  doc.text(fmt(totInt, 2), M + colW * 3 - 3, y + 4.6, { align: "right" });
  doc.text(fmt(totSf, 2),  M + colW * 4 - 3, y + 4.6, { align: "right" });
  tx(doc, C.blue);
  doc.text(fmt(totSs, 2),  M + colW * 5 - 3, y + 4.6, { align: "right" });
  y += 7 + 6;

  // Impact card
  const impH = 22;
  fi(doc, C.ink);
  doc.roundedRect(M, y, CW, impH, 3, 3, "F");
  const monthlyWithoutLca = (c.mFin + monthlyRunning / 1.1 + mgmtFee) * 12 / cycleDiv;
  const impCells = [
    ["Without LCA",       fmt(monthlyWithoutLca, 0), "per " + cycleNoun(cycleLabel), C.wh],
    ["LCA add-on",        "+" + fmt(c.pcLca, 0),     "extra per " + cycleNoun(cycleLabel), C.orange],
    ["With LCA (page 1)", fmt(c.pcAnnualTotal, 0),   "per " + cycleNoun(cycleLabel), C.wh],
  ];
  const impCellW = CW / 3;
  impCells.forEach(([k, v, s, color], i) => {
    const ix = M + i * impCellW;
    f(doc, "bold"); doc.setFontSize(6); tx(doc, C.textOnDarkM);
    doc.text(k.toUpperCase(), ix + 4, y + 5);
    f(doc, "bold"); doc.setFontSize(14); tx(doc, color);
    doc.text(v, ix + 4, y + 13);
    f(doc, "normal"); doc.setFontSize(7); tx(doc, C.textOnDarkM);
    doc.text(s, ix + 4, y + 17.5);
  });

  await drawFooter(doc, broker, logoData);
}

// ─────────────────────────── Public API ───────────────────────────
export async function generatePbpPdf(data) {
  await ensureJsPDF();
  const logoData = await loadLogo();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Compute headline derived figures used across pages
  const totalSavingOverTerm = (data.isEV ? data.c.taxSavingEV : data.c.taxSavingECM) * data.leaseTerm;
  const d = { ...data, totalSavingOverTerm };

  await drawPage1(doc, d, logoData);
  doc.addPage();
  await drawPage2(doc, d, logoData);
  if (d.c.lca && d.c.lca.applies) {
    doc.addPage();
    await drawPage3LCA(doc, d, logoData);
  }

  const filename = "powered-by-positive-quote-" +
    ((data.customer.name || "employee").replace(/\s+/g, "-").toLowerCase()) + ".pdf";
  doc.save(filename);
}
