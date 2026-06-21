/**
 * evidence.ts — gather *evidence* (not a skill score) from public GitHub.
 *
 * Design stance: this tool measures EXPOSURE, never SKILL. It outputs an
 * evidence map the human then curates. Byte counts are inflated by vendored
 * deps and generated files, and a senior engineer's best work usually lives in
 * employer orgs that never touch a personal account — so the OBSERVED picture
 * systematically *undercounts* depth. We say so, loudly, in the output.
 *
 * Network calls are isolated in `fetchGitHub`; everything else is a pure
 * function so the interesting logic is unit-testable without hitting the API.
 */

const API = "https://api.github.com";

export interface Repo {
  name: string;
  fullName: string;
  description: string | null;
  topics: string[];
  fork: boolean;
  archived: boolean;
  stars: number;
  pushedAt: string; // ISO
  primaryLanguage: string | null;
}

export interface LangStat {
  language: string;
  bytes: number;
  pct: number; // share of attributed bytes
  repoCount: number;
  lastSeen: string; // ISO date of most recent repo using it
}

export interface DisciplineTag {
  tag: string;
  /** Why this tag fired — repo names / topics. Evidence, not assertion. */
  evidence: string[];
}

export interface Evidence {
  user: string;
  generatedAt: string;
  reposConsidered: number;
  reposSkipped: { forks: number; archived: number };
  languages: LangStat[];
  disciplines: DisciplineTag[];
  notable: Repo[];
  /** True if we ran without a token (public-only, more undercounting). */
  unauthenticated: boolean;
}

/* ----------------------------- network ----------------------------- */

interface FetchOpts {
  token?: string;
}

async function fetchGitHub(path: string, opts: FetchOpts): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "whoami-md",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    throw new Error(
      `GitHub ${res.status} on ${path}` +
        (remaining === "0" ? " (rate limit exhausted — add a token)" : ""),
    );
  }
  return res.json();
}

export async function listRepos(user: string, opts: FetchOpts, max = 30): Promise<Repo[]> {
  // sort=pushed → recency-weighted, which is the right product behavior anyway.
  const raw: any[] = await fetchGitHub(
    `/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed`,
    opts,
  );
  return raw.slice(0, max).map(
    (r): Repo => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description ?? null,
      topics: Array.isArray(r.topics) ? r.topics : [],
      fork: !!r.fork,
      archived: !!r.archived,
      stars: r.stargazers_count ?? 0,
      pushedAt: r.pushed_at ?? r.updated_at ?? "",
      primaryLanguage: r.language ?? null,
    }),
  );
}

export async function repoLanguages(
  repo: Repo,
  opts: FetchOpts,
): Promise<Record<string, number>> {
  return fetchGitHub(`/repos/${repo.fullName}/languages`, opts);
}

/* --------------------------- pure transforms --------------------------- */

/** Keep only repos that plausibly reflect the user's own authored work. */
export function attributable(repos: Repo[]): Repo[] {
  return repos.filter((r) => !r.fork && !r.archived);
}

