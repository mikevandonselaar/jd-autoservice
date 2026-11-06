# Plan: foto bij een fout

Bouwplan voor fase 5, "Foto bij een fout", uit [plan-inspectie.md](plan-inspectie.md). Opgesteld en gebouwd: 6 november 2026. Migratie `20261106160000_inspection_photos.sql` staat op het testproject, de tests slagen en de schermen zijn in de browser nagelopen (zie Tests).

## Wat het ontwerp laat zien

Het oorspronkelijke M4 had een regel met een miniatuur, de tekst "Foto is optioneel" en een knop "Foto". Uitgewerkt op hetzelfde canvas, rechts van M6, met "nog niet gebouwd" in de titel:

- **M4b** Fout met foto's: het paneel onder het punt (`FaultPanel`) met een blok "Foto's" direct onder "Reden", zodat het zonder scrollen in beeld staat. Een raster van 4 vakken van 60px hoog: de miniaturen links, de knop "Foto" altijd in het vierde vak. Bij 3 foto's verdwijnt de knop.
- **M4c** De toestanden van de fotoregel: nog geen foto, bezig met opslaan (spinner), 2 foto's, 3 foto's (vol) en opslaan mislukt (rood vak "Opnieuw" met een melding eronder).
- **M7** Foto bekijken: een donker scherm met het punt als titel, "1 van 2" met vorige en volgende, en "Verwijderen" met een bevestiging. Bij een afgeronde inspectie staat er geen "Verwijderen".
- **M5b** Controle met foto's: een miniatuur van 44px met het aantal bij een gevonden punt.
- **B1** Afgeronde inspecties (balie): de bestaande opzet van `/inspecties`, met miniaturen van 72×56 onder de fout of het advies.

## Uitgangspunten

- Een foto hoort bij **één punt** van een inspectie (`inspection_items`), niet bij de hele inspectie. Maximaal **3 foto's per punt**.
- Foto's toevoegen en weghalen kan alleen bij een **concept**, door de monteur van de inspectie of de eigenaar. Dezelfde regel als `private.assert_editable`. Na afronden zijn de foto's alleen nog te bekijken.
- Bekijken mag iedereen die inspecties mag zien (`employee` en `admin`). Het werkplaatsaccount en `anon` zien niets.
- **Verkleinen op de telefoon**, voor het uploaden. Het gratis plan van Supabase heeft geen beeldtransformaties. Langste zijde 1600 px, JPEG kwaliteit 0,8, ongeveer 200 tot 400 kB per foto. Opnieuw coderen via een canvas haalt ook de EXIF-gegevens weg, dus ook de GPS-locatie.
- Ruimte: het gratis plan heeft 1 GB opslag, genoeg voor ongeveer 3000 foto's. Opruimen komt later (zie Open punten).
- Geen nieuwe dependencies. Verkleinen kan met `createImageBitmap` en een canvas, uploaden met supabase-js.
- Geen offline wachtrij. De app is nu ook alleen online te gebruiken (elke tik gaat direct naar de server). Mislukt een upload, dan zie je een melding en kun je het opnieuw proberen.

## Opslag

- Bucket `inspection-photos`, **privé**, aangemaakt in de migratie. `file_size_limit` 1 MB, `allowed_mime_types` alleen `image/jpeg`. De bucket wijst dus elke te grote of andere upload zelf af.
- Pad: `{inspection_id}/{item_id}/{photo_id}.jpg`. De policies lezen de inspectie en het punt uit het pad.
- Tonen gaat via **signed URLs** (`createSignedUrls`, alle paden van een scherm in één aanroep, 1 uur geldig). Nooit een publieke bucket.

### Tabel `public.inspection_photos`

| kolom | type | |
|---|---|---|
| `id` | uuid pk | ook de bestandsnaam |
| `item_id` | uuid, fk `inspection_items` on delete cascade | |
| `path` | text unique | het pad in de bucket |
| `created_by` | uuid, fk `employees` | |
| `created_at` | timestamptz | |

