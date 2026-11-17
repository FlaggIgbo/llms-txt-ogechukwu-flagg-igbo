# Frontend Screenshot Testing (Playwright & GitHub Image Diffs)

This directory contains deterministic visual snapshots of all frontend components and pages in the llms.txt Directory application, captured using [Playwright](https://playwright.dev/).

## Why Screenshot Testing in Git?

GitHub has **native visual image diffing built directly into pull requests and commits**. When `.png` screenshots are committed to the repository, GitHub allows reviewers to inspect visual changes using four diff modes:

- **2-up**: Side-by-side comparison of baseline vs. current version.
- **Swipe**: An interactive drag-slider to sweep across before-and-after states.
- **Onion Skin**: An opacity crossfade slider to reveal subtle layout shifts or pixel misalignments.
- **Difference**: Highlights only the pixels that changed between versions.

By tracking component and page screenshots in Git, every pull request automatically includes visual regression testing without requiring third-party hosted services or subscriptions.

---

## Directory Structure

```
screenshots/
├── components/   # Isolated UI component snapshots across various states
│                 # (e.g., default, populated, loading, validation, and empty states)
└── pages/        # Full-page responsive views across desktop (1280x800) and mobile (390x844)
                  # viewports for key application routes and search states
```

Snapshots are configured and driven by `scripts/generate-screenshots.ts` using deterministic dates, mocked network responses, and disabled animations.

---

## Running Manually

To regenerate all component and page screenshots on demand:

```bash
npm run screenshots
```

To run the pre-push check manually:

```bash
npm run screenshots:check
```

---

## Git Pre-Push Hook Automation

A pre-push hook is installed in `.githooks/pre-push` (configured via `git config core.hooksPath .githooks`).

### How It Works

1. When you run `git push`, the hook checks whether any files in `apps/web/` or `packages/shared-types/` have been modified in the commits being pushed.
2. **If frontend code changed**:
   - The hook automatically runs Playwright to regenerate all component and page screenshots using deterministic mocking and frozen animations.
   - If screenshot images changed, it stages them (`git add screenshots/`) and commits them (`chore(screenshots): regenerate component & page screenshots`).
   - The push is paused with instructions to re-run `git push` so your branch on GitHub includes the newly generated screenshots.
3. **If screenshots are already up to date** (or no frontend files were touched):
   - The check passes immediately with zero delay, and your push proceeds normally.

### Skipping Screenshot Checks

If you ever need to bypass screenshot generation temporarily during a push:

```bash
SKIP_SCREENSHOTS=1 git push
# or standard git flag:
git push --no-verify
```

