/**
 * Bundles the system documentation into ONE self-contained, shareable HTML
 * file (docs/system-documentation.html). It embeds the source markdown verbatim
 * and renders it in the browser with marked.js (markdown) + mermaid.js
 * (diagrams) from CDN — so the ER diagrams draw automatically and anyone can
 * understand the system by just opening the file.
 *
 *   node scripts/build-docs-html.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const OVERVIEW = `# Retail POS + ERP — System Guide

> A plain-language guide to how this platform is built. Read top to bottom; the
> diagrams render automatically. No coding knowledge needed for the Overview.

## What this product is
A cloud, GST-native **Point-of-Sale + ERP** for Indian retail — billing,
inventory, purchasing, customers, suppliers, GST returns, double-entry
accounting, payroll, and multi-branch stock transfers, all in one system. It is
**multi-tenant**: one software install serves many independent businesses, and
each business can have many branches (stores / warehouses).

## How the data is organised (the big picture)
- A **Vendor** (the software provider) runs the platform.
- Each customer business is an **Organization** (a *tenant*).
- An Organization owns one or more **Stores** (branches / warehouses).
- Almost everything else — products, sales, purchases, ledgers — belongs to a
  **Store**. Every database query is locked to a store, so one business can
  never see another's data.

\`\`\`mermaid
flowchart TD
  V[Vendor / Platform] --> O[Organization · the tenant business]
  O --> S1[Store / Branch]
  O --> S2[Warehouse]
  S1 --> P[Products & Inventory]
  S1 --> SA[Sales / POS Billing]
  S1 --> PU[Purchases & Suppliers]
  S1 --> AC[Accounting Ledger]
  S1 --> GST[GST Returns]
  S1 --> PR[Payroll]
\`\`\`

## The modules
| Module | What it does |
|---|---|
| **POS / Billing** | Ring up sales, split payments, print/share invoices, warranties, e-invoice (IRN) |
| **Inventory** | Product master, barcodes, serial units, stock, low-stock alerts |
| **Purchases** | Purchase orders, goods receipt (GRN), supplier payments |
| **Customers / Suppliers** | Party masters, credit, outstanding balances |
| **Accounting** | Double-entry ledger, vouchers, trial balance, P&L, balance sheet |
| **GST** | Item-level CGST/SGST/IGST, GSTR-1 / GSTR-3B, e-invoicing |
| **Payroll** | Employees, salary structure, payslips (PF/ESI/TDS) |
| **Multi-store** | Inter-branch stock transfers, per-branch reporting |
| **Platform** | Subscriptions, billing, support — run by the vendor |

## The five guarantees (why the books are always right)
1. **All-or-nothing transactions** — a sale saves the invoice, reduces stock,
   posts the ledger and records GST together, or none of it at all.
2. **Tax per line item** — CGST/SGST within a state, IGST across states,
   computed for every product line (not per bill).
3. **Double-entry** — every rupee has a matching debit and credit; totals must
   balance at all times.
4. **Immutable records** — sales, ledger entries and stock movements are never
   edited after creation; corrections are new reversal documents.
5. **Tenant isolation** — every record is scoped to a store from the signed-in
   user's token; cross-business access is impossible.

## How to read the rest of this document
- **ER Diagrams** — visual map of every data table and how they connect.
- **Schema Reference** — every field of every table, with types and indexes.
- **Algorithms & Logic** — what each calculation does and where it lives.
`;

const SECTIONS = [
  { id: 'overview', title: 'Overview', md: OVERVIEW },
  { id: 'erd', title: 'ER Diagrams', md: readFileSync('docs/database-schema-erd.md', 'utf8') },
  { id: 'schema', title: 'Schema Reference', md: readFileSync('docs/database-schema.md', 'utf8') },
  { id: 'algorithms', title: 'Algorithms & Logic', md: readFileSync('docs/algorithms-and-logic.md', 'utf8') },
];

// Sanity: <script type="text/plain"> only breaks on a literal </script>.
for (const s of SECTIONS) {
  if (/<\/script>/i.test(s.md)) {
    throw new Error(`Section "${s.title}" contains </script> — would break the embed.`);
  }
}

const sectionsHtml = SECTIONS.map(
  (s) => `      <section id="sec-${s.id}" class="doc">
        <script type="text/plain" class="md-source">${s.md}</script>
        <div class="md-rendered"></div>
      </section>`,
).join('\n');

const navHtml = SECTIONS.map(
  (s) => `<a href="#sec-${s.id}" class="nav-top">${s.title}</a>`,
).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Retail POS + ERP — System Documentation</title>
<style>
  :root { --bg:#0b1020; --panel:#11182e; --ink:#1f2937; --muted:#64748b;
          --blue:#2563eb; --line:#e5e7eb; --code:#f6f8fa; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
         color:var(--ink); background:#fff; }
  /* top banner */
  header.top { background:linear-gradient(135deg,#0b1020,#1e293b); color:#fff;
               padding:28px 32px; position:sticky; top:0; z-index:20;
               display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  header.top h1 { margin:0; font-size:20px; }
  header.top .sub { color:#94a3b8; font-size:13px; margin-top:2px; }
  header.top nav { display:flex; gap:8px; flex-wrap:wrap; }
  header.top nav a { color:#cbd5e1; text-decoration:none; font-size:13px;
                     padding:6px 12px; border:1px solid #334155; border-radius:999px; }
  header.top nav a:hover { background:#334155; color:#fff; }
  /* layout */
  .wrap { display:grid; grid-template-columns:280px 1fr; max-width:1400px; margin:0 auto; }
  aside { border-right:1px solid var(--line); padding:20px 12px; position:sticky; top:92px;
          align-self:start; height:calc(100vh - 92px); overflow:auto; }
  aside .toc-title { font-size:11px; text-transform:uppercase; letter-spacing:.08em;
                     color:var(--muted); margin:14px 8px 6px; }
  aside a { display:block; color:#334155; text-decoration:none; font-size:13px;
            padding:4px 8px; border-radius:6px; }
  aside a:hover { background:#f1f5f9; }
  aside a.h3 { padding-left:22px; color:var(--muted); font-size:12px; }
  main { padding:28px 40px; min-width:0; }
  /* content typography */
  .md-rendered h1 { font-size:30px; border-bottom:2px solid var(--line); padding-bottom:10px; margin-top:48px; }
  .md-rendered h2 { font-size:23px; margin-top:40px; border-bottom:1px solid var(--line); padding-bottom:6px; }
  .md-rendered h3 { font-size:18px; margin-top:28px; }
  .md-rendered h4 { font-size:15px; margin-top:20px; }
  .md-rendered code { background:var(--code); padding:2px 6px; border-radius:5px;
                      font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .md-rendered pre { background:var(--code); padding:16px; border-radius:10px; overflow:auto;
                     border:1px solid var(--line); }
  .md-rendered pre code { background:none; padding:0; font-size:12.5px; }
  .md-rendered table { border-collapse:collapse; width:100%; margin:16px 0; font-size:13.5px; display:block; overflow:auto; }
  .md-rendered th, .md-rendered td { border:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top; }
  .md-rendered th { background:#f8fafc; }
  .md-rendered blockquote { margin:16px 0; padding:10px 16px; border-left:4px solid var(--blue);
                            background:#eff6ff; border-radius:0 8px 8px 0; color:#1e3a5f; }
  .md-rendered a { color:var(--blue); }
  .md-rendered .mermaid { background:#fff; border:1px solid var(--line); border-radius:10px;
                          padding:16px; margin:18px 0; text-align:center; overflow:auto; }
  .doc { scroll-margin-top:100px; }
  .md-rendered h1,.md-rendered h2,.md-rendered h3 { scroll-margin-top:100px; }
  footer { color:var(--muted); font-size:12px; padding:30px 40px; border-top:1px solid var(--line); }
  @media (max-width: 900px) {
    .wrap { grid-template-columns:1fr; }
    aside { display:none; }
    main { padding:20px; }
  }
</style>
</head>
<body>
  <header class="top">
    <div>
      <h1>Retail POS + ERP — System Documentation</h1>
      <div class="sub">Multi-tenant GST POS &amp; ERP · generated ${'$'}{DATE}</div>
    </div>
    <nav>${navHtml}</nav>
  </header>
  <div class="wrap">
    <aside><div class="toc-title">Contents</div><div id="toc"></div></aside>
    <main>
${sectionsHtml}
    </main>
  </div>
  <footer>
    Generated from the project docs (Overview · ER Diagrams · Schema Reference · Algorithms).
    Diagrams render via Mermaid. Open in any modern browser.
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad:false, theme:'default', securityLevel:'loose',
                         flowchart:{ htmlLabels:true }, er:{ useMaxWidth:true } });

    const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    const tocEl = document.getElementById('toc');

    document.querySelectorAll('section.doc').forEach((sec) => {
      const src = sec.querySelector('.md-source').textContent;
      const out = sec.querySelector('.md-rendered');
      out.innerHTML = marked.parse(src);

      // Convert \`\`\`mermaid code blocks into <pre class="mermaid"> for rendering.
      out.querySelectorAll('code.language-mermaid').forEach((code) => {
        const pre = code.closest('pre');
        const div = document.createElement('pre');
        div.className = 'mermaid';
        div.textContent = code.textContent; // decoded text
        pre.replaceWith(div);
      });
    });

    // Build the sidebar TOC from rendered headings.
    document.querySelectorAll('.md-rendered h1, .md-rendered h2, .md-rendered h3').forEach((h) => {
      if (!h.id) h.id = slug(h.textContent);
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      if (h.tagName === 'H3') a.className = 'h3';
      if (h.tagName === 'H1') a.style.fontWeight = '700';
      tocEl.appendChild(a);
    });

    await mermaid.run({ querySelector: '.mermaid' });
  </script>
</body>
</html>
`;

// Stamp the date without using Date in the template literal collisions.
const dated = html.replace("${DATE}", new Date().toISOString().slice(0, 10));
writeFileSync('docs/system-documentation.html', dated, 'utf8');
console.log('Wrote docs/system-documentation.html (' + (dated.length / 1024).toFixed(0) + ' KB)');
