# Only Firefox Extension with the NEW mermaid engine

A Firefox browser extension that renders `.md` files with dark mode (on by default) and full Mermaid diagram support, including the ones only supported in 10+.

## Features

- **Automatic markdown rendering** — detects `.md` and `.markdown` files and renders them in-browser with a clean dark theme
- **Mermaid diagrams** — renders all diagram types: flowchart, sequenceDiagram, pie, gantt, classDiagram, stateDiagram, erDiagram, gitGraph, timeline, mindmap
- **Dark mode by default** — low-eyestrain viewing for documentation-heavy workflows
- **Lightweight** — no external dependencies beyond the bundled marked and mermaid libraries
- **Works on file:// URLs** — renders local `.md` files directly from disk

## Installation

### Firefox (temporary)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from the extension directory

### Firefox (permanent)

Package the extension and sign it via [addons.mozilla.org](https://addons.mozilla.org).

## Usage

Once installed, navigate to any `.md` file in Firefox. The extension automatically:

1. Detects the markdown content
2. Renders it with syntax highlighting and dark styling
3. Processes any Mermaid diagram blocks and converts them to SVGs

Open the popup (click the toolbar icon) for quick settings or status info.

## How the Mermaid renderer works

Firefox MV3 content scripts block `new Function()` via the default CSP. Mermaid v11's langium parsers require it, so a direct content-script approach would fail for all diagram types.

This extension uses an iframe-based workaround:

1. `content/render.js` detects Mermaid code blocks in the markdown
2. It creates a hidden iframe pointing to `renderer/mermaid-renderer.html` (an extension page that runs outside the content-script CSP)
3. Diagram sources are sent to the iframe via `postMessage`
4. The iframe renders them with Mermaid and returns SVGs
5. The content script inserts the rendered diagrams into the page DOM

If the iframe mechanism fails, it falls back to `mermaid.render()` directly.

## Project structure

```
├── manifest.json            Extension manifest (Manifest v2, Firefox)
├── background.js            Background script (non-persistent)
├── content/
│   ├── render.js            Content script — markdown detection and rendering
│   └── styles.css           Rendered markdown styles (dark theme)
├── renderer/
│   └── mermaid-renderer.html  Extension page for CSP-safe Mermaid rendering
├── popup/
│   └── popup.html           Toolbar popup
├── lib/
│   ├── marked.min.js        Markdown parser (marked)
│   └── mermaid.min.js       Diagram engine (Mermaid)
├── icons/                   Extension icons (SVG)
├── test-mermaid.html        Test page for manual verification
├── test-playwright.js       Playwright-based integration tests
├── serve-test.js            HTTP server for local testing
├── package.json             Playwright dependency (dev only)
├── AGENTS.md                Development context (AI agent reference)
├── .omo/                    Personal development files — not needed for the extension itself
└── node_modules/            Playwright runtime (dev only)
```

## Development

```bash
# Install dev dependencies
npm install

# Run the test server
node serve-test.js

# Run Playwright tests
npx playwright test test-playwright.js
```

The `.omo` directory contains personal development workspace files used during creation. It is not needed to build, install, or run the extension.

## License

MIT
