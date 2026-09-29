# Working Agreement — nexwire

Rules for every code change in this repo (the framework **and** the scaffolder `create-nexwire`), regardless of author (human or agent).

## Versioning & releases
- The **current in-flight release** lives on a named branch, e.g. `release/3.2.1`. Edits are **never** committed straight to `main`.
- Checkpoint often: one commit per verified step. A bad step is rolled back with `git reset --hard <last-good-commit>` — never by hand-fixing forward.
- `main` stays known-good. When the branch is confirmed stable it is merged into `main` (PR or fast-forward) and tagged with the release version; the branch is kept as a rollback point until the release ships.
- Changelog: every user-visible fix gets a bullet under the current version's `### Fixed` / `### Changed` / `### Added` section in `CHANGELOG.md`, with today's date in the header (`[x.y.z] — YYYY-MM-DD`).

## Correctness convention: byte-identity across engines
- "Fix it once, fix both" **express** and **hono**. The two engines must stay **byte-identical** (`fc /b` or SHA-256 equal) for shared framework files and scaffolded source. After any edit, prove it: compare hashes of the **express** and **hono** copies and include the result in the commit message (e.g. `byte-identical across express+hono (sha …)`).
- The scaffolder mirrors the template. Every fix that touches a scaffolded file must also be applied to the matching file under `packages/create-nexwire/{express,hono}/…`, OR if the fix belongs to the scaffolder's own runtime (e.g. maker-cli `core.mjs`/`core.mts`), the template copies are derived from it. Verify both stay in sync (`python`/`fc` diff of the four copies, or hash-compare and state which are expected to differ — engine-native adapters like `gum`'s queue UI may legitimately differ in UI bytes).
- If the two engines cannot be byte-identical for a specific spot, say so explicitly in the commit message and the changelog bullet, with the reason.

## The fix loop (follow for every change)
1. **Find the root cause** in the source (the scaffolded `template/…` AND the scaffolder `packages/create-nexwire/…` — they are the same code in two homes).
2. **Edit the fix** so both engines are byte-identical. Apply it in the `template/` tree first, then mirror to `packages/create-nexwire/…`.
3. **Verify** with a clean grep/read (no accidental hash-paste loops): show the changed lines.
4. **Changelog**: add the bullet now, under the current release version. This is where bugs are audited, so it's non-negotiable.
5. **Docs**: update the relevant guide/support pages (`packages/docs/**`) in the same change; keep every config/env reference consistent with the code.
6. **Commit** on the release branch with a descriptive message, including the byte-identity proof.
7. **Push** the branch (`git push`, tracking is set). `main` untouched.
8. When the whole release is confirmed stable → merge to `main` + tag via the release process.

## Working-tree hygiene
- `main` is sacred: only confirmed-stable merges land there.
- Don't fold unrelated edits into a checkpoint commit; keep them separate.
- LF/CRLF: Git reports "LF will be replaced by CRLF" for some files — that's benign (core.autocrlf true), don't let it derail a commit.

## Testing before "done"
- Run whatever the project's lint/typecheck/tests are before declaring a change done. If none exist, at minimum re-run the byte-identity proof and a smoke read of the touched files.
