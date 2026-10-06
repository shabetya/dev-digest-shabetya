#!/usr/bin/env python3
"""dependencies-checker: read-only data collector (stdlib only).

Usage: python3 collect.py [--root DIR] [--online] [--packages a,b,c]
Prints one JSON document to stdout. Never writes to the repo, never installs.
--online additionally runs `outdated` and `audit` (queries the npm registry).
"""
import argparse, gzip, json, os, re, subprocess, sys
from pathlib import Path

DEFAULT_PKGS = ["server", "client", "reviewer-core", "e2e", "mcp-server"]
SRC_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}
SKIP_DIRS = {"node_modules", ".next", "dist", "clones", ".git", "coverage", ".devdigest"}
IMPORT_RE = re.compile(
    r"""(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"]([^'"\n]+)['"]""")


def pkg_name(spec):
    if spec.startswith((".", "/", "node:", "@/", "~")):
        return None
    parts = spec.split("/")
    return "/".join(parts[:2]) if spec.startswith("@") else parts[0]


def load_json(p):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return None


def strip_jsonc(text):
    # tsconfig is JSONC; only strip comments that start a line (globs like "src/*" must survive)
    text = re.sub(r"(?m)^\s*//.*$", "", text)
    text = re.sub(r"(?ms)^\s*/\*.*?\*/\s*$", "", text)
    return re.sub(r",(\s*[}\]])", r"\1", text)


# ---------- sizes ----------
_own_cache, _seen_inodes = {}, set()


def own_size(real, seen):
    """Bytes of a package dir, excluding nested node_modules, deduped by inode."""
    total = 0
    for dp, dns, fns in os.walk(real):
        dns[:] = [d for d in dns if d != "node_modules"]
        for f in fns:
            try:
                st = os.lstat(os.path.join(dp, f))
            except OSError:
                continue
            key = (st.st_dev, st.st_ino)
            if key in seen:
                continue
            seen.add(key)
            total += st.st_size
    return total


def find_dep(name, start_real):
    cur = Path(start_real)
    for anc in [cur, *cur.parents]:
        cand = anc / "node_modules" / name
        if cand.exists():
            return os.path.realpath(cand)
        if anc == anc.parent:
            break
    return None


def closure(real, visited):
    """All resolved package dirs reachable from `real` via dependencies."""
    if real in visited:
        return
    visited.add(real)
    pj = load_json(Path(real) / "package.json") or {}
    for dep in {**pj.get("dependencies", {}), **pj.get("optionalDependencies", {})}:
        r = find_dep(dep, real)
        if r:
            closure(r, visited)


def human(kb):
    return "?" if kb is None else (f"{kb/1024:.1f} MB" if kb >= 1024 else f"{kb:.0f} KB")


def fmt_kb(b):
    return round(b / 1024, 1)


def measure(pkg_dir, name):
    nm = pkg_dir / "node_modules" / name
    if not nm.exists():
        return None
    real = os.path.realpath(nm)
    alone = own_size(real, set())
    vis = set()
    closure(real, vis)
    seen = set()
    total = sum(own_size(r, seen) for r in vis)
    pj = load_json(Path(real) / "package.json") or {}
    return {"installed_version": pj.get("version"), "own_kb": fmt_kb(alone),
            "with_transitive_kb": fmt_kb(total), "transitive_count": len(vis) - 1}


# ---------- usage ----------
def scan_usage(pkg_dir):
    used, files = set(), 0
    for dp, dns, fns in os.walk(pkg_dir):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for f in fns:
            if Path(f).suffix in SRC_EXT or f in ("package.json",) and dp == str(pkg_dir):
                try:
                    text = Path(dp, f).read_text(errors="ignore")
                except OSError:
                    continue
                files += 1
                if f == "package.json":
                    continue
                for m in IMPORT_RE.finditer(text):
                    n = pkg_name(m.group(1))
                    if n:
                        used.add(n)
    # tools referenced from npm scripts / root configs (eslint, vitest, tsx, ...)
    pj = load_json(pkg_dir / "package.json") or {}
    blob = " ".join(pj.get("scripts", {}).values())
    for f in pkg_dir.glob("*"):
        if f.is_file() and f.suffix in {".json", ".mjs", ".js", ".ts", ".cjs"} and f.name not in ("package.json", "pnpm-lock.yaml", "package-lock.json", "tsconfig.tsbuildinfo"):
            blob += " " + f.read_text(errors="ignore")
    return used, blob


