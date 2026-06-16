(function () {
  'use strict';

  console.log('[MD-Renderer] Script loaded at', window.location.href);

  const path = window.location.pathname;
  const isMdFile = /\.(md|markdown)$/i.test(path);

  const isRawContent = document.contentType === 'text/plain'
    && document.body
    && document.body.children.length <= 2
    && /[#*[`>-]/.test(document.body.textContent?.slice(0, 2000) || '');

  if (!isMdFile && !isRawContent) {
    console.log('[MD-Renderer] Skipped — no .md extension and not raw content');
    return;
  }

  let rendered = false;

  // ─── Visible debug badge ──────────────────────────────────────────
  function addBadge(status, detail) {
    const existing = document.getElementById('md-renderer-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'md-renderer-badge';
    badge.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;padding:6px 12px;'
      + 'border-radius:6px;font:12px/1.4 monospace;color:#fff;'
      + 'background:' + (status === 'ok' ? '#238636' : status === 'err' ? '#da3633' : '#1f6feb')
      + ';box-shadow:0 2px 8px rgba(0,0,0,0.4);max-width:70vw;word-break:break-word;';
    badge.textContent = 'MD-Renderer: ' + detail;
    document.body.appendChild(badge);
    if (status === 'ok') {
      setTimeout(() => badge.style.opacity = '0.3', 4000);
    }
  }

  // ─── Fetch raw markdown via network, not DOM ──────────────────────
  async function getMarkdownText() {
    // Preferred method: fetch the file directly
    try {
      const url = window.location.href;
      console.log('[MD-Renderer] Fetching:', url);
      const resp = await fetch(url);
      if (resp.ok) {
        const text = await resp.text();
        console.log('[MD-Renderer] Fetched', text.length, 'bytes');
        if (text.trim().length > 50) return text;
      }
    } catch (e) {
      console.warn('[MD-Renderer] fetch failed, falling back to DOM:', e.message);
    }

    // Fallback: scrape from DOM
    const pre = document.querySelector('pre');
    if (pre && pre.textContent.trim().length > 50) return pre.textContent;
    if (document.body) return document.body.textContent;
    return document.documentElement.textContent || '';
  }

  // ─── Build rendered page ──────────────────────────────────────────
  function buildContainer(markdown, darkMode) {
    const html = marked.parse(markdown, {
      breaks: true,
      gfm: true,
    });
    const container = document.createElement('article');
    container.id = 'md-renderer';
    container.className = darkMode ? 'theme-dark' : 'theme-light';
    container.innerHTML = html;
    return container;
  }

  // ─── Render mermaid diagrams ──────────────────────────────────────
  // In Firefox MV2, content scripts can use new Function() natively, so
  // direct mermaid.render() is the primary path.  We only fall back to the
  // extension-page iframe if direct rendering fails (e.g. CSP restrictions
  // in MV3 or strict-dynamic environments).

  async function renderMermaidDiagrams(container, darkMode) {
    const blocks = Array.from(container.querySelectorAll('code.language-mermaid'));
    console.log('[MD-Renderer] Found', blocks.length, 'mermaid blocks');

    if (blocks.length === 0) return 0;

    // Replace <pre><code class="language-mermaid"> → <div class="mermaid">
    for (let i = 0; i < blocks.length; i++) {
      const code = blocks[i];
      const pre = code.closest('pre');
      if (!pre) continue;

      const source = code.textContent;
      if (!source.trim()) { pre.remove(); continue; }

      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = source;
      pre.replaceWith(div);
    }

    const mermaidDivs = Array.from(container.querySelectorAll('div.mermaid'));
    if (mermaidDivs.length === 0) return 0;

    // Primary: direct mermaid.render() (works in MV2 content scripts)
    try {
      const count = await renderMermaidDirect(mermaidDivs, darkMode);
      if (count > 0) return count;
    } catch (_) {}
    // Fall through to iframe approach

    // Fallback: render via sandboxed extension-page iframe
    return renderMermaidViaIframe(mermaidDivs, darkMode);
  }

  async function renderMermaidDirect(mermaidDivs, darkMode) {
    if (typeof mermaid === 'undefined') return 0;

    mermaid.initialize({
      startOnLoad: false,
      theme: darkMode ? 'dark' : 'default',
      securityLevel: 'loose',
      suppressErrorRendering: true,
    });

    let successCount = 0;
    for (const div of mermaidDivs) {
      const source = div.textContent;
      const diagramType = source.split('\n')[0].trim().split(/\s/)[0];
      try {
        const result = await mermaid.render(
          'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          source
        );
        const svg = (typeof result === 'object' && result !== null && 'svg' in result)
          ? result.svg
          : String(result);
        div.innerHTML = svg;
        div.classList.add('mermaid-wrapper');
        successCount++;
        console.log('[MD-Renderer] OK [' + diagramType + '], svg:', svg.length, 'chars');
      } catch (err) {
        console.warn('[MD-Renderer] Direct FAILED [' + diagramType + ']:', err.message || err);
        const fb = document.createElement('pre');
        fb.className = 'mermaid-fallback';
        fb.textContent = source;
        div.replaceWith(fb);
      }
    }
    return successCount;
  }

  async function renderMermaidViaIframe(mermaidDivs, darkMode) {
    console.warn('[MD-Renderer] Falling back to iframe rendering');

    const iframeUrl = browser.runtime.getURL('renderer/mermaid-renderer.html');
    const iframe = document.createElement('iframe');
    iframe.id = 'md-mermaid-iframe';
    iframe.src = iframeUrl;
    iframe.style.cssText = 'display:none;width:0;height:0;border:none;';
    document.body.appendChild(iframe);

    await new Promise((resolve, reject) => {
      iframe.onload = resolve;
      const timer = setTimeout(() => reject(new Error('Timeout loading iframe')), 15000);
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });

    const theme = darkMode ? 'dark' : 'default';
    let successCount = 0;

    for (const div of mermaidDivs) {
      // Skip already-rendered diagrams (from direct attempt that succeeded)
      if (div.classList.contains('mermaid-wrapper')) { successCount++; continue; }

      const source = div.textContent;
      if (source.startsWith('<svg')) { successCount++; continue; }

      const diagramType = source.split('\n')[0].trim().split(/\s/)[0];
      console.log('[MD-Renderer] Iframe-rendering [' + diagramType + ']');

      const msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

      try {
        const svg = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout rendering ' + diagramType)), 30000);
          const handler = (event) => {
            if (event.data && event.data.type === 'result' && event.data.id === msgId) {
              clearTimeout(timer);
              window.removeEventListener('message', handler);
              event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.svg);
            }
          };
          window.addEventListener('message', handler);
          iframe.contentWindow.postMessage(
            { type: 'render', id: msgId, source, theme }, '*'
          );
        });

        div.innerHTML = svg;
        div.classList.add('mermaid-wrapper');
        successCount++;
        console.log('[MD-Renderer] Iframe OK [' + diagramType + '], svg:', svg.length, 'chars');
      } catch (err) {
        console.warn('[MD-Renderer] Iframe FAILED [' + diagramType + ']:', err.message || err);
        const fb = document.createElement('pre');
        fb.className = 'mermaid-fallback';
        fb.textContent = source;
        div.replaceWith(fb);
      }
    }

    iframe.remove();
    console.log('[MD-Renderer] Rendered', successCount, '/', mermaidDivs.length, 'diagrams');
    return successCount;
  }

  // ─── Main render ──────────────────────────────────────────────────
  async function render() {
    try {
      const { darkMode } = await browser.storage.local.get('darkMode');
      const isDark = darkMode !== false;

      addBadge('info', 'Loading markdown...');

      const raw = await getMarkdownText();
      if (!raw || !raw.trim()) {
        addBadge('err', 'No content found');
        document.body.innerHTML = '<p style="color:#f85149;padding:2em;">No markdown content found</p>';
        return;
      }

      console.log('[MD-Renderer] Markdown length:', raw.length, 'chars');
      console.log('[MD-Renderer] First 100 chars:', raw.slice(0, 100));

      const container = buildContainer(raw, isDark);
      document.title = document.title || path.split('/').pop() || 'Markdown';
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.background = isDark ? '#0d1117' : '#ffffff';
      document.body.appendChild(container);

      const count = await renderMermaidDiagrams(container, isDark);

      rendered = true;
      document.dispatchEvent(new CustomEvent('md-renderer-ready', { detail: { darkMode: isDark } }));
      addBadge('ok', 'Rendered' + (count > 0 ? ' + ' + count + ' mermaid' : ''));
    } catch (err) {
      console.error('[MD-Renderer] Fatal:', err);
      try {
        document.body.innerHTML = '<pre style="color:#f85149;padding:2em;background:#0d1117;">'
          + 'Markdown Renderer error:\n' + (err.message || err) + '\n\nConsole → F12</pre>';
        addBadge('err', err.message || err);
      } catch (_) {}
    }
  }

  // ─── Listeners ────────────────────────────────────────────────────
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.darkMode !== undefined && rendered) render();
  });
  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'darkModeChanged' && rendered) render();
  });

  // ─── Boot ─────────────────────────────────────────────────────────
  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
      return;
    }
    // Use rAF to ensure the text viewer has painted its DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(render);
    });
  }
  boot();
})();
