import { test } from "node:test";
import assert from "node:assert/strict";

import {
  attributable,
  aggregateLanguages,
  tagDisciplines,
  pickNotable,
  type Repo,
} from "./src/evidence.ts";
import { renderWhoami, extractAsserted } from "./src/render.ts";

function repo(p: Partial<Repo>): Repo {
  return {
    name: "r",
    fullName: "u/r",
    description: null,
    topics: [],
    fork: false,
    archived: false,
    stars: 0,
    pushedAt: "2026-01-01",
    primaryLanguage: null,
    ...p,
  };
}

test("forks and archived repos are not attributed to the user", () => {
  const repos = [
    repo({ name: "mine" }),
    repo({ name: "forked", fork: true }),
    repo({ name: "old", archived: true }),
  ];
  assert.deepEqual(attributable(repos).map((r) => r.name), ["mine"]);
});

test("language bytes aggregate and percentages sum sanely", () => {
  const repos = [repo({ fullName: "u/a", pushedAt: "2026-05-01" }), repo({ fullName: "u/b", pushedAt: "2026-02-01" })];
  const langs = new Map<string, Record<string, number>>([
    ["u/a", { Swift: 800, TypeScript: 200 }],
    ["u/b", { TypeScript: 1000 }],
  ]);
  const stats = aggregateLanguages(repos, langs);
  assert.equal(stats[0].language, "TypeScript"); // 1200 bytes
  assert.equal(stats[1].language, "Swift"); // 800 bytes
  assert.equal(stats[0].repoCount, 2);
  assert.equal(stats[0].lastSeen, "2026-05-01");
  const total = stats.reduce((s, l) => s + l.pct, 0);
  assert.ok(Math.abs(total - 100) < 0.5);
});

test("discipline tags carry their triggering evidence (exposure, not skill)", () => {
  const repos = [
    repo({ name: "JCAppleScript", primaryLanguage: "Swift", description: "Swift bridge" }),
    repo({ name: "smallchat", description: "semantic tool dispatch for LLM agents", topics: ["mcp", "agent"] }),
    repo({ name: "synthbox", description: "eurorack midi synth", topics: ["audio"] }),
  ];
  const langs = aggregateLanguages(
    repos.map((r) => ({ ...r, fullName: `u/${r.name}` })),
    new Map([["u/JCAppleScript", { Swift: 1000 }]]),
  );
  const tags = tagDisciplines(
    repos.map((r) => ({ ...r, fullName: `u/${r.name}` })),
    langs,
  );
  const names = tags.map((t) => t.tag);
  assert.ok(names.includes("iOS / Apple platforms"));
  assert.ok(names.includes("AI agent tooling"));
  assert.ok(names.includes("Audio / DSP / music tech"));
  // every tag must justify itself
  for (const t of tags) assert.ok(t.evidence.length > 0, `${t.tag} has no evidence`);
});

test("notable repos rank by stars then recency", () => {
  const repos = [
    repo({ name: "popular", stars: 23 }),
    repo({ name: "fresh", stars: 0, pushedAt: "2026-06-01" }),
    repo({ name: "stale", stars: 0, pushedAt: "2020-01-01" }),
  ];
  const n = pickNotable(repos, 3).map((r) => r.name);
  assert.deepEqual(n, ["popular", "fresh", "stale"]);
});

test("regeneration preserves the hand-written ASSERTED block", () => {
  const ev = {
    user: "u",
    generatedAt: "2026-06-09T00:00:00Z",
    reposConsidered: 1,
    reposSkipped: { forks: 0, archived: 0 },
    languages: [],
    disciplines: [],
    notable: [],
    unauthenticated: true,
  };
  const first = renderWhoami(ev);
  // user edits the asserted block
  const edited = first.replace("- **Role / level:** ", "- **Role / level:** Staff iOS engineer");
  const asserted = extractAsserted(edited);
  assert.ok(asserted?.includes("Staff iOS engineer"));
  const regenerated = renderWhoami(ev, asserted);
  assert.ok(regenerated.includes("Staff iOS engineer"), "edit survived regeneration");
});
