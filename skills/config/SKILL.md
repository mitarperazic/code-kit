---
name: config
description: Podešavanje code-kit plugina na ovom računaru — šta je uključeno (panel, statistika), da li se primjenjuju lična pravila rada i dizajna, i da li se prikazuju ikone fajlova. Koristi kad korisnik pokrene /code-kit:config.
---

# code-kit podešavanje

Izbor se čuva u `~/.claude/code-kit.json`, na ovom računaru:

```json
{"panel": true, "stats": true, "rules": false, "icons": false}
```

Šta koji ključ znači i šta je podrazumijevano kad fajla nema ili ključa nema:
- `panel` — panel sa strukturom projekta i editorom. Podrazumijevano uključen.
- `stats` — statusna traka (model, projekat, kontekst, potrošnja, RAM). Podrazumijevano uključena.
- `rules` — lična pravila rada i dizajna plugina (`rules/profile.md`, `rules/design-rules.md`, skillovi `design-rules` i `self-improve`). Podrazumijevano **isključena**, primjenjuju se samo ako korisnik to izabere.
- `icons` — ikone tipa fajla u strukturi, traže Nerd Font u terminalu. Podrazumijevano **isključene** (umjesto njih je tačka).

Koraci:

1. Pročitaj `~/.claude/code-kit.json` ako postoji, da znaš trenutno stanje (ključ koji nedostaje računaj po podrazumijevanoj vrijednosti).
2. Postavi sva tri pitanja odjednom jednim pozivom AskUserQuestion, svako sa jednim izborom, a trenutno stanje navedi u tekstu pitanja:
   - **Šta da bude uključeno?** Opcije: **Oboje (Recommended)** (panel i statistika), **Samo panel**, **Samo statistika**, **Ništa**.
   - **Da li da se na ovom računaru primjenjuju pravila rada i dizajna iz plugina?** Opcije: **Ne (Recommended)** i **Da**. Objasni kratko u opisu: pravila se ubacuju u svaku sesiju (bez plan moda, Playwright preko Brave-a, dizajnerska pravila…) i važe od sljedeće sesije.
   - **Da li da se prikazuju ikone fajlova u strukturi?** Opcije: **Ne (Recommended)** i **Da**. Objasni u opisu: ikone traže Nerd Font u terminalu, bez njega se vide kao kockice.
3. Upiši rezultat u `~/.claude/code-kit.json` (Write, samo taj JSON sa sva četiri ključa).
4. Ako je `rules` bilo uključeno, a korisnik je izabrao **Ne**: pravila prestaju da važe odmah. Od ovog trenutka ignoriši `<profile-rules>` i `<design-rules>` koja su već ubačena u ovu sesiju i ne primjenjuj ih, a od sljedeće sesije se više neće ni ubacivati. Ne briši ništa sa diska: plugin ne kopira pravila na računar, a memorija koju je `self-improve` ranije upisao ostaje.
5. Odgovori jednom do dvije rečenice šta je uključeno. Spomeni da pravila počinju da važe od sljedeće sesije, a da se panel kad god treba može vratiti komandom `/code-kit`.

Ne mijenjaj ništa drugo.
