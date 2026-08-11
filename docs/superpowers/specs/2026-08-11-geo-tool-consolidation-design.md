# Geo Tool Repository Consolidation Design

Date: 2026-08-11
Status: Approved

## Objective

Consolidate the current `Geo Data Processing Tool` and `RealEstateAnalytics` projects into one active local folder and one active GitHub repository named `geo-tool`. Preserve all existing source and Git history, archive the old `RealEstateAnalytics` repository as read-only, and update the production WebPortfolio so it presents one combined Geo Tool project instead of two separate entries.

## Current State

### Geo Data Processing Tool

- Local folder: `C:\Users\thugs\Desktop\projects\Geo Data Processing Tool`
- GitHub repository: `spandreou/Geo-Data-Processing-Tool`
- Default branch: `main`
- The local worktree contains a large uncommitted integration that already adds Real Estate backend endpoints, models, services, frontend workflows, Mapbox-based visualization, tests, Docker files, documentation, and datasets.
- The committed history currently contains the original Geo Data Processing Tool implementation and homelab notes.

### RealEstateAnalytics

- Local folder: `C:\Users\thugs\Desktop\projects\RealEstateProject`
- GitHub repository: `spandreou/RealEstateAnalytics`
- Default branch: `main`
- The project is a smaller standalone React/Vite prototype using Leaflet, mock property data, filters, KPI panels, and a trend-chart shell.
- Its product direction has already been superseded by the Real Estate mode being integrated into the Geo Tool.

### WebPortfolio and Vercel

- Local repository: `C:\Users\thugs\Desktop\projects\WebPortfolio`
- GitHub repository: `spandreou/WebPortfolio`
- Vercel project: `spandreou`
- Production URL: `https://spandreou.vercel.app`
- Production currently renders nine projects and presents `RealEstateAnalytics` and `Geo Data Processing Tool` as two separate cards.
- The latest production deployment is based on the `codex/update-project-catalog-skills` branch rather than the older local `master` branch.

## Selected Approach

Use the existing Geo repository as the canonical project because it already contains the broader full-stack architecture and the in-progress Real Estate integration.

The consolidation will:

1. Preserve recoverable snapshots of both local repositories before any move or Git mutation.
2. Validate and commit the existing Geo Tool integration without mixing unrelated user changes from other repositories.
3. Preserve the complete `RealEstateAnalytics` history as a legacy branch inside the canonical repository.
4. Rename the canonical local folder and GitHub repository to `geo-tool`.
5. Move the old local Real Estate checkout outside the active `projects` directory into a recoverable backup location.
6. Replace the two WebPortfolio entries with one accurate Geo Tool entry.
7. Verify the change in a Vercel preview before updating production.
8. Archive, but never delete, the old `RealEstateAnalytics` GitHub repository after the consolidated repository and portfolio links are verified.

## Alternatives Considered

### Create a new empty repository

This would require importing both repositories, rebuilding remote settings, and changing more URLs. It increases migration risk without improving the final source tree.

### Copy files without preserving history

This is simpler but loses the development record of the standalone Real Estate prototype and provides a weaker rollback path.

### Keep the old Geo repository and folder names

This would reduce renaming work but would not meet the goal of one clear `geo-tool` identity locally, on GitHub, and in the portfolio.

## Local Migration Design

### Safety snapshots

Before changing either checkout, create a backup root using this pattern:

```text
C:\Users\thugs\.codex\backups\geo-tool-consolidation-<timestamp>
```

Then:

- record `git status`, current branch, remotes, HEAD commit, and ignored/untracked state;
- create timestamped filesystem backups outside `C:\Users\thugs\Desktop\projects`;
- produce file manifests for the backups;
- verify that the source folders and backup destinations resolve to the intended absolute paths;
- do not delete either source checkout during the migration.

### Canonical worktree cleanup

The uncommitted Geo integration is user-owned work and is the primary data-preservation risk. It will be reviewed, tested, and committed on a dedicated consolidation branch before folder or remote renaming. Generated output, local environment files, secrets, and inappropriate test artifacts must remain excluded.

The Real Estate checkout will not be copied wholesale into the canonical working tree because that would leave two applications inside one repository. Its useful product behavior already exists in the integrated Geo implementation. Its full source remains accessible through preserved Git history.

### Final local layout

The active workspace will contain:

```text
C:\Users\thugs\Desktop\projects\geo-tool
```

The old `RealEstateProject` checkout will be moved into a `retired-local-checkouts` directory under the timestamped backup root. It will not remain as a second active project folder and will not be permanently deleted during this task.

All workspace documentation will be updated for both supported computers:

```text
Desktop PC: C:\Users\Spyros\OneDrive\Υπολογιστής\projects\geo-tool
Laptop: C:\Users\thugs\Desktop\projects\geo-tool
```

## Git and GitHub Design

### History preservation

The canonical repository will fetch `spandreou/RealEstateAnalytics` and publish its default-branch history as:

```text
archive/real-estate-legacy
```

