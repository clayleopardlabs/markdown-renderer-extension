browser.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    browser.storage.local.set({ darkMode: true });
    console.log('[Markdown Renderer] Installed');
  }
});
