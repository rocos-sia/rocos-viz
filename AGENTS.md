# Repository Guidelines

## Project Structure & Module Organization

ROCOS HMI is a React 18, TypeScript, and Vite application for robot visualization and control.

- `src/core/`: REST/WebSocket clients, control heartbeat, model loading, kinematics, and shared types.
- `src/stores/` and `src/hooks/`: Zustand state and connection/lifecycle integration.
- `src/components/`: feature-grouped Ant Design UI; `src/scene/`: Three.js rendering through React Three Fiber.
- `src/i18n/` and `src/styles/`: translations, theme, and global styles.
- `public/`: fonts and icons; `server/`: Python URDF mock server and sample robot models.
- `test/`: automated tests; `docs/`: API specifications and implementation notes.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from the committed lockfile.
- `npm run dev`: start Vite on port 5173, bind all interfaces, and open the browser.
- `ROBOT_HOST=127.0.0.1 ROBOT_PORT=8080 VITE_PORT=5173 npm run dev`: configure the development proxy; `/api` and `/ws` forward to the controller.
- `npm run build`: run TypeScript checking and build production assets into `dist/`.
- `npm run preview`: preview the production build locally.
- `npm run test:control`: run control-heartbeat and API credential regression tests.
- `npm run test:script`: run script-list and source-download protocol tests.
- `npx eslint src`: run the configured ESLint rules; no `lint` script exists.

## Coding Style & Naming Conventions

Follow surrounding TypeScript style: two-space indentation, single quotes, semicolons, and trailing commas in multiline structures. Use PascalCase for component/class files, `use`-prefixed camelCase for hooks, and camelCase for store files and functions. Prefer `@/` imports for modules under `src/`. Keep shared types in `src/core/types.ts` and respect strict TypeScript checking. ESLint uses JavaScript and TypeScript recommended rules; no formatter is configured. Add English and Chinese UI strings to `src/i18n/index.ts` and access them through `useT()`.

## Testing Guidelines

Tests use Node's built-in `node:test` and strict assertions, with files named `test/*.test.mjs`. The current suites compile selected TypeScript modules before testing. Add regression cases for changed control behavior, especially credential handling, retries, cancellation, and cleanup. No coverage threshold is configured. Run both test suites and build before submitting code changes; manually verify affected UI flows and both languages.

## Commit & Pull Request Guidelines

History mixes short updates with descriptive `feat:`, `fix:`, `refactor:`, `perf:`, and `chore:` subjects. Prefer these descriptive prefixes and a focused summary. PRs should explain the behavior change, link relevant issues, report validation commands/results, and include screenshots for UI changes. Document controller/API assumptions when changing robot communication.

## API Contract Maintenance

The sole authoritative API contract is maintained in [Apifox project `8387612`](https://app.apifox.com/project/8387612), module `7912103` (`ROCOS API`). Use the project's MCP connection for every API-contract read and update. Refresh the remote definition before reading it, and resolve the referenced operation and schema resources instead of relying on the summary index or a stale local snapshot. After each update, refresh and read back the affected definitions through MCP to verify the saved result. Do not claim a successful sync based only on a local export or an import response.

The migration to API `info.version: 3.0.0` was verified through MCP on 2026-10-21: 62 paths, 66 operations, and 48 protected operations requiring `ControlToken` AND `ClientId` in the same security requirement. The four retained online-only operations are `POST /api/robot/stiffness`, `/api/robot/damping`, `/api/robot/drag/start`, and `/api/robot/drag/stop`; the nine deprecated `/api/move/*` operations were removed. Existing deprecated calibration operations and seven extra online schemas were retained (28 schemas total). This API version is independent of the application's package version.

Do not reintroduce a maintained local OpenAPI copy; local explanatory documents are secondary implementation notes. The installed Apifox MCP currently exposes only read/refresh tools. If a write is needed, use a writable MCP connection or obtain explicit authorization for an alternative, then verify through MCP. The initial migration used the user-authorized official Apifox API/CLI and module settings. Never assume an OpenAPI import preserves module version metadata, AND authentication, or raw XML response types: verify those explicitly. Do not delete unmatched remote models/resources unless their deletion is separately authorized; deleting obsolete operations alone does not authorize deleting their schemas.

## Version Maintenance

Before creating any Git commit, read and follow [project-versioning](.agents/skills/project-versioning/SKILL.md). Assess compatibility and confirm internal testing versus patch/other release intent from explicit instructions or by asking the user before finalizing the version. Every new commit, including documentation changes, must update the version in the same commit. Internal testing increments only `rc.N` (e.g. `3.0.0-rc.0` → `3.0.0-rc.1`); a confirmed patch release increments patch and removes rc (e.g. `3.0.0-rc.1` → `3.0.1`). `package.json` is authoritative and both root versions in `package-lock.json` must match. The About dialog reads the package version directly. Editing files alone does not trigger a bump or authorize a commit.
