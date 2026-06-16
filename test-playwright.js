const { firefox } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const extPath = path.resolve(__dirname);
  const testUrl = 'http://localhost:8766/test-mermaid.html';

  console.log('Extension path:', extPath);
  console.log('Test URL:', testUrl);

  const profileDir = path.join(__dirname, 'test-profile');
  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  fs.mkdirSync(profileDir, { recursive: true });
  console.log('Profile created at:', profileDir);

  const context = await firefox.launchPersistentContext(profileDir, {
    headless: false,
    firefoxUserPrefs: {
      'xpinstall.signatures.required': false,
      'extensions.manifestV3.enabled': true,
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
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  console.log('\n=== Navigating to test page ===');
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Test 1: Direct mermaid.render() in page context
  console.log('\n=== Test 1: Direct mermaid.render() ===');
  const directResult = await page.evaluate(async () => {
    const results = [];
    try {
      const script = document.createElement('script');
      script.src = '/lib/mermaid.min.js';
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load mermaid'));
        document.head.appendChild(script);
      });
      await new Promise(r => setTimeout(r, 500));

      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', suppressErrorRendering: true, theme: 'default' });

      const tests = [
        { id: 'flowchart', source: 'graph TD\nA[Start] --> B[End]' },
        { id: 'pie', source: 'pie title Test\n"Value A": 30\n"Value B": 70' },
        { id: 'gantt', source: 'gantt\ntitle Test\ndateFormat YYYY-MM-DD\nsection Section\nTask: 2024-01-01, 30d' },
      ];

      for (const t of tests) {
        try {
          const r = await mermaid.render('test-' + t.id, t.source);
          results.push({ diagram: t.id, success: true, hasSvg: !!r.svg, svgLen: r.svg.length });
        } catch (e) {
          results.push({ diagram: t.id, success: false, error: e.message });
        }
      }
    } catch (e) {
      results.push({ error: e.message });
    }
    return results;
  }).catch(err => ({ error: err.message }));

  console.log('Direct mermaid.render():');
  if (directResult.error) { console.log('  FAILED:', directResult.error); }
  else if (Array.isArray(directResult)) {
    directResult.forEach(r => console.log(`  ${r.diagram}: ${r.success ? 'OK svgLen='+r.svgLen : 'FAIL '+r.error}`));
  }

  // Test 2: iframe postMessage approach (simulating the extension's actual mechanism)
  console.log('\n=== Test 2: iframe postMessage rendering ===');
  const iframeResult = await page.evaluate(async (extRoot) => {
    const results = [];
    const rendererUrl = 'http://localhost:8766/renderer/mermaid-renderer.html';

    const iframe = document.createElement('iframe');
    iframe.id = 'mermaid-renderer';
    iframe.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;height:600px;border:none;';

    const iframeReady = new Promise((resolve, reject) => {
      iframe.onload = resolve;
      iframe.onerror = () => reject(new Error('iframe load error'));
      setTimeout(() => reject(new Error('iframe timeout')), 10000);
    });

    iframe.src = rendererUrl;
    document.body.appendChild(iframe);
    await iframeReady;
    await new Promise(r => setTimeout(r, 3000));

    const iframeWin = iframe.contentWindow;

    async function render(source, label) {
      return new Promise((resolve, reject) => {
        const msgId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const timeout = setTimeout(() => reject(new Error('timeout')), 15000);
        const handler = (event) => {
          if (event.data && event.data.type === 'result' && event.data.id === msgId) {
            window.removeEventListener('message', handler);
            clearTimeout(timeout);
            event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.svg);
          }
        };
        window.addEventListener('message', handler);
        iframeWin.postMessage({ type: 'render', id: msgId, source, theme: 'default' }, '*');
      });
    }

    const diagrams = [
      ['graph TD\nA[Start] --> B[End]', 'flowchart'],
      ['pie title Test\n"Value A": 30\n"Value B": 70', 'pie'],
      ['gantt\ntitle Test\ndateFormat YYYY-MM-DD\nsection Section\nTask: 2024-01-01, 30d', 'gantt'],
    ];

    for (const [source, label] of diagrams) {
      try {
        const svg = await render(source, label);
        results.push({ diagram: label, success: true, svgLen: svg.length, svgStart: svg.substring(0, 80) });
      } catch (e) {
        results.push({ diagram: label, success: false, error: e.message });
      }
    }

    iframe.remove();
    return results;
  }, extPath).catch(err => ({ error: err.message }));

  console.log('iframe postMessage:');
  if (iframeResult.error) { console.log('  FAILED:', iframeResult.error); }
  else if (Array.isArray(iframeResult)) {
    iframeResult.forEach(r => {
      console.log(`  ${r.diagram}: ${r.success ? 'OK svgLen='+r.svgLen : 'FAIL '+r.error}`);
      if (r.svgStart) console.log(`    SVG: ${r.svgStart}...`);
    });
  }

  // Look for CSP errors
  const cspMsgs = consoleLogs.filter(l => l.text.toLowerCase().includes('csp') || l.text.includes('Function()'));
  if (cspMsgs.length > 0) {
    console.log('\nCSP/Function errors:', cspMsgs.map(l => l.text).join(' | '));
  }

  if (errors.length > 0) {
    console.log('\nPage errors:', errors.join(' | '));
  }

  console.log('\n=== Test complete ===');
  console.log(`Console logs: ${consoleLogs.length}, Errors: ${errors.length}`);

  await page.close();
  await context.close();
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
