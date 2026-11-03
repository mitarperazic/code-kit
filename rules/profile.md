# Global session startup behavior

At start of every session, in every project folder:

- Check installed plugins (design plugins etc, and all others installed) — if any provide a startup/background skill and it is not already running, start it too.

Apply this in every folder, not just specific projects.

# Working style

- Do not use plan mode or write up plans/step lists before acting. Go straight to implemen known from memory and prior analysis.
- Svaku izmjenu odmah sačuvaj na disk (Edit/Write odmah nakon odluke, ne odlaži i ne grupiši izmjene u pamćenju). Git commit je odvojena stvar: radi ga samo kad korisnik izričito traži.

# Playwright

- Playwright uvijek pokreći preko Brave pregledača, nikad preko bundlovanog Chromiuma. U sexecutablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless:false, slowMo: 250, args: ['--no-sandbox'] })` (vidljiv prozor, da korisnik gleda test uživo; headless samo na izričit zahtjev). Gotov helper: `~/.claude/local-marketplace/code-kit/scripts/brave-playwright.mjs` (`launchBrave()`, podrazumijevano
vidljiv). MCP `browser_*` alate izbjegavaj u korist skripti.