This branch preserves the original files and commits without adding a duplicate legacy application to the canonical `main` working tree.

### Canonical repository identity

The GitHub repository `spandreou/Geo-Data-Processing-Tool` will be renamed to:

```text
spandreou/geo-tool
```

The local `origin` remote, README, badges, links, deployment documentation, and project metadata will use the new URL explicitly rather than relying on redirect behavior.

The tested consolidation branch will be pushed and integrated through a reviewable pull request. The canonical `main` branch must contain the complete integrated Geo and Real Estate functionality before the legacy repository is archived.

### Legacy repository

Before archiving, update the `spandreou/RealEstateAnalytics` README with a clear notice and link to `spandreou/geo-tool`. After verifying the canonical repository, history branch, and portfolio links, mark `spandreou/RealEstateAnalytics` archived/read-only. It will not be deleted.

## WebPortfolio Design

In `lib/projects-data.ts`, remove the separate `RealEstateAnalytics` and `Geo Data Processing Tool` records and create one record:

- name: `Geo Tool`
- slug: `geo-tool`
- GitHub URL: `https://github.com/spandreou/geo-tool`
- category: `data`
- status: `in-progress`
- description: a full-stack geospatial and real-estate analytics tool that ingests CSV data, performs clustering and outlier analysis, supports real-estate filtering and trends, and renders operational data on one interactive map
- technologies: only technologies confirmed by the final code and lockfiles, including the .NET backend, C#, React, TypeScript, Vite, and the active map stack

The portfolio project count is derived from the data array and should fall from nine to eight automatically. Existing card components, filters, layout, and visual styling do not require redesign.

## Vercel Deployment Design

The WebPortfolio change will be implemented on a dedicated branch based on the commit currently serving production, so the update does not accidentally remove the newer particle-interface work.

Verification order:

1. Run the WebPortfolio automated checks and production build locally.
2. Push the portfolio branch and obtain a Vercel preview deployment.
3. Fetch and inspect the preview `/projects` page.
4. Confirm exactly one `Geo Tool` entry, no active `RealEstateAnalytics` entry, no active `Geo Data Processing Tool` entry, and a working link to `spandreou/geo-tool`.
5. Verify responsive rendering and absence of relevant browser/runtime errors.
6. Merge the reviewed portfolio change and update production.
7. Fetch `https://spandreou.vercel.app/projects` and repeat the content and link checks.

The production alias `spandreou.vercel.app` remains unchanged.

## Verification Strategy

### Geo Tool

- .NET restore/build and available backend tests
- frontend unit/component tests
- frontend type checking
- frontend lint
- frontend production build
- Docker Compose configuration validation when Docker files are included
- focused smoke checks for Sandbox and Real Estate CSV uploads, map rendering, filters, selection, analytics, and error states
- `git diff --check` and secret/generated-file review

### GitHub

- canonical repository is named `spandreou/geo-tool`
- `main` contains the integrated application
- `archive/real-estate-legacy` resolves to the preserved Real Estate history
- local `origin` points to the new repository URL
- old `spandreou/RealEstateAnalytics` is archived and not deleted

### WebPortfolio and Vercel

- local tests, lint, and production build pass
- preview and production each show eight projects
- only one Geo Tool card exists
- the GitHub link resolves to `spandreou/geo-tool`
- production deployment is `READY`
- no relevant runtime errors are introduced

## Failure Handling and Rollback

- If the Geo Tool worktree cannot be validated, stop before renaming or archiving any GitHub repository.
- If the canonical push or history preservation fails, retain both existing GitHub repositories unchanged.
- If the portfolio preview fails, keep production unchanged and repair the preview branch.
- If the production portfolio update fails, use the previous Vercel production deployment as the rollback target.
- The old GitHub repository can be unarchived if a migration issue is discovered.
- The canonical GitHub repository can be renamed back if necessary, and local `origin` can be restored.
- Timestamped local backups remain untouched until the user later approves cleanup.

## Security and Data Boundaries

- Do not print, copy, commit, or expose `.env` values, Mapbox tokens, Vercel credentials, GitHub tokens, SSH keys, or homelab secrets.
- Do not include generated build output, local test screenshots, dependency directories, or machine-specific caches unless an existing project policy explicitly tracks them.
- Do not deploy or mutate the Geo Tool homelab service as part of this consolidation. This task changes local/GitHub organization and the WebPortfolio deployment only.

## Acceptance Criteria

The consolidation is complete when:

- the active local workspace contains one `geo-tool` project folder and no active `RealEstateProject` folder;
- all pre-existing source and Git history are recoverable;
- GitHub has one active canonical repository at `spandreou/geo-tool`;
- `spandreou/RealEstateAnalytics` is archived/read-only, not deleted;
- the consolidated application passes its applicable automated checks;
- WebPortfolio contains one Geo Tool project entry linked to the canonical repository;
- `https://spandreou.vercel.app/projects` shows eight projects and no duplicate Real Estate/Geo entries;
- backups and rollback instructions are recorded in the final handoff.