export function aggregateLanguages(
  repos: Repo[],
  perRepoLangs: Map<string, Record<string, number>>,
): LangStat[] {
  const bytes = new Map<string, number>();
  const counts = new Map<string, number>();
  const last = new Map<string, string>();

  for (const repo of repos) {
    const langs = perRepoLangs.get(repo.fullName);
    if (!langs) continue;
    const day = repo.pushedAt.slice(0, 10);
    for (const [lang, b] of Object.entries(langs)) {
      bytes.set(lang, (bytes.get(lang) ?? 0) + b);
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
      if (!last.has(lang) || day > (last.get(lang) ?? "")) last.set(lang, day);
    }
  }

  const total = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
  return [...bytes.entries()]
    .map(([language, b]): LangStat => ({
      language,
      bytes: b,
      pct: Math.round((b / total) * 1000) / 10,
      repoCount: counts.get(language) ?? 0,
      lastSeen: last.get(language) ?? "",
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

/**
 * Map evidence → discipline TAGS. A tag means "observable exposure to X",
 * explicitly NOT "expertise in X". Each tag carries the evidence that fired it
 * so the human can judge — and correct — the inference.
 */
const RULES: { tag: string; langs?: string[]; pattern?: RegExp }[] = [
  { tag: "iOS / Apple platforms", langs: ["Swift", "Objective-C", "Objective-C++"] },
  { tag: "Systems / native (C/C++)", langs: ["C", "C++"] },
  { tag: "AI agent tooling", pattern: /\b(mcp|agent|llm|embedding|rag|prompt|claude|gpt)\b/i },
  { tag: "Audio / DSP / music tech", pattern: /\b(audio|coreaudio|avfoundation|dsp|midi|synth|eurorack|daisy)\b/i },
  { tag: "Web / TypeScript", langs: ["TypeScript", "JavaScript"] },
  { tag: "Data / ML", langs: ["Python"], pattern: /\b(ml|machine.?learning|onnx|pytorch|tensor|vector)\b/i },
  { tag: "Infra / CI / DevOps", pattern: /\b(ci|cd|docker|kubernetes|terraform|fastlane|pipeline)\b/i },
];

export function tagDisciplines(repos: Repo[], langs: LangStat[]): DisciplineTag[] {
  const langSet = new Set(langs.map((l) => l.language));
  const haystacks = repos.map(
    (r) => `${r.name} ${r.description ?? ""} ${r.topics.join(" ")}`,
  );
  const out: DisciplineTag[] = [];

  for (const rule of RULES) {
    const evidence: string[] = [];
    if (rule.langs?.some((l) => langSet.has(l))) {
      const hits = langs.filter((l) => rule.langs!.includes(l.language)).map((l) => l.language);
      evidence.push(...hits.map((h) => `lang:${h}`));
    }
    if (rule.pattern) {
      repos.forEach((r, i) => {
        if (rule.pattern!.test(haystacks[i])) evidence.push(`repo:${r.name}`);
      });
    }
    // For a rule that needs BOTH lang and pattern (Data/ML), require both.
    const needsBoth = rule.langs && rule.pattern;
    const langOk = !rule.langs || rule.langs.some((l) => langSet.has(l));
    const patOk = !rule.pattern || repos.some((_, i) => rule.pattern!.test(haystacks[i]));
    if (needsBoth ? langOk && patOk : evidence.length > 0) {
      out.push({ tag: rule.tag, evidence: [...new Set(evidence)].slice(0, 6) });
    }
  }
  return out;
}

export function pickNotable(repos: Repo[], n = 6): Repo[] {
  return [...repos]
    .sort((a, b) => b.stars - a.stars || b.pushedAt.localeCompare(a.pushedAt))
    .slice(0, n);
}

/* ----------------------------- orchestration ----------------------------- */

export async function buildEvidence(
  user: string,
  opts: FetchOpts & { max?: number } = {},
): Promise<Evidence> {
  const all = await listRepos(user, opts, opts.max ?? 30);
  const kept = attributable(all);
  const skippedForks = all.filter((r) => r.fork).length;
  const skippedArchived = all.filter((r) => !r.fork && r.archived).length;

  const perRepo = new Map<string, Record<string, number>>();
  for (const repo of kept) {
    try {
      perRepo.set(repo.fullName, await repoLanguages(repo, opts));
    } catch {
      // skip a repo we can't read rather than failing the whole run
    }
  }

  const languages = aggregateLanguages(kept, perRepo);
  return {
    user,
    generatedAt: new Date().toISOString(),
    reposConsidered: kept.length,
    reposSkipped: { forks: skippedForks, archived: skippedArchived },
    languages,
    disciplines: tagDisciplines(kept, languages),
    notable: pickNotable(kept),
    unauthenticated: !opts.token,
  };
}
