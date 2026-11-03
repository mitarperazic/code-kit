# Design rules

Važe za SVAKI UI/frontend rad u svim projektima. Uređuj ovaj fajl:
~/.claude/local-marketplace/design-rules/rules.md

## Minimalizam
- Dizajn je uvijek minimalistički: puno praznog prostora, malo boja, bez suvišnih ukrasa,
- Svaki element mora imati svrhu; ako nema, izbaci ga.

## Globalni dizajn (jedan izvor istine)
- Ceo dizajn se definiše JEDNOM u glavnim fajlovima dizajna (design tokens): boje, tipograene, trajanja animacija, breakpointi. Npr. CSS varijable u `:root` / theme fajl / tailwindconfig.
- Prije bilo kakvog UI rada pronađi te glavne fajlove. Ako ne postoje, prvo ih napravi, pate.
- Sve ostale stranice i komponente SAMO koriste te tokene. Zabranjene su hardkodirane boje, fontovi, razmaci i veličine van globalnih fajlova.
- Promjena izgleda = izmjena globalnih fajlova, ne pojedinačnih komponenti.

## Mobilni uređaji: bottom navbar
- Na mobilnom se uvijek pravi navigacija na dnu ekrana (bottom navbar).
- Navbar ima "pill" (zaobljeni indikator aktivne stavke) koji se animirano pomjera/prelivaeni ekrana (ne skače, nego klizi).
- Animacija: kratka (~200-300ms), ease-out, trajanje i easing uzeti iz globalnih tokena. Poštuj `prefers-reduced-motion`.
- Navbar poštuje safe-area (`env(safe-area-inset-bottom)`), ima malo stavki (3-5), ciljevi
- Navbar je plutajući i providan oko trake: nikakve podloge/sive pozadine iza ili oko nje, sadržaj ekrana ostaje vidljiv oko i ispod trake (traka je apsolutno pozicionirana preko sadržaja, a liste/skrolovi ostavljaju padding-bottom).
- Pill se pomjera do cilja i ZASTAJE tačno na toj poziciji: koristi timing + ease-out iz globalnih tokena, nikad spring/bounce/overshoot (bez prelaska preko pozicije i vraćanja). Isto važi za animaciju ikonice.
- Na desktopu se navbar zamjenjuje uobičajenom navigacijom (npr. gore ili sa strane).

## Modali i popupi
- Overlay uvijek pokriva 100% visine ekrana (100vh/dvh), bez margin-top razmaka.
- Svaki modal ima X za zatvaranje u gornjem desnom uglu (dovoljno velik) i dovoljan padding.
- Animacija pojavljivanja je pretežno fade (kratak, iz globalnih tokena); slide samo gdje ).
- Dropdown i datepicker se otvaraju na stranu gdje ima mjesta, nikad van ekrana.
- U tamnoj temi modali i dropdowni imaju neprozirnu pozadinu (siva nijansa, ne čista crna)
- Dropdowni i selecti (u popupima, tabelama, bilo gdje) uvijek imaju najveći z-index (token npr. `--z-dropdown`, iznad modala i overlaya) i prikazuju se preko svega; renderuju se u portalu/na body nivou da ih
`overflow` roditelja ne siječe. Ako u postojećem kodu to nije tako, automatski to ispravi.

## Mobilni
- Mobile-first; mobilna aplikacija ima isti stil i boje kao web.
- Kad se otvori tastatura, forma se animirano podiže; kad se tastatura sakrije, sve se vrano centrirano.
- Liste imaju padding-bottom da ih bottom navbar ne prekriva.

## Raspored i redizajn
- Raspored elemenata na stranici mora biti profesionalan i kvalitetno raspoređen: jasna hitentni razmaci, logično grupisanje srodnih elemenata.
- Ako je stranica pretrpana, a korisnik traži redizajn: uprosti stranicu (izbaci ili spoji suvišno, sakrij sekundarno) ili popravi raspored elemenata, pa tek onda dotjeruj detalje.

