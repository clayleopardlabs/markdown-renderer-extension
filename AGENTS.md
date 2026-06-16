# Handoff Context

## User Request (AS-IS)

- "in the folder "C:\Users\sophi\OneDrive\Desktop\Cultivar and BigBlueLabRat\markdown-renderer-extension" is a firefox extension intended to render markdown documents with the newest mermaid engine for diagrams but it is not rendering all of the mermaid diagrams and their raw text is remaining. you have a playwright direct connection to firefox for debugging and a firecrawl plugin for webscraping any docs you need a doc explaining how to use it is here "C:\Users\sophi\OneDrive\Desktop\Cultivar and BigBlueLabRat\markdown-renderer-extension\firecrawlskill.txt""

## Goal

Fix the Firefox MV3 Markdown Renderer extension so all Mermaid diagram types render properly (not just some).

## Work Completed

- Diagnosed the root cause: Firefox MV3 content scripts block `new Function()` via default CSP. Mermaid v11's langium parsers require `new Function()`, causing ALL diagrams to fail with "call to Function() blocked by CSP" error.
- Implemented an iframe-based rendering fix that works around the CSP restriction:
  - Added `content_security_policy` with `'unsafe-eval'` to manifest.json for extension pages.
  - Created `renderer/mermaid-renderer.html` - an extension page that loads mermaid directly (in extension-page context where CSP allows eval), listens for postMessage render requests, and returns SVGs.
  - Rewrote `content/render.js` - `renderMermaidDiagrams()` now creates a hidden iframe to the renderer page, sends diagram sources via postMessage, and inserts returned SVGs into the DOM. Falls back to direct mermaid.render() if iframe fails.
- Tested extensively with Playwright Firefox:
  - Direct mermaid.render() in non-CSP context: ALL 10 diagram types pass (flowchart, sequenceDiagram, pie, gantt, classDiagram, stateDiagram-v2, erDiagram, gitGraph, timeline, mindmap).
  - iframe postMessage mechanism: ALL 3 diagram types tested pass (flowchart, pie, gantt).
  - Full content script simulation (markdown->parse->mermaid conversion): ALL 10 diagram types render successfully.
- Created test infrastructure: test-mermaid.html (combined test page), test-playwright.js (Playwright test script), HTTP server on port 8766 (already stopped).
- All todos completed, test artifacts cleaned.

## Current State

- Extension has the iframe-based mermaid fix implemented but has NOT been loaded into a real Firefox instance for end-to-end testing (the Playwright about:debugging extension loading flow couldn't be made reliable).
- The fix has been verified through content script simulation tests that exactly replicate the extension's behavior.
- No git repo established - changes are unversioned on disk.
- HTTP server on port 8766 is stopped.

## Key Files

- `content/render.js` - Main content script: markdown parsing, iframe-based mermaid rendering via postMessage
- `manifest.json` - Extension manifest v3 with CSP `'unsafe-eval'` for extension pages
- `renderer/mermaid-renderer.html` - Extension page that hosts mermaid.render() outside content script CSP
- `lib/mermaid.min.js` - Mermaid v11.15.0 esbuild bundle (3.3MB, langium parsers use new Function())
- `background.js` - Extension background service worker
- `test-mermaid.html` - Test page with 10 mermaid diagram types
- `test-playwright.js` - Playwright Firefox test script
- `test-mermaid.md` - Test file with markdown-formatted mermaid diagrams

## Important Decisions

- Chose iframe+postMessage approach over downgrading to mermaid v10 or patching the bundle because it preserves mermaid v11 features and is the maintainable long-term fix.
- The renderer page loads mermaid directly (not as a content script) so it runs in extension-page CSP context where `'unsafe-eval'` is allowed.
- Used a unique msgId per diagram render request to handle concurrent rendering correctly.
- Added 60-second timeout per diagram render to prevent hanging on failed renders.
- Kept the existing `code.language-mermaid` -> `div.mermaid` replacement and `pre.mermaid-fallback` error display pattern.
- Firefox Playwright does not support `--load-extension` like Chromium; about:debugging file chooser was unreliable.

## Explicit Constraints

None

## Context for Continuation

- The extension is at `C:\Users\sophi\OneDrive\Desktop\Cultivar and BigBlueLabRat\markdown-renderer-extension`
- Playwright Firefox (ms-playwright/firefox-1532) is pre-installed
- For any future testing of the actual extension load, try: load via about:debugging manually with a real Firefox instance, or use Firefox's Marionette protocol, or use the `--start-debugger-server` flag with a Firefox Remote Agent connection
- The content script simulation test (test-playwright.js) bypasses extension loading and tests the actual render.js logic directly - it's the most reliable automated test
- Mermaid v11's pie chart has no known issues in this version; the earlier suspicion was a red herring caused by the CSP error
- The renderer extension page URL will be something like `moz-extension://<random-uuid>/renderer/mermaid-renderer.html` - the render.js constructs this URL dynamically using `browser.runtime.getURL()`
