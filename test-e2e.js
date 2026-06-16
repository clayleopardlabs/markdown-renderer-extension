const { firefox } = require('playwright');
const path = require('path');
const fs = require('fs');

const complexDiagram = `flowchart LR
  subgraph P1[Phase 1 - Foundation]
    direction TB
    A1[Sample Tracking]
    A2[User Management]
    A3[Cloud / SaaS]
    A4[Audit Trail]
    A5[Electronic Signatures]
  end
  subgraph P2[Phase 2 - Core Ops]
    direction TB
    B1[Workflow Automation]
    B2[Inventory & Instrument]
    B3[Results Entry]
    B4[Chain of Custody]
  end
  subgraph P3[Phase 3 - Compliance]
    direction TB
    C1[21 CFR Part 11]
    C2[ISO 17025]
    C3[ELN Integration]
    C4[No-Code Config]
  end
  subgraph P4[Phase 4 - Advanced]
    direction TB
    D1[AI / ML]
    D2[SDMS]
    D3[Multi-site]
    D4[Mobile]
  end
  P1 --> P2 --> P3 --> P4
  A1 --> B1
  A2 --> B2
  A3 --> B1
  A4 --> C1
  A4 --> C2
  A5 --> C1
  B1 --> C4
  B2 --> D2
  B3 --> D1`;

const extPath = path.resolve(__dirname);

(async () => {
  const profileDir = path.join(__dirname, 'test-e2e-profile');
  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  fs.mkdirSync(profileDir, { recursive: true });

  const context = await firefox.launchPersistentContext(profileDir, {
    headless: false,
    firefoxUserPrefs: {
      'xpinstall.signatures.required': false,
    },
  });

  const page = await context.newPage();
  const consoleLogs = [];
  const errors = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log(`  [PAGE ERROR] ${err.message}`);
  });

  await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 15000 });

  console.log('=== Test 1: Direct mermaid.render() of complex diagram ===');
  const directResult = await page.evaluate(async (diagram) => {
    const r = { success: false, svgLen: 0, error: null };

    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'http://localhost:8766/lib/mermaid.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('mermaid load failed'));
      document.head.appendChild(s);
    });
    await new Promise(r => setTimeout(r, 2000));

    try {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        suppressErrorRendering: false,
        theme: 'default',
      });
      const result = await mermaid.render('test-complex', diagram);
      const svg = (typeof result === 'object' && result.svg) ? result.svg : String(result);
      r.success = true;
      r.svgLen = svg.length;
    } catch (e) {
      r.error = e.message || String(e);
    }
    return r;
  }, complexDiagram).catch(e => ({ success: false, error: e.message, svgLen: 0 }));

  if (directResult.success) {
    console.log(`  OK: ${directResult.svgLen} chars`);
  } else {
    console.log(`  FAIL: ${directResult.error}`);
  }

  console.log('\n=== Test 2: iframe postMessage of complex diagram ===');
  const iframeResult = await page.evaluate(async (diagram) => {
    const r = { success: false, svgLen: 0, error: null };

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;height:600px;border:none';
    const iframeReady = new Promise((resolve, reject) => {
      iframe.onload = resolve;
      iframe.onerror = () => reject(new Error('iframe load failed'));
      setTimeout(() => reject(new Error('iframe timeout')), 20000);
    });
    iframe.src = 'http://localhost:8766/renderer/mermaid-renderer.html';
    document.body.appendChild(iframe);
    await iframeReady;
    // Give mermaid 5 seconds to load in the iframe
    await new Promise(resolve => setTimeout(resolve, 5000));

    const msgId = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, error: 'timeout after 30s', svgLen: 0 });
      }, 30000);

      const handler = (event) => {
        if (event.data && event.data.type === 'result' && event.data.id === msgId) {
          window.removeEventListener('message', handler);
          clearTimeout(timeout);
          if (event.data.error) {
            resolve({ success: false, error: event.data.error, svgLen: 0 });
          } else {
            resolve({ success: true, svgLen: event.data.svg.length });
          }
        }
      };
      window.addEventListener('message', handler);
      iframe.contentWindow.postMessage(
        { type: 'render', id: msgId, source: diagram, theme: 'default' }, '*'
      );
    });
  }, complexDiagram).catch(e => ({ success: false, error: e.message, svgLen: 0 }));

  if (iframeResult.success) {
    console.log(`  OK: ${iframeResult.svgLen} chars`);
  } else {
    console.log(`  FAIL: ${iframeResult.error}`);
  }

  const errs = [...errors, ...consoleLogs.filter(l => l.type === 'error').map(l => l.text)];
  if (errs.length > 0) {
    console.log('\nErrors:', errs.join(' | '));
  }

  await page.close();
  await context.close();
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
