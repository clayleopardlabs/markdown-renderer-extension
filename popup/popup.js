(function () {
  'use strict';

  const toggle = document.getElementById('dark-toggle');

  // Load current setting
  browser.storage.local.get('darkMode').then(({ darkMode }) => {
    // default to true (dark mode on)
    const isDark = darkMode !== false;
    toggle.checked = isDark;
  });

  // Save on change
  toggle.addEventListener('change', async () => {
    await browser.storage.local.set({ darkMode: toggle.checked });

    // Also update any active tabs that are showing rendered markdown
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
      try {
        await browser.tabs.sendMessage(tab.id, {
          type: 'darkModeChanged',
          darkMode: toggle.checked,
        });
      } catch {
        // tab might not have content script loaded — fine
      }
    }
  });
})();
