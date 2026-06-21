#!/usr/bin/env node
/**
 * whoami — generate/refresh a WHOAMI.md from public GitHub evidence.
 *
 *   node bin/whoami.ts <github-user> [--token <t>] [--max 30] [--out WHOAMI.md]
 *
 * Token (optional) via --token or $GITHUB_TOKEN. With a token, private repos you
 * own are visible and rate limits are far higher. Regeneration PRESERVES your
 * hand-written ASSERTED block.
 */

import { readFile, writeFile } from "node:fs/promises";
import { buildEvidence } from "../src/evidence.ts";
import { renderWhoami, extractAsserted } from "../src/render.ts";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const user = process.argv[2];
  if (!user || user.startsWith("--")) {
    console.error("usage: whoami <github-user> [--token <t>] [--max 30] [--out WHOAMI.md]");
    process.exit(1);
  }
  const token = arg("--token") ?? process.env.GITHUB_TOKEN;
  const max = Number(arg("--max") ?? 30);
  const out = arg("--out");

  let existingAsserted: string | undefined;
  if (out) {
    try {
      existingAsserted = extractAsserted(await readFile(out, "utf8"));
      if (existingAsserted) console.error("preserving existing ASSERTED block");
    } catch {
      /* no existing file — fine */
    }
  }

  const ev = await buildEvidence(user, { token, max });
  const md = renderWhoami(ev, existingAsserted);

  if (out) {
    await writeFile(out, md, "utf8");
    console.error(`wrote ${out}`);
  } else {
    process.stdout.write(md);
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
