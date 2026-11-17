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
├── components/                       # Individual frontend component snapshots
│   ├── directory-card-standard.png   # DirectoryCard with complete metadata & badges
│   ├── directory-card-minimal.png    # DirectoryCard with minimal attributes
│   ├── directory-table-populated.png # DirectoryTable populated with entries
│   ├── directory-table-loading.png   # DirectoryTable loading state
│   ├── directory-table-empty.png     # DirectoryTable empty state ("No results")
│   ├── navigation-tabs.png           # Navigation header tabs with active indicator & badge
│   ├── search-bar-empty.png          # SearchBar default state
│   ├── search-bar-filled.png         # SearchBar with input text
│   ├── submission-form-empty.png     # SubmissionForm initial blank state
│   ├── submission-form-validation.png# SubmissionForm showing inline validation errors
│   └── submission-form-filled.png    # SubmissionForm with valid input data
│
└── pages/                            # Full-page responsive views
    ├── home-page.png                 # Main directory page (Desktop 1280x800)
    ├── home-page-mobile.png          # Main directory page (Mobile 390x844)
    ├── home-page-filtered.png        # Home page with active search query
    ├── home-page-empty.png           # Home page with no matching search results
    ├── add-entry-page.png            # Add Entry page (Desktop 1280x800)
    ├── add-entry-page-mobile.png     # Add Entry page (Mobile 390x844)
    ├── updates-page.png              # Updates tab with queued/processing entries
    ├── updates-page-mobile.png       # Updates tab on mobile
    └── updates-page-empty.png        # Updates tab empty state ("All sites up to date")
```

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
