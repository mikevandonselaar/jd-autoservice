-- Starting configuration, like "Grote beurt": the checklists "Kleine beurt" and "APK".
-- Configuration, not test data, so it belongs in production too. The points are a first draft
-- from general knowledge, not the official RDW list. The owner changes all of it in the app.
-- A checklist with the same name is never touched, so running this after the owner made one
-- with that name changes nothing. Part types and limits are those of "Grote beurt".

do $$
declare
  v_id uuid;
begin
  insert into public.checklists (name) values ('Kleine beurt')
  on conflict (name) do nothing
  returning id into v_id;

  if v_id is not null then
    perform private.write_checklist_blocks(v_id, $json$
[
  {"name": "In en om de auto", "points": [
    {"label": "Testrit vooraf", "part_type": "Algemeen"},
    {"label": "Foutcodes uitlezen", "part_type": "Elektrisch en verlichting"},
    {"label": "Verlichting buiten", "part_type": "Elektrisch en verlichting"},
    {"label": "Ruitenwissers en sproeiers", "part_type": "Ruiten en wissers"},
    {"label": "Claxon", "part_type": "Elektrisch en verlichting"}
  ]},
  {"name": "Onder de motorkap", "points": [
    {"label": "Motorolie en oliefilter vervangen", "part_type": "Algemeen"},
    {"label": "Luchtfilter", "part_type": "Algemeen"},
    {"label": "Interieurfilter", "part_type": "Algemeen"},
    {"label": "Accu", "part_type": "Accu", "measurements": [
      {"label": "Spanning", "unit": "V", "direction": "lower_is_worse", "advice_limit": 12.4, "fault_limit": 12.0}
    ]},
    {"label": "Riemen", "part_type": "Riemen"},
    {"label": "Vloeistofniveaus", "part_type": "Vloeistoffen"},
    {"label": "Slangen", "part_type": "Leidingen en slangen"},
    {"label": "Olielekkage bovenkant motor", "part_type": "Lekkage"}
  ]},
  {"name": "Onder de auto", "points": [
    {"label": "Uitlaat en ophanging", "part_type": "Uitlaat"},
    {"label": "Aandrijfas- en stuurhoezen", "part_type": "Rubbers en hoezen"},
    {"label": "Olielekkage motor en versnellingsbak", "part_type": "Lekkage"}
  ]},
  {"name": "Wielen en remmen", "points": [
    {"label": "Remmen voor", "part_type": "Remmen", "measurements": [
      {"label": "Voering", "unit": "mm", "advice_limit": 3.0, "fault_limit": 1.5}
    ]},
    {"label": "Remmen achter", "part_type": "Remmen", "measurements": [
      {"label": "Voering", "unit": "mm", "advice_limit": 3.0, "fault_limit": 1.5}
    ]},
    {"label": "Banden", "part_type": "Banden", "measurements": [
      {"label": "LV", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "RV", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "LA", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "RA", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6}
    ]},
    {"label": "Bandenspanning", "part_type": "Banden"}
  ]},
  {"name": "Eindcontrole", "points": [
    {"label": "Servicereset", "part_type": "Algemeen"},
    {"label": "Onderhoudshistorie bijgewerkt", "part_type": "Algemeen"},
    {"label": "Proefrit na de beurt", "part_type": "Algemeen"}
  ]}
]
$json$::jsonb);
  end if;

  v_id := null;
  insert into public.checklists (name) values ('APK')
  on conflict (name) do nothing
  returning id into v_id;

  if v_id is not null then
    perform private.write_checklist_blocks(v_id, $json$
[
  {"name": "Verlichting en elektrisch", "points": [
    {"label": "Dimlicht en grootlicht", "part_type": "Elektrisch en verlichting"},
    {"label": "Achterlichten en remlichten", "part_type": "Elektrisch en verlichting"},
    {"label": "Richtingaanwijzers en alarmlichten", "part_type": "Elektrisch en verlichting"},
    {"label": "Mistachterlicht en kentekenverlichting", "part_type": "Elektrisch en verlichting"},
    {"label": "Claxon", "part_type": "Elektrisch en verlichting"},
    {"label": "Waarschuwingslampen dashboard", "part_type": "Elektrisch en verlichting"}
  ]},
  {"name": "Zicht", "points": [
    {"label": "Voorruit en overige ruiten", "part_type": "Ruiten en wissers"},
    {"label": "Ruitenwissers en sproeiers", "part_type": "Ruiten en wissers"},
    {"label": "Spiegels", "part_type": "Ruiten en wissers"}
  ]},
  {"name": "Besturing en ophanging", "points": [
    {"label": "Stuurinrichting en speling", "part_type": "Ophanging en besturing"},
    {"label": "Stuurkogels en spoorstangeinden", "part_type": "Ophanging en besturing"},
    {"label": "Wiellagers", "part_type": "Ophanging en besturing"},
    {"label": "Draagarmen, fusees en bussen", "part_type": "Ophanging en besturing"},
    {"label": "Schokdempers en veren", "part_type": "Ophanging en besturing"},
    {"label": "Aandrijfas- en stuurhoezen", "part_type": "Rubbers en hoezen"}
  ]},
  {"name": "Remmen", "points": [
    {"label": "Remmentest", "part_type": "Remmen"},
    {"label": "Remmen voor", "part_type": "Remmen", "measurements": [
      {"label": "Voering", "unit": "mm", "advice_limit": 3.0, "fault_limit": 1.5}
    ]},
    {"label": "Remmen achter", "part_type": "Remmen", "measurements": [
      {"label": "Voering", "unit": "mm", "advice_limit": 3.0, "fault_limit": 1.5}
    ]},
    {"label": "Remleidingen en remslangen", "part_type": "Leidingen en slangen"},
    {"label": "Handrem", "part_type": "Remmen"},
    {"label": "Remvloeistof", "part_type": "Vloeistoffen", "measurements": [
      {"label": "Vocht", "unit": "%", "direction": "higher_is_worse", "advice_limit": 1, "fault_limit": 2}
    ]}
  ]},
  {"name": "Banden en wielen", "points": [
    {"label": "Banden", "part_type": "Banden", "measurements": [
      {"label": "LV", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "RV", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "LA", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6},
      {"label": "RA", "unit": "mm", "advice_limit": 4.0, "fault_limit": 1.6}
    ]},
    {"label": "Velgen en wielmoeren", "part_type": "Banden"}
  ]},
  {"name": "Uitlaat en milieu", "points": [
    {"label": "Uitlaat en ophanging", "part_type": "Uitlaat"},
    {"label": "Uitlaatgassen", "part_type": "Uitlaat"},
    {"label": "Olie- en brandstoflekkage", "part_type": "Lekkage"},
    {"label": "Brandstofleidingen", "part_type": "Leidingen en slangen"}
  ]},
  {"name": "Carrosserie en veiligheid", "points": [
    {"label": "Carrosserie en corrosie", "part_type": "Carrosserie"},
    {"label": "Kentekenplaten en chassisnummer", "part_type": "Algemeen"},
    {"label": "Gordels", "part_type": "Algemeen"},
    {"label": "Stoelen en bevestiging", "part_type": "Algemeen"}
  ]}
]
$json$::jsonb);
  end if;
end;
$$;
