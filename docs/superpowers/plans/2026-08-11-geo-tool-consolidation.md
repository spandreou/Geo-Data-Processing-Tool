# Geo Tool Repository Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one active local project folder and one active GitHub repository named `geo-tool`, preserve the RealEstateAnalytics history in an archive branch, archive the old repository, and replace the two WebPortfolio entries with one verified production entry.

**Architecture:** The existing Geo repository remains canonical because its dirty worktree already contains the integrated full-stack Real Estate mode. The standalone RealEstateAnalytics tree is preserved as an unrelated legacy branch rather than copied into the canonical `main` tree. WebPortfolio is updated through a tested data-only change, verified on a Vercel preview, and then promoted through its Git-linked production flow.

**Tech Stack:** Git and GitHub, PowerShell 7, .NET 8, C#, React 19, TypeScript, Vite, Vitest, Mapbox GL JS, Docker Compose, Next.js 15, Node.js 24, GitHub connector, Vercel connector.

## Global Constraints

- Canonical local folder: `C:\Users\thugs\Desktop\projects\geo-tool`.
- Canonical GitHub repository: `spandreou/geo-tool`.
- Preserve the existing Geo dirty worktree before any rename, move, archive, or remote mutation.
- Preserve `spandreou/RealEstateAnalytics` history as `archive/real-estate-legacy` in the canonical repository.
- Archive `spandreou/RealEstateAnalytics`; never delete it.
- Keep one active application tree in canonical `main`; do not copy the standalone legacy app into a subdirectory.
- Do not commit generated output, dependency folders, environment files, tokens, credentials, or machine caches.
- Replace the hard-coded Cloudflare tunnel credential in the untracked Compose file before staging it.
- Do not read or print `.env` values, GitHub tokens, Vercel credentials, Mapbox tokens, SSH keys, or homelab secrets.
- Do not change or deploy the Geo Tool homelab service, Cloudflare tunnel, DNS, or containers.
- Preserve unrelated dirty files in Geo Tool, RealEstateProject, and WebPortfolio.
- Update WebPortfolio from the commit currently serving production; do not regress the particle-interface work.
- Keep `https://spandreou.vercel.app` as the production portfolio URL.
- Use a Vercel preview and verify it before changing production.

---

### Task 1: Capture Preflight Evidence and Recoverable Backups

