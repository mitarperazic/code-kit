---
name: config
description: Podešavanje code-kit plugina — bira se šta je uključeno po defaultu: samo panel (struktura i editor), samo statistika (statusna traka), oboje ili ništa. Koristi kad korisnik pokrene /code-kit:config.
---

# code-kit podešavanje

Izbor se čuva u `~/.claude/code-kit.json` kao `{"panel": true, "stats": true}`. Ako fajl ne postoji, uključeno je oboje. Plugin čita fajl svake sekunde, pa promjena važi odmah, bez restarta.

1. Pročitaj `~/.claude/code-kit.json` ako postoji, da znaš trenutno stanje.
2. Pitaj korisnika preko AskUserQuestion (jedno pitanje, jedan izbor, trenutno stanje navedi u tekstu pitanja). Opcije:
   - **Oboje (Recommended)** — panel i statistika: `{"panel": true, "stats": true}`
   - **Samo panel** — struktura projekta i editor, bez statusne trake: `{"panel": true, "stats": false}`
   - **Samo statistika** — statusna traka (model, projekat, kontekst, potrošnja, RAM), bez panela: `{"panel": false, "stats": true}`
   - **Ništa** — ni panel ni statistika: `{"panel": false, "stats": false}`
3. Upiši izabranu vrijednost u `~/.claude/code-kit.json` (Write, samo taj JSON).
4. Odgovori jednom rečenicom šta je uključeno. Spomeni da se panel kad god treba može vratiti komandom `/code-kit`.

Ne mijenjaj ništa drugo.
