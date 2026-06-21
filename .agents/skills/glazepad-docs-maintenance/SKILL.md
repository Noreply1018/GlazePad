---
name: glazepad-docs-maintenance
description: GlazePad documentation maintenance workflow. Use when a GlazePad product upgrade, user-visible behavior change, settings change, release preparation, roadmap cleanup, changelog update, or docs consistency audit requires keeping README, CHANGELOG, docs/design.md, docs/development.md, docs/release.md, and docs/roadmap.md aligned.
---

# GlazePad Docs Maintenance

Use this skill after product or release work changes what users see, how the app is built, or what is planned next. Keep the skill procedural; the canonical document ownership rules live in `docs/README.md`.

## Required Context

Read these files before editing docs:

```bash
sed -n '1,180p' docs/README.md
sed -n '1,220p' README.md
sed -n '1,220p' CHANGELOG.md
sed -n '1,220p' docs/design.md
sed -n '1,220p' docs/development.md
sed -n '1,220p' docs/release.md
sed -n '1,220p' docs/roadmap.md
```

When a change touches implementation details, also inspect the relevant code before writing docs.

## Update Workflow

1. Identify the actual product change from the newest user request, diffs, or implementation.
2. Classify the documentation impact:
   - user-facing behavior or UI: update `README.md` if entry-level copy changes, and update `docs/design.md` for the current interaction spec.
   - state shape, storage, commands, desktop validation, or architecture: update `docs/development.md`.
   - release validation or packaging behavior: update `docs/release.md`.
   - completed planned work: remove it from `docs/roadmap.md`.
   - release-visible change: add or adjust the relevant `CHANGELOG.md` entry.
3. Keep `README.md` short. Move detailed product rules to `docs/design.md`, development detail to `docs/development.md`, and release procedure to `docs/release.md`.
4. Keep `docs/roadmap.md` future-facing. Do not leave completed or already implemented work there.
5. Move outdated prototypes, retired plans, or historical references to `docs/archive/` only when they still have reference value.

## Consistency Checks

After editing docs, search for known drift patterns and any terms introduced or removed by the change:

```bash
rg -n 'docs/(product|interaction|tech)|RELEASE_CHECKLIST|ROADMAP|docs/prototypes|final-open-design|石墨|graphite|点击 `\+` 会立刻|优先把当前剪贴板|新增槽位时先判断剪贴板|显示当前勾选状态' README.md CHANGELOG.md docs src-web/src src-tauri/src
```

Add task-specific stale terms to the search. Examples: removed setting names, old tray labels, old shortcut behavior, old version numbers, or outdated validation steps.

Run:

```bash
git diff --check
git status --short
```

For docs-only changes, do not run application builds unless the documentation was generated from code or the user requested full verification.

## Commit Boundary

Keep documentation maintenance in its own commit when it follows a feature or bugfix commit. If docs are part of the same small behavior change, keep the commit message explicit about both code and docs.

Do not commit unrelated ignored files, generated build output, local screenshots, `node_modules`, `dist`, or `src-tauri/target`.