def IMPLICIT(pj):
    """Deps consumed by tooling without an import/script mention."""
    imp = {"typescript": 1, "@types/node": 1}
    if "next" in pj.get("dependencies", {}):
        imp.update({"react-dom": 1, "@types/react-dom": 1, "postcss": 1, "@tailwindcss/postcss": 1, "tailwindcss": 1})
    return imp


def likely_unused(pkg_dir, pj):
    used, blob = scan_usage(pkg_dir)
    out = []
    for section in ("dependencies", "devDependencies"):
        for dep in pj.get(section, {}):
            base = dep[len("@types/"):] if dep.startswith("@types/") else dep
            if dep.startswith("@types/") and "__" in base:
                base = "@" + base.replace("__", "/")
            if dep in used or base in used or dep in blob or base in blob or dep in IMPLICIT(pj):
                continue
            out.append({"name": dep, "section": section})
    return out


# ---------- aliases / graph ----------
def aliases(pkg_dir, packages, root):
    ts = pkg_dir / "tsconfig.json"
    try:
        cfg = json.loads(strip_jsonc(ts.read_text()))
    except Exception:
        return []
    edges = []
    for alias, targets in (cfg.get("compilerOptions", {}).get("paths") or {}).items():
        for t in targets:
            tp = os.path.normpath(pkg_dir / t)
            rel = os.path.relpath(tp, root)
            owner = rel.split(os.sep)[0]
            kind = "vendored" if "/vendor/" in rel.replace(os.sep, "/") else "alias"
            edges.append({"alias": alias, "target": rel, "owner": owner, "kind": kind})
    return edges


def vendored_drift(root):
    a, b = root / "server/src/vendor/shared", root / "client/src/vendor/shared"
    if not (a.exists() and b.exists()):
        return None
    fa = {p.relative_to(a): p for p in a.rglob("*") if p.is_file()}
    fb = {p.relative_to(b): p for p in b.rglob("*") if p.is_file()}
    differ = sorted(str(k) for k in fa.keys() & fb.keys() if fa[k].read_bytes() != fb[k].read_bytes())
    return {"only_in_server": sorted(map(str, fa.keys() - fb.keys())),
            "only_in_client": sorted(map(str, fb.keys() - fa.keys())),
            "differing": differ, "identical": len(fa.keys() & fb.keys()) - len(differ)}


# ---------- client bundle ----------
def client_bundle(root):
    chunks = root / "client/.next/static/chunks"
    if not chunks.exists():
        return {"available": False, "hint": "run `cd client && pnpm build` (read-only check skipped it)"}
    rows = []
    for p in chunks.rglob("*.js"):
        raw = p.read_bytes()
        rows.append({"file": str(p.relative_to(chunks)), "raw_kb": fmt_kb(len(raw)),
                     "gzip_kb": fmt_kb(len(gzip.compress(raw, 6)))})
    rows.sort(key=lambda r: -r["raw_kb"])
    return {"available": True, "total_raw_kb": round(sum(r["raw_kb"] for r in rows), 1),
            "total_gzip_kb": round(sum(r["gzip_kb"] for r in rows), 1),
            "chunk_count": len(rows), "top_chunks": rows[:10],
            "built_at": __import__("datetime").datetime.fromtimestamp(os.path.getmtime(chunks)).isoformat(timespec="minutes")}


# ---------- online ----------
def run(cmd, cwd):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120)
        return r.stdout
    except Exception as e:
        return None


