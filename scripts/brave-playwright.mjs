// Pokreće Playwright preko Brave pregledača, podrazumijevano VIDLJIV (headed + slowMo) da korisnik gleda test uživo; headless samo uz { headless: true }.
import { chromium } from 'playwright';
export const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
export const launchBrave = (opts = {}) =>
  chromium.launch({ executablePath: BRAVE, headless: false, slowMo: 250, args: ['--no-sandbox'], ...opts });
