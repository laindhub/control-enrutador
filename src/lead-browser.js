// Browser startup runs in the isolated synchronization worker, never in a sales request.
// The bundled fallback needs no download or system package installation at runtime.
export async function launchLeadBrowser({ chromium, compact, executablePath = process.env.LEAD_SYNC_CHROMIUM_PATH, platform = process.platform }) {
  const options = { headless: true, timeout: 15000, args: ['--disable-dev-shm-usage'] };
  if (executablePath) return chromium.launch({ ...options, executablePath });
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (platform !== 'linux') throw error;
    const bundled = compact || (await import('@sparticuz/chromium')).default;
    const browserPath = compact ? await compact.executablePath() : await (await import('./bundled-chromium.js')).bundledChromiumPath();
    return chromium.launch({ ...options, args: bundled.args, executablePath: browserPath });
  }
}