def online(pkg_dir, uses_pnpm):
    res = {"outdated": None, "audit": None}
    base = ["pnpm"] if uses_pnpm else ["npm"]
    out = run(base + (["outdated", "--format", "json"] if uses_pnpm else ["outdated", "--json"]), pkg_dir)
    try:
        data = json.loads(out) if out and out.strip() else {}
        res["outdated"] = [{"name": k, "current": v.get("current"), "latest": v.get("latest"),
                            "wanted": v.get("wanted")} for k, v in data.items()]
    except Exception:
        pass
    out = run(base + ["audit", "--json"], pkg_dir)
    try:
        d = json.loads(out)
        meta = d.get("metadata", {}).get("vulnerabilities") or {}
        advisories = []
        for k, v in (d.get("advisories") or {}).items():          # pnpm
            advisories.append({"name": v.get("module_name"), "severity": v.get("severity"), "title": v.get("title")})
        for k, v in (d.get("vulnerabilities") or {}).items():     # npm
            advisories.append({"name": k, "severity": v.get("severity"), "title": None})
        res["audit"] = {"counts": meta, "advisories": advisories[:30]}
    except Exception:
        pass
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--online", action="store_true")
    ap.add_argument("--packages", default=",".join(DEFAULT_PKGS))
    a = ap.parse_args()
    root = Path(a.root).resolve()
    names = [p for p in a.packages.split(",") if (root / p / "package.json").exists()]
    report = {"root": str(root), "packages": {}, "version_conflicts": [], "warnings": []}
    versions = {}
    graph_edges, ext_nodes = [], []

    for n in names:
        d = root / n
        pj = load_json(d / "package.json")
        uses_pnpm = (d / "pnpm-lock.yaml").exists()
        entry = {"npm_name": pj.get("name"), "manager": "pnpm" if uses_pnpm else "npm",
                 "installed": (d / "node_modules").exists(), "deps": [], "aliases": aliases(d, names, root)}
        if not entry["installed"]:
            report["warnings"].append(f"{n}: node_modules missing — sizes unavailable (run install first)")
        for section in ("dependencies", "devDependencies"):
            for dep, rng in pj.get(section, {}).items():
                row = {"name": dep, "section": section, "range": rng}
                versions.setdefault(dep, []).append((n, rng))
                if entry["installed"]:
                    m = measure(d, dep)
                    if m:
                        row.update(m)
                entry["deps"].append(row)
        entry["deps"].sort(key=lambda r: -r.get("with_transitive_kb", 0))
        entry["likely_unused"] = likely_unused(d, pj)
        entry["prod_total_kb"] = None
        if entry["installed"]:
            seen, vis = set(), set()
            for dep in pj.get("dependencies", {}):
                r = find_dep(dep, d / "node_modules" / dep) if False else os.path.realpath(d / "node_modules" / dep) if (d / "node_modules" / dep).exists() else None
                if r:
                    closure(r, vis)
            entry["prod_total_kb"] = fmt_kb(sum(own_size(r, seen) for r in vis))
            seen2, vis2 = set(), set()
            for dep in {**pj.get("dependencies", {}), **pj.get("devDependencies", {})}:
                p = d / "node_modules" / dep
                if p.exists():
                    closure(os.path.realpath(p), vis2)
            entry["all_total_kb"] = fmt_kb(sum(own_size(r, seen2) for r in vis2))
        entry["scripts"] = pj.get("scripts", {})
        if a.online:
            entry["online"] = online(d, uses_pnpm)
        report["packages"][n] = entry
        for e in entry["aliases"]:
            if e["kind"] == "vendored":
                v = e["target"].replace(os.sep, "/")
                graph_edges.append((n, v.split("/vendor/")[0] + "/vendor/" + v.split("/vendor/")[1].split("/")[0], e["alias"], "vendored"))
            elif e["owner"] != n and e["owner"] in names:
                graph_edges.append((n, e["owner"], e["alias"], e["kind"]))

    for dep, uses in versions.items():
        if len({r for _, r in uses}) > 1:
            report["version_conflicts"].append({"name": dep, "usages": [{"package": p, "range": r} for p, r in uses]})
    shared = [(dep, [p for p, _ in u]) for dep, u in versions.items() if len(u) > 1]
    report["shared_deps"] = [{"name": d, "packages": p} for d, p in shared]
    report["vendored_shared_drift"] = vendored_drift(root)
    report["client_bundle"] = client_bundle(root)

    # mermaid: packages + top-5 heaviest prod deps each + alias edges
    L = ["graph LR"]
    for n in names:
        L.append(f'  {re.sub(r"[^a-zA-Z0-9]", "_", n)}["{n}<br/>{human(report["packages"][n].get("prod_total_kb"))} prod"]')
    seen_e, seen_n = set(), set()
    for s, t, al, kind in graph_edges:
        sid, tid = (re.sub(r"[^a-zA-Z0-9]", "_", x) for x in (s, t))
        if "/vendor/" in t and tid not in seen_n:
            seen_n.add(tid)
            L.append(f'  {tid}(["{t}"])')
        if (sid, tid) in seen_e:
            continue
        seen_e.add((sid, tid))
        L.append(f'  {sid} {"-.->" if kind == "vendored" else "-->"} {tid}')
    for n in names:
        sid = re.sub(r"[^a-zA-Z0-9]", "_", n)
        for r in [x for x in report["packages"][n]["deps"] if x["section"] == "dependencies"][:5]:
            eid = f'{sid}__{re.sub(r"[^a-zA-Z0-9]", "_", r["name"])}'
            L.append(f'  {eid}("{r["name"]}<br/>{human(r.get("with_transitive_kb"))}"):::ext')
            L.append(f"  {sid} --> {eid}")
    L.append("  classDef ext fill:#eef,stroke:#99c")
    report["mermaid"] = "\n".join(L)
    json.dump(report, sys.stdout, indent=1, default=str)


if __name__ == "__main__":
    main()
