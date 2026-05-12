/**
 * Minimal robots.txt handling for User-agent: * (MVP).
 * Unknown / fetch failure → allow all paths on that host.
 */

type Rule = { type: "allow" | "disallow"; path: string };

function normalizePath(p: string): string {
  if (!p || p === "/") return "/";
  try {
    const u = new URL(p, "https://dummy.test");
    return u.pathname || "/";
  } catch {
    return p.startsWith("/") ? p : `/${p}`;
  }
}

/** Longest prefix match wins (common simplified behavior). */
function pathAllowed(rules: Rule[], pathname: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const r of rules) {
    if (pathname === r.path || pathname.startsWith(r.path.endsWith("/") ? r.path : `${r.path}/`)) {
      const len = r.path.length;
      if (!best || len > best.len) {
        best = { len, allow: r.type === "allow" };
      }
    }
  }
  return best ? best.allow : true;
}

export async function fetchRobotsRules(origin: string): Promise<Rule[]> {
  const robotsUrl = new URL("/robots.txt", origin).href;
  let text: string;
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": "HotelIngestMVP/0.1 (+local)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  const lines = text.split(/\r?\n/);
  let inStar = false;
  const rules: Rule[] = [];

  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const mUser = /^user-agent:\s*(.+)$/i.exec(line);
    if (mUser) {
      inStar = mUser[1].trim() === "*";
      continue;
    }
    if (/^user-agent:/i.test(line)) {
      inStar = false;
      continue;
    }
    if (!inStar) continue;

    const mDis = /^disallow:\s*(.*)$/i.exec(line);
    if (mDis) {
      const p = normalizePath(mDis[1].trim() || "/");
      rules.push({ type: "disallow", path: p });
      continue;
    }
    const mAll = /^allow:\s*(.*)$/i.exec(line);
    if (mAll) {
      const p = normalizePath(mAll[1].trim() || "/");
      rules.push({ type: "allow", path: p });
    }
  }

  return rules;
}

export function isUrlAllowedByRobots(rules: Rule[], targetUrl: string): boolean {
  if (!rules.length) return true;
  let pathname: string;
  try {
    pathname = new URL(targetUrl).pathname || "/";
  } catch {
    return false;
  }
  return pathAllowed(rules, pathname);
}
