---
name: self-improve
description: Use when the user corrects or pushes back on something, when a tool call or cof mine is discovered, when the user confirms an approach worked, or after finishing asizeable task. Records short, verified rules in memory so work gets faster and fewer mistakes repeat. Also use at session start when memory should be reviewed.
---

Prvo pročitaj `~/.claude/code-kit.json`. Ako fajl ne postoji ili u njemu nije `"rules": true`, ova pravila nisu izabrana na ovom računaru: ne radi ništa od ovoga što slijedi i nastavi običan rad.

# Self-improve

Goal: learn from corrections and errors, store the lesson as a short rule in memory, and gnext time (no plan mode, no step lists).

## When to trigger

- User corrects me, says "ne tako", "opet", "vec sam rekao", or shows frustration.
- A command/tool fails and I find the cause.
- I notice my own mistake (wrong assumption, wrong file, missed project convention).
- User accepts a non-obvious approach ("tako, to je to").
- A task finished and I learned something about the project or the user's way of working t

Do it silently and quickly. Do not announce it, do not ask permission, do not interrupt ths enough: "Zapisano: <rule>".

## What to save

Save only what is non-obvious and not already in code, git history or CLAUDE.md:

- **feedback**: user preferences and corrections (how they want work done), with the reaso
- **project**: constraints, run commands, gotchas for a specific project that cost time to discover.
- **reference**: where things live (URLs, ports, dashboards, servers).
- **user**: role, skills, language (Serbian/Montenegrin, informal).

Do NOT save: one-off task details, things derivable from reading the code, guesses, anything unverified.

## Design rules go to the design-rules plugin

If the lesson is about design/UI/frontend (colors, typography, spacing, layout, components, animations, navbar, look and feel, a design correction from the user), do NOT save it as a memory. Add it as a short,
concrete rule to the matching section of `$HOME/.claude/local-marketplace/design-rules/rulone fits). Rules there apply to all projects.

- Read `rules.md` first; update or merge an existing rule instead of duplicating, and fix .
- Keep the file's style: short, checkable bullets in Serbian.
- Report with one line: "Zapisano u design-rules: <rule>".
- Only truly project-specific design facts (e.g. one project's brand color) stay in project memory.

## How to save

Memory dir: the one named in the system prompt (project memory dir under `~/.claude/projects/`).

1. Read `MEMORY.md`. If a memory already covers it, update that file instead of adding a new one.
2. Write one file per fact:

---
name: <kebab-slug>
description: <one line, used to decide relevance>
metadata:
  type: user | feedback | project | reference
---

<the rule in 1-3 lines>

**Why:** <what went wrong or what the user said>
**How to apply:** <when this kicks in, concrete action>

3. Add one line to `MEMORY.md`: `- [Title](file.md) — hook`. Keep the index under ~100 lin
4. Link related memories with `[[name]]`.

## Keeping it sharp

- Rules must be short, concrete and checkable. "Run `make up-bar`, not Podgorica/Tivat" beats "be careful with the parking project".
- If a rule turns out wrong or outdated, fix or delete it immediately.
- If two rules overlap, merge them.
- Before relying on a memory that names a file, flag or command, verify it still exists.
- If MEMORY.md grows past ~100 lines, consolidate: merge duplicates, drop stale entries.

## Working style it enforces

- Go straight to implementation. Use memory and what is already known instead of writing plans.
- Ask the user only when a decision is truly theirs and cannot be resolved from context or
- Before claiming something works, run it and check the output.
- Answer in the user's language, short and direct.
