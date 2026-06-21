<div align="center">

# 🪪 WHOAMI.md

**A `CLAUDE.md` for _who you are_ — not the project.**

Portable, user-owned context that starts every AI session already calibrated to you,
so neither side burns turns re-establishing who you are.

[![Tests](https://img.shields.io/badge/tests-5%2F5%20passing-brightgreen)](#testing)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.6-339933?logo=node.js&logoColor=white)](#requirements)
[![Language](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](#project-layout)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

---

## What is this?

`WHOAMI.md` is a tiny, dependency-free CLI that generates and maintains a **personal
identity file** for working with AI coding agents.

Think of `CLAUDE.md`: a file you drop in a repo so an agent understands *the project*.
`WHOAMI.md` is the missing other half — a file that describes ***you***: your role, your
real depth, the things you've shipped that no public profile can see, and how you like
to work. Drop it where your tools read context, or paste a single block into any chat,
and the conversation begins already knowing who it's talking to.

The file has two zones, and **the ordering is the entire philosophy:**

| Zone | Who writes it | Authority |
| --- | --- | --- |
| 🟢 **ASSERTED** | You, by hand | **The source of truth.** Wins over everything below. |
| 🔵 **OBSERVED** | The generator, from public GitHub | Evidence only. Informs the ASSERTED block; never overrides it. |

> [!IMPORTANT]
> The generator measures **exposure, not skill.** Byte counts are inflated by vendored
> and generated code, and private/employer work is completely invisible to it. For any
> senior engineer the OBSERVED section will *undercount* real depth — so it's labeled
> loudly as evidence to jog your memory, never as a verdict on your ability.

---

## Why it exists

Every new agent session starts from zero. You re-explain that you're a staff iOS
engineer, that you've shipped audio software the public repos don't show, that you
prefer terse diffs over essays. That re-establishment costs turns, money, and patience —
on both sides.

`WHOAMI.md` makes that context **portable and user-owned**:

- ✍️ **You stay the authority.** The ASSERTED block is hand-written and the generator
  never touches it. You are the expert on your own expertise.
- 🤖 **Evidence does the legwork, honestly.** The OBSERVED block scrapes *public* GitHub
  for language and discipline signals — and is scrupulous about admitting what it
  cannot see.
- ♻️ **Regeneration is safe.** Re-run the tool any time to refresh the evidence; your
  hand-written block survives untouched.
- 🔐 **It's a continuity & identity anchor.** One file, owned by you, that travels with
  you across tools and sessions.

---

## Quick start

No install, no dependencies — just Node ≥ 22.6 (which can run TypeScript directly).

```bash
# Print a WHOAMI.md to stdout from a user's PUBLIC GitHub profile
node bin/whoami.ts johnnyclem

# Write it to a file (preserves your ASSERTED block if the file already exists)
node bin/whoami.ts johnnyclem --out WHOAMI.md

# Use a token for higher rate limits + visibility into your own private repos
node bin/whoami.ts johnnyclem --token "$GITHUB_TOKEN" --out WHOAMI.md
```

Then open the file, fill in the **ASSERTED** block (that's the part that matters), and
drop it wherever your agent reads context.

A fully rendered example lives in [`WHOAMI.md.example`](WHOAMI.md.example).

---

## Usage

```
whoami <github-user> [--token <t>] [--max <n>] [--out <path>]
```

| Flag | Default | Description |
| --- | --- | --- |
| `<github-user>` | _required_ | The GitHub username to gather public evidence for. |
| `--token <t>` | `$GITHUB_TOKEN` | Optional PAT. Raises rate limits and reveals private repos you own. |
| `--max <n>` | `30` | Maximum number of (recency-sorted) repos to consider. |
| `--out <path>` | _stdout_ | Write to a file instead of stdout. Preserves an existing ASSERTED block. |

The token may also be supplied via the `GITHUB_TOKEN` environment variable. Without a
token the tool runs **public-only**, which means more undercounting — and the output
says so explicitly.

### npm scripts

```bash
npm run whoami -- johnnyclem --out WHOAMI.md   # same as above
npm test                                       # run the unit tests
```

---

## How it works

The pipeline is deliberately small and almost entirely **pure functions**, so the
interesting logic is unit-testable without ever touching the network.

```
 GitHub API ──▶ buildEvidence() ──▶ Evidence ──▶ renderWhoami() ──▶ WHOAMI.md
   (fetch)        orchestrates        (data)        (markdown)        (file)
```

1. **`listRepos`** pulls the user's repos, sorted by most recently pushed.
2. **`attributable`** drops forks and archived repos — keeping only work that
   plausibly reflects the user's own authorship.
3. **`repoLanguages`** fetches the byte-per-language breakdown for each kept repo.
4. **`aggregateLanguages`** rolls those up into ranked language stats (share of bytes,
   repo count, last-seen date).
5. **`tagDisciplines`** maps evidence to **discipline tags** (e.g. *iOS / Apple
   platforms*, *AI agent tooling*, *Audio / DSP*). Every tag carries the exact evidence
   that triggered it — `lang:Swift`, `repo:smallchat` — so you can judge, and correct,
   the inference.
6. **`pickNotable`** surfaces standout repos, ranked by stars then recency.
7. **`renderWhoami`** assembles it all into the two-zone markdown, **preserving any
   existing ASSERTED block** it finds via `extractAsserted`.

Only `fetchGitHub` touches the network; everything downstream is pure, which is why the
whole evidence model can be tested deterministically.

### Discipline rules

Tags fire from a small, transparent rule set (`RULES` in `src/evidence.ts`) that keys
off languages and keyword patterns in repo names, descriptions, and topics. Some rules
require a language match, some a keyword match, and some (like *Data / ML*) require
**both**. A tag never appears without recorded evidence to back it.

---

## The generated file

```markdown
# WHOAMI

## ASSERTED — written by me; this is the source of truth
- **Role / level:** Staff iOS engineer
- **Years in the field:** 12
- **Domains of real depth:** …
- **Things I've shipped that GitHub can't see:** …
- **How I think / how to work with me:** …

---

## OBSERVED — public GitHub evidence (generated 2026-06-09)
### Language exposure (by attributed public bytes)
- **TypeScript** — 52% of public bytes · 3 repo(s) · last 2026-06-01
- **Swift** — 32% of public bytes · 1 repo(s) · last 2026-04-10
…
### Discipline signals (exposure, with the evidence that triggered each)
- **iOS / Apple platforms** — evidence: lang:Swift, lang:Objective-C
…
### Notable public repos
- [JCAppleScript](https://github.com/johnnyclem/JCAppleScript) ★23 — …
```

The `---` separator is meaningful: it's the boundary `extractAsserted` uses to find and
protect your hand-written block on regeneration.

---

## Project layout

```
.
├── bin/
│   └── whoami.ts        # CLI entry point: arg parsing, file I/O, ASSERTED preservation
├── src/
│   ├── evidence.ts      # GitHub fetching + pure transforms (the data model)
│   └── render.ts        # Evidence → two-zone WHOAMI.md markdown
├── whoami.test.ts       # node:test unit suite (no network required)
├── WHOAMI.md.example    # a fully rendered sample
├── package.json
└── LICENSE
```

---

## Testing

The suite runs against the pure functions — no network, fully deterministic — and
covers attribution, language aggregation, discipline tagging with evidence, notable-repo
ranking, and (critically) that **regeneration preserves a hand-edited ASSERTED block**.

```bash
npm test
# or directly:
node --test
```

```
# tests 5
# pass 5
# fail 0
```

---

## Requirements

- **Node.js ≥ 22.6** — the CLI and tests are TypeScript run directly via Node's native
  type stripping. No build step, no transpiler, no dependencies.

---

## Design principles

- **You are the authority.** Machines gather evidence; humans assert truth. The schema
  enforces that hierarchy on the page.
- **Exposure ≠ skill.** The tool refuses to pretend byte counts are a competence score,
  and says so where you'll read it.
- **Evidence must justify itself.** Every discipline tag ships with the signal that
  produced it.
- **Honest about blind spots.** Private and employer work is invisible; the output
  states that this means undercounting, especially for senior engineers.
- **Safe to re-run.** Your words are never overwritten.

---

## License

[MIT](LICENSE) © 2026 Johnny Clem