**Files:**
- Create outside repositories: `$backupRoot` under `C:\Users\thugs\.codex\backups\`, computed by Task 1 Step 3
- Read: `Geo Data Processing Tool/.git/**`
- Read: `RealEstateProject/.git/**`
- Read: `WebPortfolio/.git/**`

**Interfaces:**
- Consumes: the three existing local checkouts and their dirty state.
- Produces: `$backupRoot`, two source snapshots, SHA-256 manifests, and Git-state evidence used by every later task.

- [ ] **Step 1: Resolve and validate the exact source paths**

Run from `C:\Users\thugs\Desktop\projects`:

```powershell
$workspaceRoot = [IO.Path]::GetFullPath('C:\Users\thugs\Desktop\projects')
$geoSource = [IO.Path]::GetFullPath((Get-Item -LiteralPath '.\Geo Data Processing Tool').FullName)
$realEstateSource = [IO.Path]::GetFullPath((Get-Item -LiteralPath '.\RealEstateProject').FullName)
$portfolioSource = [IO.Path]::GetFullPath((Get-Item -LiteralPath '.\WebPortfolio').FullName)

$expected = @(
    [IO.Path]::Combine($workspaceRoot, 'Geo Data Processing Tool'),
    [IO.Path]::Combine($workspaceRoot, 'RealEstateProject'),
    [IO.Path]::Combine($workspaceRoot, 'WebPortfolio')
)
$actual = @($geoSource, $realEstateSource, $portfolioSource)
if (Compare-Object $expected $actual) { throw 'BLOCKED: source path validation failed' }
```

Expected: no output and no exception.

- [ ] **Step 2: Record current Git state without changing it**

Run:

```powershell
foreach ($repo in @($geoSource, $realEstateSource, $portfolioSource)) {
    "===== $repo ====="
    git -C $repo status --short --branch
    git -C $repo remote -v
    git -C $repo rev-parse HEAD
    git -C $repo branch --show-current
}
```

Expected: Geo has the large integration worktree, RealEstate has only its known documentation changes, and WebPortfolio has only its known `AGENTS.md` change.

- [ ] **Step 3: Create the timestamped backup root**

Run:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = [IO.Path]::GetFullPath("C:\Users\thugs\.codex\backups\geo-tool-consolidation-$stamp")
if (-not $backupRoot.StartsWith('C:\Users\thugs\.codex\backups\geo-tool-consolidation-', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'BLOCKED: unsafe backup path'
}
New-Item -ItemType Directory -LiteralPath $backupRoot | Out-Null
$backupRoot
```

Expected: one new path under `C:\Users\thugs\.codex\backups`.

- [ ] **Step 4: Copy both source repositories with Git metadata**

Run:

```powershell
$copyPairs = @(
    @{ Source = $geoSource; Destination = (Join-Path $backupRoot 'Geo Data Processing Tool') },
    @{ Source = $realEstateSource; Destination = (Join-Path $backupRoot 'RealEstateProject') }
)

foreach ($pair in $copyPairs) {
    robocopy $pair.Source $pair.Destination /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XD node_modules .next bin obj dist | Out-Host
    if ($LASTEXITCODE -ge 8) { throw "BLOCKED: backup failed for $($pair.Source)" }
}
```

Expected: both backup trees exist and `robocopy` exits below 8.

- [ ] **Step 5: Create and validate backup manifests**

Run:

```powershell
foreach ($name in @('Geo Data Processing Tool', 'RealEstateProject')) {
    $snapshot = Join-Path $backupRoot $name
    $manifestPath = Join-Path $backupRoot "$name.sha256.csv"
    Get-ChildItem -LiteralPath $snapshot -Recurse -File -Force |
        Sort-Object FullName |
        ForEach-Object {
            $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
            [pscustomobject]@{
                RelativePath = $_.FullName.Substring($snapshot.Length + 1)
                SHA256 = $hash.Hash
                Length = $_.Length
            }
        } | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding utf8
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'BLOCKED: manifest missing' }
}
```

Expected: two non-empty manifest CSV files.

---

### Task 2: Sanitize Geo Tool Configuration and Artifact Hygiene

**Files:**
- Modify: `Geo Data Processing Tool/.gitignore`
- Create: `Geo Data Processing Tool/.env.example`
- Replace: `Geo Data Processing Tool/docker-compose.yml`

**Interfaces:**
- Consumes: the current untracked Compose definition.
- Produces: a tracked Compose file that requires `CLOUDFLARE_TUNNEL_TOKEN` at runtime without storing its value, plus ignore rules for generated visual evidence.

- [ ] **Step 1: Create the implementation branch without touching dirty files**

Run:

```powershell
git -C 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool' switch -c codex/consolidate-geo-tool
```

Expected: branch `codex/consolidate-geo-tool`; all existing modifications and untracked files remain present.

- [ ] **Step 2: Verify the credential leak is detected by filename-only scanning**

Run:

```powershell
rg -l -P --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' 'tunnel\s+--no-autoupdate\s+run\s+--token\s+(?!\$\{)' 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool'
```

Expected: `docker-compose.yml` is listed. The credential value must not be printed.

- [ ] **Step 3: Replace the Compose file with the sanitized definition**

Use `apply_patch` to replace the whole file without copying the previous token-bearing line:

```yaml
version: "3.8"

services:
  backend:
    build:
      context: ./GeoDataProcessingTool
      dockerfile: Dockerfile
    container_name: geo-backend
    ports:
      - "5000:8080"
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: geo-frontend
    ports:
      - "8081:80"
    depends_on:
      - backend
    restart: always

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: geo-cloudflared
    restart: always
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN:?CLOUDFLARE_TUNNEL_TOKEN is required}
    depends_on:
      - frontend
```

- [ ] **Step 4: Add the environment template and generated-output ignore rule**

Create `.env.example` with:

```dotenv
CLOUDFLARE_TUNNEL_TOKEN=
```

Append to `.gitignore`:

```gitignore

# Generated QA evidence
frontend/output/
```

- [ ] **Step 5: Verify sanitized configuration and secret hygiene**

Run:

```powershell
$env:CLOUDFLARE_TUNNEL_TOKEN = 'compose-validation-placeholder'
docker compose -f 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool\docker-compose.yml' config --quiet
Remove-Item Env:CLOUDFLARE_TUNNEL_TOKEN

$matches = @(rg -l -P --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' --glob '!**/frontend/output/**' '(?i)(token|secret|password)\s*[:=]\s*[A-Za-z0-9_\-\.]{20,}' 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool')
if ($matches.Count -gt 0) { $matches; throw 'BLOCKED: possible hard-coded credential remains' }
```

Expected: Compose validation succeeds and the filename-only credential scan returns no files.

- [ ] **Step 6: Commit only the configuration hygiene change**

Run:

```powershell
git -C 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool' add -- .gitignore .env.example docker-compose.yml
git -C 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool' diff --cached --check
git -C 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool' commit -m 'chore: sanitize geo tool deployment config'
```

Expected: one commit containing only the three named files.

---

### Task 3: Validate and Commit the Integrated Geo and Real Estate Application

**Files:**
- Modify: `Geo Data Processing Tool/GeoDataProcessingTool/Controllers/GeoController.cs`
- Create: `Geo Data Processing Tool/GeoDataProcessingTool/Controllers/RealEstateController.cs`
- Modify: `Geo Data Processing Tool/GeoDataProcessingTool/Program.cs`
- Create: `Geo Data Processing Tool/GeoDataProcessingTool/Models/Property.cs`
- Create: `Geo Data Processing Tool/GeoDataProcessingTool/Models/PropertyFilters.cs`
- Create: `Geo Data Processing Tool/GeoDataProcessingTool/Services/RealEstateService.cs`
- Create: `Geo Data Processing Tool/GeoDataProcessingTool/Dockerfile`
- Modify: `Geo Data Processing Tool/frontend/package.json`
- Modify: `Geo Data Processing Tool/frontend/package-lock.json`
- Modify: `Geo Data Processing Tool/frontend/.env.example`
- Modify: `Geo Data Processing Tool/frontend/eslint.config.js`
- Modify: `Geo Data Processing Tool/frontend/vite.config.js`
- Create: `Geo Data Processing Tool/frontend/tsconfig.json`
- Create: `Geo Data Processing Tool/frontend/Dockerfile`
- Create: `Geo Data Processing Tool/frontend/nginx.conf`
- Modify: `Geo Data Processing Tool/frontend/src/App.jsx`
- Create: `Geo Data Processing Tool/frontend/src/App.test.jsx`
- Modify: `Geo Data Processing Tool/frontend/src/main.jsx`
- Modify: `Geo Data Processing Tool/frontend/src/index.css`
- Modify: `Geo Data Processing Tool/frontend/src/components/ClusterMap.jsx`
- Create: `Geo Data Processing Tool/frontend/src/components/GlobeMapExperience.tsx`
- Create: `Geo Data Processing Tool/frontend/src/components/GlobeMapExperience.test.tsx`
- Create: `Geo Data Processing Tool/frontend/src/components/MapSearchOverlay.tsx`
- Create: `Geo Data Processing Tool/frontend/src/components/PlaceResultCard.tsx`
- Create: `Geo Data Processing Tool/frontend/src/components/PriceTrendChart.jsx`
- Create: `Geo Data Processing Tool/frontend/src/components/SearchResultsCarousel.tsx`
- Create: `Geo Data Processing Tool/frontend/src/components/SearchThisAreaButton.tsx`
- Create: `Geo Data Processing Tool/frontend/src/hooks/useMapboxMap.ts`
- Create: `Geo Data Processing Tool/frontend/src/hooks/useMapboxOperationalLayers.ts`
- Create: `Geo Data Processing Tool/frontend/src/hooks/useMapSearch.ts`
- Create: `Geo Data Processing Tool/frontend/src/types/mapTypes.ts`
- Create: `Geo Data Processing Tool/frontend/src/utils/mapSearchUtils.ts`
- Create: `Geo Data Processing Tool/frontend/src/utils/operationalMapUtils.ts`
- Create: `Geo Data Processing Tool/frontend/src/utils/operationalMapUtils.test.ts`
- Create: `Geo Data Processing Tool/frontend/src/test/setup.ts`
- Create: `Geo Data Processing Tool/frontend/src/vite-env.d.ts`
- Create: `Geo Data Processing Tool/test_datasets/*.csv`
- Create: `Geo Data Processing Tool/design-qa.md`
- Create: `Geo Data Processing Tool/docs/superpowers/specs/2026-07-16-mapbox-primary-map-design.md`
- Create: `Geo Data Processing Tool/docs/superpowers/plans/2026-07-16-mapbox-primary-map.md`

**Interfaces:**
- Consumes: the user-owned dirty integration and the sanitized configuration from Task 2.
- Produces: a reviewable commit containing the working integrated application but no generated screenshots, dependency folders, secrets, or unrelated project changes.

- [ ] **Step 1: Review the exact stage candidate set**

Run:

```powershell
git -C 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool' status --short
git -C 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool' diff --stat
```

Expected: `frontend/output/` no longer appears because it is ignored; all source, tests, docs, Docker files, and test datasets remain visible.

- [ ] **Step 2: Run backend validation**

Run:

```powershell
dotnet restore 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool\GeoDataProcessingTool\GeoDataProcessingTool.csproj'
dotnet build 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool\GeoDataProcessingTool\GeoDataProcessingTool.csproj' --no-restore
```

Expected: both commands exit 0 with no build errors.

- [ ] **Step 3: Run the complete frontend verification suite**

Run from `Geo Data Processing Tool/frontend`:

```powershell
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: every command exits 0. If any command fails, stop this task and invoke `superpowers:systematic-debugging`; do not stage or commit until the same command passes.

- [ ] **Step 4: Stage only the integrated product files**

Run from the Geo repository:

```powershell
git add -- GeoDataProcessingTool frontend/.env.example frontend/eslint.config.js frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/tsconfig.json frontend/Dockerfile frontend/nginx.conf frontend/src test_datasets design-qa.md docs/superpowers/specs/2026-07-16-mapbox-primary-map-design.md docs/superpowers/plans/2026-07-16-mapbox-primary-map.md 'Geo Data Processing Tool.sln'
git diff --cached --name-only
```

Expected: no `.env`, `frontend/output`, `node_modules`, `bin`, `obj`, or token-bearing file is staged.

- [ ] **Step 5: Inspect the staged diff and run final staged checks**

Run:

```powershell
git diff --cached --stat
git diff --cached --check
$secretFiles = @(git diff --cached --name-only | ForEach-Object {
    if (Test-Path -LiteralPath $_ -PathType Leaf) {
        rg -l -P '(?i)(token|secret|password)\s*[:=]\s*[A-Za-z0-9_\-\.]{20,}' -- $_
    }
})
if ($secretFiles.Count -gt 0) { $secretFiles; throw 'BLOCKED: staged credential candidate' }
```

Expected: diff check passes and no staged credential candidate is reported.

- [ ] **Step 6: Commit the integrated application**

Run:

```powershell
git commit -m 'feat: consolidate geo and real estate analytics'
```

Expected: one product commit containing the validated integration.

---

### Task 4: Align the Canonical Geo Tool Identity

**Files:**
- Modify: `Geo Data Processing Tool/README.md`
- Modify: `Geo Data Processing Tool/AGENTS.md`
- Modify: `Geo Data Processing Tool/HOMELAB.md`
- Modify: `Geo Data Processing Tool/frontend/package.json`
- Modify mechanically: `Geo Data Processing Tool/frontend/package-lock.json`
- Rename: `Geo Data Processing Tool/Geo Data Processing Tool.sln` to `Geo Data Processing Tool/geo-tool.sln`

**Interfaces:**
- Consumes: the tested integrated application.
- Produces: one active product identity, `Geo Tool`, while preserving the internal .NET project and namespace names for compatibility.

- [ ] **Step 1: Update active documentation with the final identity**

Use `apply_patch` so the active docs contain:

```markdown
# Geo Tool

Geo Tool is a full-stack geospatial and real-estate analytics application that ingests CSV datasets, clusters geographic data, identifies outliers, filters property listings, and visualizes operational results on one interactive map.
```

Add the canonical repository URL:

```text
https://github.com/spandreou/geo-tool
```

Update `AGENTS.md` to contain exactly these workspace paths:

```text
Desktop PC: C:\Users\Spyros\OneDrive\Υπολογιστής\projects\geo-tool
Laptop: C:\Users\thugs\Desktop\projects\geo-tool
```

Add the same local workspace mapping to `HOMELAB.md` without changing server/runtime identifiers.

- [ ] **Step 2: Rename the solution and frontend package**

Run:

```powershell
Move-Item -LiteralPath 'Geo Data Processing Tool.sln' -Destination 'geo-tool.sln'
```

Use `apply_patch` to set:

```json
"name": "geo-tool-frontend"
```

Then run from `frontend`:

```powershell
npm install --package-lock-only
```

Expected: `package.json` and the lockfile agree on `geo-tool-frontend`.

- [ ] **Step 3: Verify identity consistency without rewriting historical specs**

Run:

```powershell
rg -n -i 'Geo-Data-Processing-Tool|RealEstateAnalytics|RealEstateProject|Geo Data Processing Tool' README.md AGENTS.md HOMELAB.md frontend/package.json frontend/package-lock.json
```

Expected: historical names appear only where the docs intentionally describe migration history or compatibility; all active paths and URLs use `geo-tool`.

- [ ] **Step 4: Re-run focused validation**

Run:

```powershell
dotnet build .\GeoDataProcessingTool\GeoDataProcessingTool.csproj
Push-Location frontend
npm test
npm run typecheck
npm run lint
npm run build
Pop-Location
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the identity alignment**

Run:

```powershell
git add -- README.md AGENTS.md HOMELAB.md frontend/package.json frontend/package-lock.json 'Geo Data Processing Tool.sln' geo-tool.sln
git commit -m 'refactor: align project identity as geo tool'
```

Expected: one identity-only commit; internal backend namespaces remain unchanged.

---

### Task 5: Preserve Legacy History and Rename the Canonical GitHub Repository

**Files:**
- Modify Git refs in: `spandreou/Geo-Data-Processing-Tool`, later renamed `spandreou/geo-tool`
- Modify local Git config: `Geo Data Processing Tool/.git/config`

**Interfaces:**
- Consumes: clean `codex/consolidate-geo-tool`, `spandreou/RealEstateAnalytics/main`, and GitHub admin access.
- Produces: canonical GitHub repository `spandreou/geo-tool`, consolidation PR merged to `main`, and branch `archive/real-estate-legacy` preserving the old history.

- [ ] **Step 1: Verify preconditions with GitHub plugin and local Git**

Use the GitHub connector to fetch metadata for:

```text
spandreou/Geo-Data-Processing-Tool
spandreou/RealEstateAnalytics
```

Run locally:

```powershell
git status --short
git log --oneline -5
```

Expected: both repositories are public and writable; the Geo worktree is clean.

- [ ] **Step 2: Fetch and publish the standalone history as an archive branch**

Run:

```powershell
git remote add real-estate-legacy https://github.com/spandreou/RealEstateAnalytics.git
git fetch real-estate-legacy main
git push origin refs/remotes/real-estate-legacy/main:refs/heads/archive/real-estate-legacy
$sourceSha = git rev-parse refs/remotes/real-estate-legacy/main
$remoteSha = (git ls-remote origin refs/heads/archive/real-estate-legacy).Split("`t")[0]
if ($sourceSha -ne $remoteSha) { throw 'BLOCKED: legacy branch SHA mismatch' }
```

Expected: the source and remote SHA values match exactly.

- [ ] **Step 3: Push the consolidation branch**

Run:

```powershell
git push -u origin codex/consolidate-geo-tool
```

Expected: the branch exists remotely and points to the local HEAD.

- [ ] **Step 4: Rename the GitHub repository using the authenticated GitHub API**

Run:

```powershell
gh api --method PATCH repos/spandreou/Geo-Data-Processing-Tool -f name=geo-tool --silent
git remote set-url origin https://github.com/spandreou/geo-tool.git
git fetch origin
```

Expected: the API exits 0 and `git remote get-url origin` returns the new URL.

- [ ] **Step 5: Create and review the canonical pull request with the GitHub plugin**

Use the GitHub connector to create a pull request in `spandreou/geo-tool`:

```text
head: codex/consolidate-geo-tool
base: main
title: Consolidate Geo Tool and Real Estate Analytics
```

The body must list the three validation groups: backend build, frontend test/typecheck/lint/build, and sanitized Compose validation. Fetch the PR diff, changed filenames, and combined commit status before merging.

Expected: the PR contains the configuration, integration, and identity commits but no generated output or credential file.

- [ ] **Step 6: Merge the canonical pull request and synchronize local main**

Use the GitHub connector to create a merge commit, preserving the separate design, plan, security, integration, and identity commits. Then run:

```powershell
git switch main
git pull --ff-only origin main
git branch --contains origin/main
```

Expected: local `main` includes the integrated application, and `archive/real-estate-legacy` remains a separate unrelated branch.

---

### Task 6: Replace the Duplicate WebPortfolio Entries and Verify Vercel

**Files:**
- Create: `WebPortfolio/tests/projects-data.test.ts`
- Modify: `WebPortfolio/lib/projects-data.ts`
- Modify: `WebPortfolio/package.json`

**Interfaces:**
- Consumes: canonical GitHub URL `https://github.com/spandreou/geo-tool` and the commit currently serving Vercel production.
- Produces: exactly one portfolio record with slug `geo-tool`, eight total projects, a Vercel preview, a merged WebPortfolio PR, and a verified production deployment.

- [ ] **Step 1: Create a portfolio branch from the current production commit**

Use the Vercel connector to read the latest production deployment and confirm that `meta.githubCommitSha` is `f49454e099b0d5cbb133148e7d070904a3de1f9a`. Confirm that SHA exists locally, then run:

```powershell
git -C 'C:\Users\thugs\Desktop\projects\WebPortfolio' cat-file -e 'f49454e099b0d5cbb133148e7d070904a3de1f9a^{commit}'
git -C 'C:\Users\thugs\Desktop\projects\WebPortfolio' switch -c codex/consolidate-geo-tool-portfolio f49454e099b0d5cbb133148e7d070904a3de1f9a
```

Do not stage the pre-existing `AGENTS.md` modification.

Expected: the new branch starts from the exact production commit.

- [ ] **Step 2: Add a failing project-catalog test**

Create `tests/projects-data.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { projectsData } from "../lib/projects-data.ts";

test("publishes one canonical Geo Tool project", () => {
  const geoProjects = projectsData.filter((project) => project.slug === "geo-tool");

  assert.equal(projectsData.length, 8);
  assert.equal(geoProjects.length, 1);
  assert.equal(geoProjects[0].name, "Geo Tool");
  assert.equal(geoProjects[0].githubUrl, "https://github.com/spandreou/geo-tool");
  assert.equal(geoProjects[0].status, "in-progress");
  assert.equal(
    projectsData.some((project) => project.slug === "real-estate-analytics"),
    false,
  );
  assert.equal(
    projectsData.some((project) => project.slug === "geo-data-processing-tool"),
    false,
  );
});
```

Add this script to `package.json`:

```json
"test": "node --test tests/*.test.ts"
```

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
npm test
```

Expected: FAIL because the catalog still contains nine projects and no `geo-tool` slug.

- [ ] **Step 4: Replace the two project objects with one canonical object**

In `lib/projects-data.ts`, replace the `RealEstateAnalytics` and `Geo Data Processing Tool` entries with:

```typescript
{
  name: "Geo Tool",
  slug: "geo-tool",
  shortDescription:
    "Full-stack geospatial and real-estate analytics tool for CSV ingestion, clustering, filtering, outlier analysis, and interactive map exploration.",
  fullDescription:
    "Built as one operational workspace that processes geographic and property datasets through a .NET API, then visualizes clusters, listings, trends, filters, and outliers on a unified interactive map.",
  technologies: [
    ".NET 8 Web API",
    "C#",
    "NetTopologySuite",
    "CsvHelper",
    "React",
    "TypeScript",
    "Vite",
    "Tailwind CSS",
    "Mapbox GL JS",
  ],
  category: "data",
  githubUrl: "https://github.com/spandreou/geo-tool",
  featured: false,
  status: "in-progress",
},
```

- [ ] **Step 5: Run local WebPortfolio verification and verify GREEN**

Run from `WebPortfolio`:

```powershell
npm test
npm run lint
npm run build
git diff --check -- package.json lib/projects-data.ts tests/projects-data.test.ts
```

Expected: all commands exit 0 and the test reports one canonical Geo Tool project.

- [ ] **Step 6: Commit and push only the catalog change**

Run:

```powershell
git add -- package.json lib/projects-data.ts tests/projects-data.test.ts
$staged = @(git diff --cached --name-only)
if ($staged -contains 'AGENTS.md') { throw 'BLOCKED: unrelated AGENTS.md is staged' }
git commit -m 'feat: consolidate geo tool portfolio entry'
git push -u origin codex/consolidate-geo-tool-portfolio
```

Expected: one commit with exactly the three intended files.

- [ ] **Step 7: Verify the Vercel preview before merging**

Use the Vercel connector to list deployments for project `prj_c231PUs76IexqLbNm0yFaIS0f0XA` in team `team_bqz0aK8RVFstZuGDH1ZQPQv0`. Select the `READY` preview whose `githubCommitSha` equals the portfolio commit. Fetch its `/projects` URL and verify:

```text
totalProjects = 8
Geo Tool occurs once
real-estate-analytics does not occur
geo-data-processing-tool does not occur
https://github.com/spandreou/geo-tool occurs once
```

Open the preview at desktop and mobile widths and verify that the project card, modal, filter, and link remain usable.

- [ ] **Step 8: Merge the WebPortfolio PR and verify production**

Use the GitHub connector to create and merge a PR from `codex/consolidate-geo-tool-portfolio` into `main` after fetching its diff and combined status. Wait for the Git-linked Vercel production deployment whose commit SHA equals the merged `main` commit and whose state is `READY`.

Use the Vercel connector to fetch:

```text
https://spandreou.vercel.app/projects
```

Repeat the four exact content assertions from Step 7 and check runtime errors for the production project over the last hour.

Expected: production is `READY`, contains eight projects, and has no newly introduced relevant runtime errors.

---

### Task 7: Redirect and Archive the Legacy RealEstateAnalytics Repository

**Files:**
- Modify: `RealEstateProject/README.md`
- Modify GitHub setting: `spandreou/RealEstateAnalytics.archived = true`

**Interfaces:**
- Consumes: verified canonical repository and verified production portfolio link.
- Produces: a clear redirect notice on the legacy README and a read-only archived repository.

- [ ] **Step 1: Create the legacy documentation branch**

Run:

```powershell
git -C 'C:\Users\thugs\Desktop\projects\RealEstateProject' switch -c docs/archive-redirect
```

Expected: known dirty `HOMELAB.md` and untracked `AGENTS.md` remain untouched.

- [ ] **Step 2: Add the redirect notice at the top of the README**

Use `apply_patch` to insert:

```markdown
> [!IMPORTANT]
> This repository is archived. Its product direction and active development have moved to [Geo Tool](https://github.com/spandreou/geo-tool), which combines geospatial processing and real-estate analytics in one full-stack application.
```

- [ ] **Step 3: Commit and push only the README**

Run:

```powershell
git -C 'C:\Users\thugs\Desktop\projects\RealEstateProject' add -- README.md
$staged = @(git -C 'C:\Users\thugs\Desktop\projects\RealEstateProject' diff --cached --name-only)
if ($staged.Count -ne 1 -or $staged[0] -ne 'README.md') { throw 'BLOCKED: unexpected legacy staging' }
git -C 'C:\Users\thugs\Desktop\projects\RealEstateProject' commit -m 'docs: redirect development to geo tool'
git -C 'C:\Users\thugs\Desktop\projects\RealEstateProject' push -u origin docs/archive-redirect
```

Expected: only `README.md` is committed.

- [ ] **Step 4: Merge the legacy README PR with the GitHub plugin**

Use the GitHub connector to create and merge a PR in `spandreou/RealEstateAnalytics` from `docs/archive-redirect` to `main`. Fetch the resulting `main` README and verify the canonical link before proceeding.

- [ ] **Step 5: Archive the old repository**

Run:

```powershell
gh api --method PATCH repos/spandreou/RealEstateAnalytics -F archived=true --silent
```

Use the GitHub connector to fetch repository metadata and verify:

```text
repository_full_name = spandreou/RealEstateAnalytics
archived = true
visibility = public
```

Expected: archived/read-only and not deleted.

---

### Task 8: Consolidate the Local Workspace into One Active Folder

**Files:**
- Move: `C:\Users\thugs\Desktop\projects\Geo Data Processing Tool` to `C:\Users\thugs\Desktop\projects\geo-tool`
- Move: `C:\Users\thugs\Desktop\projects\RealEstateProject` to `$realEstateDestination`, computed and validated in Task 8 Step 1

**Interfaces:**
- Consumes: merged canonical `main`, archived legacy GitHub repository, and Task 1 backup root.
- Produces: one active local `geo-tool` folder with the new remote and one recoverable retired checkout outside the projects root.

- [ ] **Step 1: Resolve and validate all move targets**

Run from `C:\Users\thugs\Desktop\projects`:

```powershell
$workspaceRoot = [IO.Path]::GetFullPath('C:\Users\thugs\Desktop\projects')
$geoSource = [IO.Path]::GetFullPath((Get-Item -LiteralPath '.\Geo Data Processing Tool').FullName)
$realEstateSource = [IO.Path]::GetFullPath((Get-Item -LiteralPath '.\RealEstateProject').FullName)
$geoDestination = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'geo-tool'))
$backupRoot = (Get-ChildItem -LiteralPath 'C:\Users\thugs\.codex\backups' -Directory -Filter 'geo-tool-consolidation-*' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1).FullName
$retiredRoot = [IO.Path]::GetFullPath((Join-Path $backupRoot 'retired-local-checkouts'))
$realEstateDestination = [IO.Path]::GetFullPath((Join-Path $retiredRoot 'RealEstateProject'))

if ($geoSource -ne [IO.Path]::Combine($workspaceRoot, 'Geo Data Processing Tool')) { throw 'BLOCKED: unexpected Geo source' }
if ($realEstateSource -ne [IO.Path]::Combine($workspaceRoot, 'RealEstateProject')) { throw 'BLOCKED: unexpected Real Estate source' }
if (-not $geoDestination.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'BLOCKED: unsafe Geo destination' }
if (-not $realEstateDestination.StartsWith($backupRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'BLOCKED: unsafe retired destination' }
if (Test-Path -LiteralPath $geoDestination) { throw 'BLOCKED: geo-tool destination already exists' }
if (Test-Path -LiteralPath $realEstateDestination) { throw 'BLOCKED: retired destination already exists' }
```

Expected: no exception.

- [ ] **Step 2: Ensure both checkouts are at their verified final states**

Run:

```powershell
git -C $geoSource status --short --branch
git -C $geoSource remote get-url origin
git -C $realEstateSource status --short --branch
```

Expected: Geo is on current `main` with origin `https://github.com/spandreou/geo-tool.git`; only the known local documentation files remain dirty in RealEstateProject.

- [ ] **Step 3: Move the retired Real Estate checkout outside the projects root**

Run:

```powershell
New-Item -ItemType Directory -LiteralPath $retiredRoot | Out-Null
Move-Item -LiteralPath $realEstateSource -Destination $realEstateDestination
if (Test-Path -LiteralPath $realEstateSource) { throw 'BLOCKED: old Real Estate source still exists' }
if (-not (Test-Path -LiteralPath $realEstateDestination -PathType Container)) { throw 'BLOCKED: retired checkout missing' }
```

Expected: the checkout exists only under the backup root.

- [ ] **Step 4: Rename the canonical local folder**

Run:

```powershell
Move-Item -LiteralPath $geoSource -Destination $geoDestination
if (Test-Path -LiteralPath $geoSource) { throw 'BLOCKED: old Geo folder still exists' }
if (-not (Test-Path -LiteralPath $geoDestination -PathType Container)) { throw 'BLOCKED: geo-tool destination missing' }
```

Expected: `C:\Users\thugs\Desktop\projects\geo-tool` is the only active folder for this product.

- [ ] **Step 5: Verify the moved repository**

Run:

```powershell
git -C $geoDestination status --short --branch
git -C $geoDestination remote -v
git -C $geoDestination log -5 --oneline
Test-Path -LiteralPath 'C:\Users\thugs\Desktop\projects\RealEstateProject'
Test-Path -LiteralPath 'C:\Users\thugs\Desktop\projects\Geo Data Processing Tool'
```

Expected: origin is `spandreou/geo-tool`; both final `Test-Path` results are `False`.

---

### Task 9: Final Cross-System Verification and Handoff

**Files:**
- Read: `C:\Users\thugs\Desktop\projects\geo-tool/**`
- Read: `C:\Users\thugs\Desktop\projects\WebPortfolio/**`
- Read via GitHub: `spandreou/geo-tool`, `spandreou/RealEstateAnalytics`, `spandreou/WebPortfolio`
- Read via Vercel: project `prj_c231PUs76IexqLbNm0yFaIS0f0XA`

**Interfaces:**
- Consumes: all completed tasks.
- Produces: acceptance evidence and a final handoff containing backup path, commits, repository state, archive state, Vercel deployment, tests, and rollback instructions.

- [ ] **Step 1: Run final Geo Tool checks from the renamed folder**

Run:

```powershell
Push-Location 'C:\Users\thugs\Desktop\projects\geo-tool'
dotnet build .\GeoDataProcessingTool\GeoDataProcessingTool.csproj
Push-Location frontend
npm test
npm run typecheck
npm run lint
npm run build
Pop-Location
$env:CLOUDFLARE_TUNNEL_TOKEN = 'compose-validation-placeholder'
docker compose config --quiet
Remove-Item Env:CLOUDFLARE_TUNNEL_TOKEN
git diff --check
git status --short --branch
Pop-Location
```

Expected: all validation commands pass and the canonical worktree is clean.

- [ ] **Step 2: Verify GitHub state with the GitHub plugin**

Fetch repository metadata and branch state to prove:

```text
spandreou/geo-tool: active, public, default branch main
spandreou/geo-tool branch archive/real-estate-legacy: present
spandreou/RealEstateAnalytics: archived, public, not deleted
spandreou/WebPortfolio main: contains the consolidated project entry
```

- [ ] **Step 3: Verify portfolio production with the Vercel plugin**

Use the Vercel connector to fetch the current project, latest production deployment, `/projects` page, and production runtime errors for the last hour.

Expected:

```text
deployment state = READY
project count = 8
Geo Tool entries = 1
old RealEstateAnalytics entries = 0
old Geo Data Processing Tool entries = 0
canonical GitHub URL entries = 1
new relevant runtime errors = 0
```

- [ ] **Step 4: Report the complete rollback map**

The final handoff must include:

- timestamped backup root;
- canonical local path and both computer path mappings;
- canonical repository URL and merge commit;
- legacy archive branch SHA;
- archived repository URL and archived status;
- WebPortfolio merge commit;
- Vercel production deployment ID and URL;
- exact successful validation commands;
- known unrelated dirty files preserved outside the canonical project;
- rollback actions: restore the local snapshots, unarchive `RealEstateAnalytics`, rename `geo-tool` back if required, reset `origin`, and use the prior Vercel production deployment.

Expected: every acceptance criterion in the design spec has direct evidence.
