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

### 2. Gedeelde componenten ✅

In `src/components`.

- [x] `AppShell`: ruimte voor eigen inhoud links in de header (kenteken en km-stand in M2, terugknop met titel in M5), een vaste band onder de header voor de voortgang, en een vaste footer
- [x] `PlateBadge`, `OptionButton` (keuzeknop met `aria-pressed`), `ProgressBar`
- [x] `Accordion` voor de blokken, `StatusTile` voor een punt, `MeasureCard` voor een meting
- [x] `BottomSheet` (dialog, max. 480px breed), `NumericKeypad`, `UndoToast`

### 3. Monteur: M1 t/m M6 ✅

Schermen in `src/screens/inspection`, de data en regels (grenzen, vorig bezoek) in `src/inspection`. Gecontroleerd in de browser op 390px breed, tegen het testproject, als eigenaar.

- [x] **M1 Start** (`/inspectie/nieuw`): kenteken, km-stand, keuze van de checklist. Na het invullen van het kenteken: de vorige km-stand en de open adviezen van het vorige bezoek. Een tegel "Nieuwe inspectie" op het startscherm.
- [x] **M2 Checklist** (`/inspectie/:id`): blokken als accordeon. Een tik wisselt een punt: open → goed → niet goed (bij niet goed opent M4). "Rest goed" met Herstel-toast, filter "Alleen open", voortgang voor punten en metingen, en "Afronden" pas als niets meer open staat. Een concept kun je weggooien.
- [x] **M3 Meten**: bottom sheet met het eigen toetsenbord, de posities als tabs (LV/RV/LA/RA), de vorige waarde en de grenzen. Daarna door naar de volgende positie. Komt een waarde voorbij een grens, dan stelt M3 advies of fout voor.
- [x] **M4 Fout**: de redenen van het type onderdeel als keuzes, plus "Anders" met vrije tekst. Wat je ermee doet: nu gerepareerd of advies. Termijn: nu, volgende beurt of paar maanden. Een herhaling van een eerder advies krijgt een melding.
- [x] **M5 Controle** (`/inspectie/:id/controle`): de tellers, de gevonden punten (tik om aan te passen, dan opent M4), de metingen en de notitie voor de balie. Daarna afronden.
- [x] **M6 Opgeslagen** (`/inspectie/:id/klaar`): samenvatting voor de balie, de punten die bij het volgende bezoek verwacht worden, en "Volgende auto".

Keuzes onderweg:

- Termijn "Nu" in M4 is een fout (klant bellen). "Nu gerepareerd" wordt gerepareerd, de twee andere termijnen worden advies.
- Een tik op een punt met een resultaat (gerepareerd, advies, fout) zet het terug op open. Aanpassen met behoud van de reden kan via Controle.
- Een meting sluiten of van positie wisselen bewaart de ingetikte waarde. Na de laatste positie opent M4 alleen als het punt nog open of goed staat.
- Het startscherm toont "Lopende inspecties" van jezelf, om een concept op een ander apparaat te hervatten. In M2 sluit "Sluiten, later verder" af zonder weg te gooien.
- De tellers in M5 heten "Gerepareerd", niet "Hersteld", om verwarring met de Herstel-knop te voorkomen.
- Alleen de rollen `admin` en `employee` komen op de routes onder `/inspectie`. Dat verbergt alleen schermen; RLS en de RPC's beslissen.

### 4. Eigenaar: beheer ✅

Hier is geen ontwerp voor. Gebouwd in dezelfde stijl: één kolom, dezelfde componenten. Schermen in `src/screens/admin`, alleen voor de rol `admin`.

- [x] Lijst met checklists (`/beheer/checklists`). Nieuw, kopiëren, verwijderen.
- [x] Editor voor één checklist (`/beheer/checklists/:id`, `nieuw` voor een nieuwe): blokken en punten toevoegen, hernoemen en verplaatsen. Per punt het type onderdeel en eventuele metingen met eenheid, richting en grenzen. Alles gaat in één keer naar `admin_save_checklist`.
- [x] Types onderdelen (`/beheer/onderdelen`): naam en redenen.

### 5. Later

- [ ] Foto bij een fout (Supabase Storage, met eigen RLS en verkleinde afbeeldingen)
- [ ] Overzicht voor de balie: afgeronde inspecties per dag, met de adviezen en fouten
- [ ] Verwachte punten laten meetellen in de planning (de planningsschermen zijn nog niet ontworpen)

## Open punten

- Grenzen accu (advies onder 12,4 V, fout onder 12,0 V) en remvloeistof (advies boven 1 %, fout boven 2 %): zelf gekozen, nog bevestigen. Remvoering en profiel: advies onder 3,0 en 4,0 mm, fout onder 1,5 en 1,6 mm.
- Eindcontrole bestaat uit handelingen (servicereset, wielmoeren, Forte brandstofadditief). Moet er een apart type **Handeling** komen, met redenen als "Niet gedaan" en "Klant wil niet"?
- Checklists voor kleine beurt en APK: maakt de eigenaar zelf in fase 4, of komen ze als startgegevens mee.
- De notitie voor de balie wordt pas opgeslagen bij afronden, niet bij elke tik.