RLS aan, alleen `select` voor `authenticated` met `private.can_inspect()`, net als de andere inspectietabellen. Schrijven gaat via RPC's.

### Policies op `storage.objects`

Alle policies alleen `to authenticated` en `bucket_id = 'inspection-photos'`.

- **select**: `private.can_inspect()`.
- **insert**: `private.can_add_photo(name)`. Deze helper controleert dat het pad het juiste formaat heeft (`private.photo_path_parts`: drie uuid's en `.jpg`, met een regex, zodat een fout pad een weigering geeft en geen cast-fout), dat het punt bij die inspectie hoort, en dat de inspectie een concept is van de aanroeper (of dat die eigenaar is). Hooguit 6 bestanden per punt: de RPC staat 3 foto's toe, de rest is ruimte voor een nieuwe poging na een fout.
- **update**: geen. Overschrijven (`upsert`) of verplaatsen kan dus niet.
- **delete**: `private.can_remove_photo(name, owner_id)`. Nooit zolang er een rij in `inspection_photos` naar het bestand wijst; zo heeft een geregistreerde foto altijd zijn bestand. Verder: de uploader, de eigenaar, de monteur van het concept, of iedereen die inspecteert als de inspectie niet meer bestaat. Dat laatste is nodig om na het weggooien van een concept de bestanden op te ruimen (zie hieronder).

### RPC's

- `add_item_photo(p_item_id uuid, p_path text) returns uuid`: controleert de rol, `assert_editable`, dat het pad bij dat punt hoort, dat het bestand in `storage.objects` staat met `owner_id` = de aanroeper, en dat het punt nog geen 3 foto's heeft. Zet dan de rij in `inspection_photos`.
- `delete_item_photo(p_photo_id uuid) returns text`: controleert de rol en `assert_editable`, haalt de rij weg en geeft het pad terug.

Beide `SECURITY DEFINER`, `search_path = ''`, `execute` ingetrokken voor `public` en `anon`. Zo voldoen ze aan de controles in `employees_rls.test.sql`.

## Volgorde: bestand en rij gelijk houden

Supabase zegt: haal bestanden nooit met SQL weg, alleen via de Storage API, anders blijft het bestand staan en tellen de bytes mee. Een cascade in de database ruimt de bestanden dus niet op. Daarom een vaste regel: **er is nooit een rij zonder bestand**. Een los bestand zonder rij kan wel, dat zie je niet en het kost alleen wat ruimte.

- **Toevoegen**: eerst het bestand uploaden, dan `add_item_photo`. Faalt de RPC, dan probeert de app het bestand weg te halen.
- **Weghalen**: eerst `delete_item_photo`, dan het bestand weghalen met het pad dat terugkomt.
- **Concept weggooien**: eerst de paden ophalen, dan `discard_inspection` (de rijen gaan mee met de cascade), dan de bestanden weghalen. Daarvoor is de regel "of bestaat niet meer" in de delete-policy.

## Schermen

- **M4 Fout** (`FaultPanel`): het blok "Foto's" uit M4b. "Foto" opent de camera (`<input type="file" accept="image/*" capture="environment">`). Na de opname: verkleinen, uploaden en direct opslaan, net als elke andere keuze in het paneel. Tijdens het uploaden een spinner op de miniatuur. Tik op een miniatuur: groot bekijken, met "Verwijderen". Bij 3 foto's verdwijnt de knop.
- **M5 Controle**: in de lijst "Gevonden" een kleine miniatuur of camera-icoon met het aantal bij een punt met foto's.
- **Overzicht voor de balie** (`/inspecties`): miniaturen bij de fouten en adviezen, tik om groot te zien. Hier hebben de foto's het meeste nut: de balie kan ze de klant laten zien.
- **M6 Opgeslagen**: geen foto's, het blijft een korte samenvatting.

Keuze: een punt dat terug op open of goed gaat, houdt zijn foto's. Ze verschijnen weer als je M4 opnieuw opent, en elders tonen we alleen foto's bij gerepareerd, advies of fout. Dat scheelt een verwijderstap bij elke tik en maakt Herstel eenvoudig.

## Code

- `supabase/migrations/20261106160000_inspection_photos.sql`: bucket, tabel, helpers, policies, RPC's.
- `src/inspection/photos.ts`: `resizePhoto` (`createImageBitmap` met `imageOrientation: 'from-image'`, canvas, `toBlob('image/jpeg', 0.8)`), `savePhoto` (upload, dan RPC), `deletePhoto` (RPC, dan bestand), `removeFiles`, en `usePhotoUrls` met een gedeelde cache van signed URLs. Een net gemaakte foto wordt uit het geheugen getoond (`rememberPhotoUrl`).
- `src/inspection/api.ts`: `fetchInspection` en `fetchCompleted` halen ook de foto's op.
- `src/screens/inspection/InspectionLayout.tsx`: `addPhoto`, `retryPhoto`, `removePhoto` en de foto's die nog worden opgeslagen of mislukt zijn (`pendingPhotos`). `discard` ruimt na het weggooien de bestanden op.
- `src/inspection/types.ts`: type `Photo`, en `photos` op `InspectionItem`.
- `src/components/PhotoThumb.tsx` (miniatuur, opslaan met spinner, mislukt met "Opnieuw") en `src/components/PhotoViewer.tsx` (groot bekijken, als dialog, "Verwijderen" alleen bij een concept).
- `FaultPanel.tsx` (`PhotoRow`), `ReviewPage.tsx`, `OverviewPage.tsx`.

## Tests

In `supabase/tests/inspection_photos_rls.test.sql`, met dezelfde opzet en rollen als `inspections_rls.test.sql`. De storage-policies zijn te testen door als gebruiker rechtstreeks rijen in `storage.objects` te zetten, binnen de transactie die toch teruggedraaid wordt.

- `employee` en `admin` zien foto's, `workshop`, `anon` en een gestopte medewerker niet (tabel en `storage.objects`).
- Uploaden lukt bij het eigen concept en voor de eigenaar bij elk concept. Het lukt niet bij een afgeronde inspectie, bij het concept van een collega, bij een punt van een andere inspectie of bij een pad met het verkeerde formaat.
- `add_item_photo` weigert een vierde foto, een bestand dat er niet is en een bestand van iemand anders.
- `delete_item_photo` werkt alleen bij een concept.
- Delete op `storage.objects`: wel na het weggooien van het concept, niet bij een afgeronde inspectie.

40 tests, alle geslaagd. In de browser op 390 px, tegen het testproject, nagelopen:

- Een foto van 3000×2000 wordt 1600×1067, JPEG, zonder EXIF.
- Na 3 foto's verdwijnt de knop. Na verwijderen in de grote weergave verdwijnen zowel de rij als het bestand, en komt de knop terug.
- De controle toont de miniatuur met het aantal. Het overzicht toont de foto's zonder "Verwijderen".
- Bij een weggegooid concept verdwijnen ook de bestanden.
- Er waren geen fouten in de console.

## Open punten

- **Camera of galerij.** Met `capture="environment"` opent direct de camera. Dat is sneller, maar een foto die je al gemaakt hebt kun je dan niet kiezen. Zo gebouwd; de eigenaar kan het nog anders willen.
- **Maximaal 3 per punt.** Zo gebouwd. Genoeg?
- **Bewaartermijn.** De 1 GB is na een paar jaar vol. Voorstel voor later: in het beheer een knop "Oude foto's opruimen" voor de eigenaar, die foto's van inspecties ouder dan bijvoorbeeld 12 maanden weghaalt via de Storage API. De eigenaar beslist de termijn.
- **Losse bestanden.** Als een stap halverwege faalt, kan er een bestand zonder rij blijven staan. Dat zijn er weinig. De opruimknop kan die ook meenemen.
