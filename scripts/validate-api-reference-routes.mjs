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
  r = r.replace(/^\/+/, ""); // store as no leading slash
  r = r.replace(/\/+$/, "");
  return r;
}

function mdxToRoute(absPath) {
  const rel = path.relative(repoRoot, absPath).replaceAll(path.sep, "/");
  if (!rel.endsWith(".mdx")) return null;
  return rel.slice(0, -".mdx".length);
}

function collectNavPages(node, out) {
  if (!node) return;
  if (typeof node === "string") {
    out.push(normalizeRoute(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectNavPages(item, out);
    return;
  }
  if (typeof node === "object") {
    // Mintlify nav objects tend to have `pages` and/or `root`
    if (typeof node.root === "string") out.push(normalizeRoute(node.root));
    if (node.pages) collectNavPages(node.pages, out);
    if (node.groups) collectNavPages(node.groups, out);
    if (node.tabs) collectNavPages(node.tabs, out);
  }
}

function scanLinksInMdx(absPath) {
  const text = fs.readFileSync(absPath, "utf8");
  const rel = path.relative(repoRoot, absPath).replaceAll(path.sep, "/");
  const findings = [];

  // Match markdown links [text](/api-reference/foo#bar) and bare (/api-reference/foo)
  // Not perfect, but good coverage for common authoring patterns.
  const re = /(?:\[[^\]]*\]\()?(\/api-reference\/[a-z0-9\-\/]+)(#[a-z0-9\-\/]+)?(?:\))?/gi;
  let m;
  while ((m = re.exec(text))) {
    const hrefPath = m[1]; // starts with /api-reference/...
    const hrefHash = m[2] ?? "";
    findings.push({
      file: rel,
      href: `${hrefPath}${hrefHash}`,
      route: normalizeRoute(hrefPath),
    });
  }
  return findings;
}

function main() {
  const docsJsonPath = path.join(repoRoot, "docs.json");
  const docs = JSON.parse(fs.readFileSync(docsJsonPath, "utf8"));

  const navRoutes = [];
  collectNavPages(docs?.navigation, navRoutes);
  const navApiRoutes = new Set(
    navRoutes.filter(Boolean).filter((r) => r.startsWith("api-reference/")),
  );

  const apiRefDir = path.join(repoRoot, "api-reference");
  const apiMdxFiles = fs.existsSync(apiRefDir)
    ? walk(apiRefDir, (p) => p.endsWith(".mdx"))
    : [];
  const apiFileRoutes = new Set(apiMdxFiles.map(mdxToRoute).filter(Boolean));

  const missingFromNav = [...apiFileRoutes].filter((r) => !navApiRoutes.has(r));
  const missingFiles = [...navApiRoutes].filter((r) => !apiFileRoutes.has(r));

  const allMdx = walk(repoRoot, (p) => p.endsWith(".mdx"));
  const linkFindings = allMdx.flatMap(scanLinksInMdx);
  const brokenApiLinks = linkFindings.filter(
    (f) => !apiFileRoutes.has(f.route) && !navApiRoutes.has(f.route),
  );

  const report = {
    counts: {
      api_reference_mdx_files: apiMdxFiles.length,
      api_reference_routes_in_docs_json: navApiRoutes.size,
      mdx_files_scanned_for_links: allMdx.length,
      api_reference_links_found: linkFindings.length,
    },
    missing_from_docs_json_navigation: missingFromNav.sort(),
    docs_json_routes_missing_files: missingFiles.sort(),
    broken_api_reference_links: brokenApiLinks,
  };

  const ok =
    report.missing_from_docs_json_navigation.length === 0 &&
    report.docs_json_routes_missing_files.length === 0 &&
    report.broken_api_reference_links.length === 0;

  // Print a readable summary, then JSON for details.
  const summaryLines = [];
  summaryLines.push(
    `api-reference MDX files: ${report.counts.api_reference_mdx_files}`,
  );
  summaryLines.push(
    `api-reference routes in docs.json: ${report.counts.api_reference_routes_in_docs_json}`,
  );
  summaryLines.push(
    `missing from docs.json nav: ${report.missing_from_docs_json_navigation.length}`,
  );
  summaryLines.push(
    `docs.json routes missing files: ${report.docs_json_routes_missing_files.length}`,
  );
  summaryLines.push(
    `broken /api-reference links in MDX: ${report.broken_api_reference_links.length}`,
  );

  // eslint-disable-next-line no-console
  console.log(summaryLines.join("\n"));
  // eslint-disable-next-line no-console
  console.log("\n---\n");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));

  process.exit(ok ? 0 : 1);
}

main();