## Stil projekta (podrazumijevano)
- Sve što korisnik traži da se uradi MORA biti u skladu sa postojećim stilom projekta (tokafija, razmaci), uvijek i podrazumijevano, bez da to korisnik posebno naglašava.
- Prije rada pogledaj postojeći stil projekta i koristi njega; ne uvodi novi vizuelni jezik.

## Stranice i stanja
- Prazna stanja (liste, tabele, widgeti) su centrirana horizontalno i vertikalno.
- Sadržaj stranice je horizontalno centriran. Tabovi se šire preko cijele širine reda.
- Loader za dugotrajne radnje (slanje, kreiranje, otvaranje PDF-a) i animacija pri učitavag bijelog ekrana.
- Nakon svake izmjene dizajna pokreni aplikaciju i provjeri izgled prije nego kažeš da je gotovo.

## Opšta pravila
- Bez ikonica ispred teksta u labelama i dugmadima, osim kad su neophodne.
- Nikad default browser kontrole: select, datepicker, checkbox i switch su custom komponente u stilu aplikacije. Krug switcha ne smije izlaziti van okvira.
- Sve klikabilno ima `cursor: pointer` i hover efekat.
- Tekst i ikonice u dugmadima su centrirani horizontalno i vertikalno.
- Dugme dobija boju po svrsi: primarna zelena za potvrdu, plava za edit, crvena za brisanjkašnjenje. Isti stil dugmadi u svim kolonama akcije, bez izuzetaka.
- Brisanje i deaktivacija su vizuelno i funkcionalno različite akcije.
- Ikonice i fontovi nisu sitni; ikonica za zatvaranje (X) mora biti dovoljno velika.
- Boje: bez bež tonova. Sivo i bijelo uz jednu primarnu boju. Tamna tema koristi sive nijanse, ne čistu crnu.
- Header: sadržaj vertikalno centriran.
- Mejlovi, PDF-ovi i fakture se stilizuju u stilu aplikacije, nikad goli tekst; fakture izgledaju kao prave fakture.
- Prozori i kartice imaju zaobljene ivice kad nisu fullscreen.

## Učitavanje: skeleton umjesto loadera
- Nikad spinner/ActivityIndicator/goli loader za učitavanje ekrana ili liste. Koristi skeleton koji oponaša stvarni raspored sadržaja (kartice, redovi, polja) sa suptilnim shimmer efektom iz globalnih tokena (boje, trajanje).
- Skeleton komponente su jedan izvor istine (zajednička biblioteka primitiva + gotovi preseti za listu, karticu, formu, detalj). Poštuj reduce motion (bez animacije).
- Mali spinner dozvoljen samo unutar dugmeta tokom slanja (submit), ne za učitavanje sadržaja.

## Poravnanje i konzistentnost
- Iznosi i brojevi uvijek koriste tabelarne cifre (`fontVariant: ['tabular-nums']`, token `numeric`) i poravnati su udesno na istoj liniji.
- Statusi se prikazuju jednom zajedničkom `Badge` komponentom (ista visina, font, zaobljenje) – nikad lokalno stilizovan bedž po ekranu.
- Razmaci unutar reda liste izvode se iz tokena (veličina ikonice + razmak), nikad ručno upisanim pikselima poput `marginLeft: 52`.
- Tekst u dugmadima je centriran i horizontalno i vertikalno (na Androidu `includeFontPadding: false`).
- Forme: tastatura vodi korisnika kroz polja ("Dalje" prelazi na sljedeće tekstualno polje po stvarnom redoslijedu na ekranu, posljednje zatvara tastaturu), polje se skroluje iznad tastature, a numeričke tastature na iOS-u imaju traku sa "Dalje"/"Gotovo".

