# Daniel Vasko / Portfolio

A minimal, responsive multi-page portfolio prepared for GitHub Pages. It uses plain HTML, CSS, and JavaScript, so the portfolio has no build step or framework dependency. The separate Dutchman game uses TypeScript, Three.js and a Vite build; its committed output is served at `games/dutchman/`.

## Run locally

The project list is loaded with `fetch()`, so serve the repository rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Traffic statistics

Each page loads GoatCounter asynchronously and reports visits to the
`barorai.goatcounter.com` site. Visit that GoatCounter dashboard to view the
daily traffic graph and page statistics; no analytics data is stored in this
static repository or fetched for display to portfolio visitors.

## Architecture

```text
UI (portfolio/index.html, portfolio/js/components)
           ↓
Services (portfolio/js/services)
           ↓
Local JSON now; GitHub API or an external backend later
```

GitHub Pages is a static host and cannot safely store login credentials or accept uploads by itself. A future gallery admin should authenticate through a trusted external backend (or a carefully scoped OAuth flow), compress images in the browser, validate them on the server, and then use the GitHub API or object storage. Never put a GitHub token in client-side JavaScript.

## Dutchman and agent navigation

See [AGENTS.md](AGENTS.md) for the repository map and [games/dutchman/source/README.md](games/dutchman/source/README.md) for game build and play instructions. Edit game source in `games/dutchman/source/`, not generated files in `games/dutchman/dist/`.

## Repository layout

- portfolio/: static HTML pages, styles, scripts and project data; no game dependencies.
- games/dutchman/source/: game source, dependencies, tests and build configuration.
- games/dutchman/docs/: game architecture and verification notes.
- games/dutchman/dist/: generated, committed production game.
- index.html and games/dutchman/index.html: stable entry-point redirects.

Build from games/dutchman/source/ using Node 22.18+ and pnpm: pnpm install --frozen-lockfile, pnpm test, pnpm build. Serve the repository root to test both applications together. On Windows without symlink privileges, pnpm 10 with --node-linker=hoisted can install the same frozen lockfile. Direct portfolio page URLs now start with portfolio/pages/.
