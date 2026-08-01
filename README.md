# Daniel Vasko — Portfolio

A minimal, responsive multi-page portfolio prepared for GitHub Pages. It uses plain HTML, CSS, and JavaScript, so there is no build step or framework dependency.

## Run locally

The project list is loaded with `fetch()`, so serve the repository rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Customize before publishing

1. Update the contact placeholders in `js/app.js`.
2. Edit project content in `data/projects.json`.
3. Add a CV under `assets/` and link it from the hero when ready.
4. In the repository settings, set **Pages → Build and deployment → Deploy from a branch**, then select this branch and `/ (root)`.

## Architecture

```text
UI (index.html, js/components)
           ↓
Services (js/services)
           ↓
Local JSON now; GitHub API or an external backend later
```

GitHub Pages is a static host and cannot safely store login credentials or accept uploads by itself. A future gallery admin should authenticate through a trusted external backend (or a carefully scoped OAuth flow), compress images in the browser, validate them on the server, and then use the GitHub API or object storage. Never put a GitHub token in client-side JavaScript.