## Prelazi i gestovi
- Prelazi između ekrana su spori i meki (oko 400-460 ms, ease-out), nikad trenutni i nikad trzavi. Trajanja i tipovi prelaza definišu se na jednom mjestu (`screen-transitions`), ne po ekranu: običan ekran se gura s desne strane, ekran preko cijelog ekrana ulazi odozdo, tabovi se blago pretapaju.
- Povlačenje prstom s ruba/ekrana vraća na prethodni ekran (iOS), a redovi lista koji imaju brze akcije otkrivaju ih povlačenjem ulijevo kroz zajedničku `SwipeableRow` komponentu (dugmad klize jedno za drugim, red se sam vraća poslije pritiska, destruktivna akcija traži potvrdu).

## Zaglavlja, skaliranje i poruke
- Svi ekrani koriste jednu zajedničku `ScreenHeader` komponentu (dugme nazad, naslov, podnaslov, desni dio); zaglavlje se nikad ne piše ručno po ekranu.
- Postoji samo jedan sistem skaliranja (`ms`, referentna širina 390, ograničen faktor); fontovi i veličine koje prate ekran idu kroz njega, nikad kroz zasebne formule po fajlu.
- Poruke uspjeha i greške idu uvijek kroz isti toast (`showSuccess` / `showError`); alert prozor je samo za potvrde radnji (npr. brisanje). Toast se pojavljuje bez odskakanja.
- Prelaz sa skeletona na sadržaj je pretapanje (`ContentTransition`: sadržaj se pojavljuje dok skeleton blijedi), nikad trenutna zamjena ni prazan bljesak.
- Prazna stanja idu kroz jednu `EmptyState` komponentu (ilustracija, naslov, opis i dugme akcije za kreiranje); ručno slaganje praznih stanja po ekranu nije dozvoljeno.
- Poslije uspješnog snimanja ili brisanja lista se ažurira odmah (optimistično), a rezultat sa servera ga naknadno usklađuje; ako server odbije, vraća se prethodno stanje.
- Forme se pišu isključivo nad react-hook-form kroz zajednički `forms` sloj (`withForm`, `FormField`, `useFormApi`); nikakav Redux za stanje forme niti pristup formi po imenu iz sagi/akcija – forma se prosljeđuje kroz kontekst ili funkcijama u parametrima.
- Iznosi se kucaju sa grupisanjem hiljada (`groupThousands`), a u formi ostaje običan broj.

## Tipografija, povratna informacija i detalji
- Jedan font u cijeloj aplikaciji (Inter). Tekst se uvijek uvozi iz zajedničke `typography` komponente, nikad direktno iz `react-native`, da debljina bira ispravan fajl fonta.
- Brisanje se radi sa "Poništi" (odloženo na ~5 s), a ne sa prozorom potvrde; potvrda ostaje samo za radnje koje se ne mogu poništiti.
- Forma sa nesnimljenim izmjenama traži potvrdu pri izlasku (dugme nazad, tipka nazad na Androidu) i onemogućava povlačenje nazad dok ima izmjena.
- Lica (klijenti) se prikazuju avatarom sa inicijalima, ne generičkom ikonom.
- Datumi se prikazuju kao DD.MM.GGGG (jedna konstanta), iznosi sa razdjelnicima iz podešavanja valute kompanije.
- Brojke na kontrolnoj tabli se "broje" do vrijednosti, stupci grafa rastu od dna, redovi lista ulaze redom (samo prvi put), zaglavlje dobija liniju tek kad se sadržaj skrola ispod njega.
- Duži pritisak na red otvara brze akcije (iste kao povlačenje, plus "Otvori"). Ekran bez veze sam provjerava vezu i zatvara se kad se vrati.

## Ikonice
- Sve ikonice idu kroz jednu `Icon` komponentu (`name`, `size`, `color`, `solid` = aktivno stanje, deblja linija); nikad direktno FontAwesome ni drugi set u ekranima.
- Stil je linijski i tanak (stroke 1.75, zaobljeni krajevi, 24x24 mreža); novu ikonicu dodaj u `components/icon/icon-set.js` u istom stilu, ne miješaj punu i linijsku.
- Ime koje set nema pada na rezervni set (ikonica nikad ne nestane), ali novi ekrani koriste samo ikonice iz seta.

