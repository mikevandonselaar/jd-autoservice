# Plan: inspectiemodule

Bouwplan voor de inspectie op de telefoon, naar het ontwerp M1 t/m M6 (zie [CLAUDE.md](../CLAUDE.md)) en het papieren formulier "grote beurt checklist". Bijgewerkt: 6 november 2026.

## Uitgangspunten

- Monteurs en de eigenaar werken op hun **eigen account**. De monteur van een inspectie is wie er ingelogd is, dus er is geen "Wie ben je?". Het werkplaatsaccount krijgt geen toegang tot inspecties.
- De eigenaar beheert **meerdere checklists** en **types onderdelen** (met de redenen voor een fout). De monteur kiest bij de start een checklist.
- Een inspectie **kopieert** de checklist bij de start. Als de eigenaar daarna iets aanpast, blijven oude inspecties hetzelfde.
- Elke tik wordt direct op de server opgeslagen als **concept**. Herladen of van apparaat wisselen kan dus zonder dat je iets kwijtraakt.
- Het **kenteken** vul je voorlopig zelf in. Er is geen koppeling met een agenda.
- De uitkomst van een punt is **goed, gerepareerd, advies (met termijn) of fout**, net als de kolommen op het papieren formulier. Een fout is "nu nodig, klant bellen". Een advies heeft als termijn "volgende beurt" of "paar maanden".
- Een meting heeft een advies- en een foutgrens, en een richting: lager is slechter (profiel, voering, accu) of hoger is slechter (vocht in remvloeistof).

## Fasen

### 1. Database ✅

Migratie `20261106130000_inspections.sql`, tests in `inspections_rls.test.sql`. De migratie staat op het testproject en alle tests slagen.

- Tabellen: `part_types`, `checklists`, `checklist_blocks`, `checklist_points`, `checklist_measurements`, `inspections`, `inspection_items`, `inspection_readings`
- RPC's voor de monteur: `start_inspection`, `set_item_results` (één tik, "Rest goed" en herstellen), `set_reading`, `complete_inspection`, `discard_inspection`
- RPC's voor de eigenaar: `admin_save_part_type`, `admin_delete_part_type`, `admin_save_checklist`, `admin_delete_checklist`
- Startgegevens: 14 types onderdelen en de checklist "Grote beurt" (41 punten, 9 metingen)
- Migratie `20261106150000_or_more_readings.sql`: `or_more_value` bij een meting en `or_more` bij een waarde, `set_reading(id, waarde, of_meer)`, en de banden van de startchecklists op 5 mm.

### 2. Gedeelde componenten ✅

In `src/components`.

- [x] `AppShell`: ruimte voor eigen inhoud links in de header (kenteken en km-stand in M2, terugknop met titel in M5), een vaste band onder de header voor de voortgang, en een vaste footer
- [x] `PlateBadge`, `OptionButton` (keuzeknop met `aria-pressed`), `ProgressBar`
- [x] `Accordion` voor de blokken. Een punt is een rij (`ChecklistRow` in `src/screens/inspection`), met Goed, Fout of Meten.
- [x] `BottomSheet` (dialog, max. 480px breed), `NumericKeypad`, `UndoToast`

### 3. Monteur: M1 t/m M6 ✅

Schermen in `src/screens/inspection`, de data en regels (grenzen, vorig bezoek) in `src/inspection`. Gecontroleerd in de browser op 390px breed, tegen het testproject, als eigenaar.

- [x] **M1 Start** (`/inspectie/nieuw`): kenteken, km-stand, keuze van de checklist. Na het invullen van het kenteken: de vorige km-stand en de open adviezen van het vorige bezoek. Een tegel "Nieuwe inspectie" op het startscherm.
- [x] **M2 Checklist** (`/inspectie/:id`): blokken als accordeon, per punt een rij met **Goed** en **Fout**. Een punt met een meting heeft eerst een knop **Meten**; daarna komen Goed en Fout terug. "Rest goed" (slaat punten met een meting over) met Herstel-toast, filter "Alleen open", voortgang voor punten en metingen, en "Afronden" pas als niets meer open staat. Een concept kun je weggooien.
- [x] **M3 Meten**: bottom sheet van onderen met een snelkeuze: één tik op een kant-en-klare waarde slaat op en gaat naar de volgende positie. De waarden komen uit de grenzen (groen goed, oranje advies, rood fout). "Typen" geeft het eigen toetsenbord. De posities staan bovenaan (LV/RV/LA/RA), met de vorige waarde en de grenzen.
- [x] **M4 Fout**: klapt open onder het punt (`FaultPanel`). De redenen van het type onderdeel als keuzes, plus "Anders" met vrije tekst. Wat je ermee doet: nu · klant bellen, nu gerepareerd, advies volgende beurt of advies paar maanden. Een herhaling van een eerder advies krijgt een melding. Elke keuze wordt direct opgeslagen.
- [x] **M5 Controle** (`/inspectie/:id/controle`): de tellers, de gevonden punten (tik om terug te gaan naar dat punt in de checklist, met het paneel open), de metingen en de notitie voor de balie. Daarna afronden.
- [x] **M6 Opgeslagen** (`/inspectie/:id/klaar`): samenvatting voor de balie, de punten die bij het volgende bezoek verwacht worden, en "Volgende auto".

