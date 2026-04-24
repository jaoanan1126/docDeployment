import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());

function walk(dir, predicate) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (predicate(p)) out.push(p);
    }
  }
  return out;
}

function normalizeRoute(route) {
  if (!route) return null;
  let r = String(route).trim();
  r = r.replace(/^\/+/, "");
  r = r.replace(/\/+$/, "");
  return r;
}

function mdxToRoute(absPath) {
  const rel = path.relative(repoRoot, absPath).replaceAll(path.sep, "/");
  if (!rel.endsWith(".mdx")) return null;
  return rel.slice(0, -".mdx".length);
}

function parseOpenapiFrontmatter(absPath) {
  const text = fs.readFileSync(absPath, "utf8");
  if (!text.startsWith("---")) return null;

  const endIdx = text.indexOf("\n---", 3);
  if (endIdx === -1) return null;
  const fm = text.slice(0, endIdx + "\n---".length);

  const openapiLine = fm
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.toLowerCase().startsWith("openapi:"));
  if (!openapiLine) return null;

  const m = openapiLine.match(
    /^openapi:\s*(get|post|put|patch|delete)\s+([^\s]+)\s*$/i,
  );
  if (!m) return null;
  return { method: m[1].toLowerCase(), openapiPath: m[2] };
}

function toAnchorId(method, openapiPath) {
  // Matches Mintlify's default OpenAPI anchor generation:
  // post + /developer/v1/accounting/tax/rates -> post-developer-v1-accounting-tax-rates
  const p = String(openapiPath).replace(/^\/+/, "");
  // replace path separators with '-' and strip braces
  const normalized = p
    .replaceAll("/", "-")
    .replaceAll("{", "")
    .replaceAll("}", "")
    .replaceAll("_", "-");
  return `${method}-${normalized}`.toLowerCase();
}

function buildAnchorToRouteMap() {
  const apiRefDir = path.join(repoRoot, "api-reference");
  if (!fs.existsSync(apiRefDir)) return new Map();
  const mdxFiles = walk(apiRefDir, (p) => p.endsWith(".mdx"));
  const map = new Map();
  for (const f of mdxFiles) {
    const route = mdxToRoute(f);
    const op = parseOpenapiFrontmatter(f);
    if (!route || !op) continue;
    const anchor = toAnchorId(op.method, op.openapiPath);
    map.set(anchor, route);
  }
  return map;
}

function scanAndFixFile(absPath, anchorToRoute, routeFallbacks) {
  const before = fs.readFileSync(absPath, "utf8");
  let after = before;
  const rel = path.relative(repoRoot, absPath).replaceAll(path.sep, "/");

  // Known legacy anchor aliases (old -> current)
  const anchorAliases = new Map([
    // Limits create endpoint is now deferred in this docs set
    ["post-developer-v1-limits", "post-developer-v1-limits-deferred"],
  ]);

  // Replace both markdown links and bare paren links pointing to /api-reference/...
  const re = /(\/api-reference\/[a-z0-9\-\/]+)(#[a-z0-9\-\/]+)?/gi;

  const replacements = [];
  after = after.replace(re, (full, hrefPath, hash = "") => {
    const route = normalizeRoute(hrefPath);
    const hashNoPound = hash ? hash.slice(1) : "";

    // If it already points at an actual route under api-reference/, leave it.
    // (We only rewrite when we can confidently resolve.)
    let resolved = null;
    if (hashNoPound) {
      const normalizedHash =
        anchorToRoute.has(hashNoPound)
          ? hashNoPound
          : anchorAliases.get(hashNoPound);
      if (normalizedHash && anchorToRoute.has(normalizedHash)) {
        resolved = `/${anchorToRoute.get(normalizedHash)}#${normalizedHash}`;
      }
    } else if (!hashNoPound && routeFallbacks.has(route)) {
      resolved = `/${routeFallbacks.get(route)}`;
    } else {
      return full;
    }

    // Keep original hash if it wasn't the OpenAPI anchor (rare)
    // but here we always use the resolved anchor when present.
    if (resolved !== full) replacements.push({ from: full, to: resolved });
    return resolved;
  });

  if (after === before) return { file: rel, changed: false, replacements: [] };
  fs.writeFileSync(absPath, after);
  return { file: rel, changed: true, replacements };
}

function main() {
  const anchorToRoute = buildAnchorToRouteMap();

  // Fallbacks for non-hash /api-reference/<group> links
  const routeFallbacks = new Map([
    ["api-reference/vendors", "api-reference/vendor/list-vendors"],
    ["api-reference/users", "api-reference/user/list-users"],
    ["api-reference/limits", "api-reference/limit/list-limits"],
    ["api-reference/cards", "api-reference/card/list-cards"],
    ["api-reference/transactions", "api-reference/transaction/list-transactions"],
    ["api-reference/spend-programs", "api-reference/spend-program/list-spend-programs"],
    ["api-reference/reimbursements", "api-reference/reimbursement/list-reimbursements"],
    ["api-reference/receipts", "api-reference/receipt/list-receipts"],
    ["api-reference/purchase-orders", "api-reference/purchase-order/list-purchase-orders"],
    ["api-reference/unified-requests", "api-reference/unified-request/list-unified-requests-with-pagination"],
    ["api-reference/repayments", "api-reference/repayment/list-repayments"],
    ["api-reference/audit-logs", "api-reference/audit-log/get-audit-log-events"],
    ["api-reference/trips", "api-reference/trips/list-all-trips-for-the-business"],
    ["api-reference/bills", "api-reference/bill/list-bills"],
    ["api-reference/applications", "api-reference/application/fetch-a-financing-application"],
    ["api-reference/entities", "api-reference/business-entities/list-business-entities"],
    // Legacy custom-records grouping pages used in some guides
    ["api-reference/custom-records-configuration", "api-reference/custom-records/list-custom-tables"],
    ["api-reference/custom-records-native-tables", "api-reference/custom-records/list-native-ramp-tables"],
    ["api-reference/custom-records-custom-tables", "api-reference/custom-records/list-custom-tables"],
  ]);

  const mdxFiles = walk(repoRoot, (p) => p.endsWith(".mdx") && !p.includes("/node_modules/"));
  const changes = [];
  for (const f of mdxFiles) {
    const res = scanAndFixFile(f, anchorToRoute, routeFallbacks);
    if (res.changed) changes.push(res);
  }

  // eslint-disable-next-line no-console
  console.log(`files changed: ${changes.length}`);
  for (const c of changes) {
    // eslint-disable-next-line no-console
    console.log(`- ${c.file}: ${c.replacements.length} link(s) updated`);
  }
}

main();