Keuzes onderweg:

- "Nu · klant bellen" is een fout. "Nu gerepareerd" wordt gerepareerd, de twee andere keuzes worden advies met een termijn.
- Goed of Fout op een punt zonder meting is één tik. Fout klapt het paneel open; zolang je geen uitkomst kiest blijft het punt open en wordt de reden alleen in het paneel bewaard.
- **Het systeem doet een voorstel** zodra alle posities van een punt een waarde hebben: binnen de grenzen wordt het punt Goed, voorbij de foutgrens "Nu · klant bellen" (paneel open), voorbij de adviesgrens blijft het punt open met "Advies · kies de termijn". De termijn kiest de monteur altijd zelf. Het label "voorstel" blijft staan tot de monteur iets aanpast, en verdwijnt bij herladen.
- Een punt met een meting kan alleen via Meten (eerst meten, dan Goed of Fout). De waarden staan onder de naam; een tik erop meet opnieuw. Een nieuwe meting zet het resultaat alleen opnieuw als het punt nog open staat of nog een voorstel is; een keuze van de monteur blijft staan.
- Een meting sluiten of van positie wisselen bewaart wat al is ingetikt (elke tik wordt direct opgeslagen). Sluit je het paneel nadat alle posities een waarde hebben, dan geldt het voorstel.
- **"5 of meer" voor banden.** Een meting kan een snelwaarde "of meer" hebben (`or_more_value`, instelbaar in het beheer, bij de banden 5 mm). In het meetpaneel staat die als brede knop, en "Alle banden 5 mm of meer" vult in één tik alle lege posities (na één band heet die "Overige banden"). De waarde wordt opgeslagen als 5 met de vlag `or_more`; in de schermen staat "≥ 5". Alleen voor metingen waar lager slechter is.
- Het startscherm toont "Lopende inspecties" van jezelf, om een concept op een ander apparaat te hervatten. In M2 sluit "Sluiten, later verder" af zonder weg te gooien.
- De tellers in M5 heten "Gerepareerd", niet "Hersteld", om verwarring met de Herstel-knop te voorkomen.
- Alleen de rollen `admin` en `employee` komen op de routes onder `/inspectie`. Dat verbergt alleen schermen; RLS en de RPC's beslissen.

### 4. Eigenaar: beheer ✅

Hier is geen ontwerp voor. Gebouwd in dezelfde stijl: één kolom, dezelfde componenten. Schermen in `src/screens/admin`, alleen voor de rol `admin`.

- [x] Lijst met checklists (`/beheer/checklists`). Nieuw, kopiëren, verwijderen.
- [x] Editor voor één checklist (`/beheer/checklists/:id`, `nieuw` voor een nieuwe): blokken en punten toevoegen, hernoemen en verplaatsen. Per punt het type onderdeel en eventuele metingen met eenheid, richting, grenzen en de snelkeuze "of meer". Alles gaat in één keer naar `admin_save_checklist`.
- [x] Types onderdelen (`/beheer/onderdelen`): naam en redenen.

### 5. Later

- [x] Foto bij een fout (Supabase Storage, met eigen RLS en verkleinde afbeeldingen). Zie [plan-fotos.md](plan-fotos.md).
- [x] Overzicht voor de balie (`/inspecties`): afgeronde inspecties per dag, met de fouten en adviezen, de notitie, en een filter op "alleen met fout of advies". De laatste 7 dagen, daarna per 7 dagen meer. Te bereiken via "Afgeronde inspecties" op het startscherm, voor `employee` en `admin`.
- [ ] Verwachte punten laten meetellen in de planning (de planningsschermen zijn nog niet ontworpen)

## Open punten

- Eindcontrole bestaat uit handelingen (servicereset, wielmoeren, Forte brandstofadditief). Moet er een apart type **Handeling** komen, met redenen als "Niet gedaan" en "Klant wil niet"?
- De checklists "Kleine beurt" (23 punten, 7 metingen) en "APK" (31 punten, 7 metingen) staan als startgegevens in `20261106140000_more_checklists.sql`. De punten zijn een eerste opzet uit algemene kennis, niet de officiële RDW-lijst. De eigenaar loopt ze na in het beheer.
- De notitie voor de balie wordt pas opgeslagen bij afronden, niet bij elke tik.
- Het label "voorstel" wordt niet bewaard. Willen we in de controle en het overzicht zien welke uitkomsten uit een meting kwamen, dan is daar een kolom voor nodig.
- Een punt dat al een uitkomst heeft en opnieuw gemeten wordt, krijgt geen nieuw voorstel (zie boven). Is dat in de praktijk te stil, dan kan er een melding bij.

Besloten: de grenzen voor accu (advies onder 12,4 V, fout onder 12,0 V), remvloeistof (advies boven 1 %, fout boven 2 %), remvoering (advies onder 3,0 mm, fout onder 1,5 mm) en profiel (advies onder 4,0 mm, fout onder 1,6 mm) zijn voorlopig goed.
