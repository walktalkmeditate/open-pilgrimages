# Gudbrandsdalsleden — drafted text review

All 24 stages of `st-olav-ways-gudbrandsdalsleden` carry drafted theme, narrative and reflection,
and every stage is open below. Each entry records what its text was written from, so it can be
judged against its evidence rather than on its own.

This is the checklist CLAUDE.md requires of a PR whose content work is one section, so its lines
take the bare `stage N` form. `npm run validate` reads it beside `stages.json`, and
`npm run check-drafted-diff` reads it again against the base ref.

**The text was drafted by the agent that built this section, and nothing here is ticked.** The
author of the text cannot also be its reviewer. A reviewer who did not write it ticks a line, then
removes that stage's `"drafted": true` in the same change.

## What every stage was written from

- **Places**: the OpenStreetMap features on that stage's own stretch of `route.main.geojson` —
  churches (`amenity=place_of_worship`) within 300 m of the line, settlements (`place=city|town|village`)
  within 500 m, and named lodging within 500 m — each named with its OSM id below. Kilometre marks are
  positions along the stage, from its start anchor.
- **Figures**: distance, ascent, descent, and high and low points are not typed into the prose. They
  are filled from the stage's own `stages.json` fields when the text is written, so they cannot
  disagree with the data. The elevation figures are EU-DEM 25 m; see `overview.elevationRange.elevationNote`.
- **Words that rest on a name**: "stave church" (from *stavkyrkje* / *stavkirke*), "old church" (*gamle
  kirke*), "sister churches" (*Søsterkirkene*) and "the pilgrims' loft" (*Pilegrimsloftet*) translate the
  feature's own name and claim nothing more. "Old parish churches" in stage 2 rests on `heritage=yes`.
- **Not used**: no guidebook, no official stage list and no text from pilegrimsleden.no, whose site states
  no licence. Nothing describes terrain, surfaces, views or weather, because no source here does.

## stage 0 — Mariakirken to Sæteren gård

**Theme:** Out through the old town  
**Narrative:** The way begins among the ruins of St Mary's Church in Oslo's medieval town and leaves the city on foot. It passes close to Gamle Aker kirke about four and a half kilometres in, then a run of city churches and suburbs, and passes Haslum some twenty kilometres out. The day ends at Sæteren gård, 23.4 km from the start, having climbed 300 m and come down 120 m, with its high point at 210 m.  
**Reflection:** You leave from the ruins of a church to walk to a cathedral. What are you carrying out of the city with you?

Written from: Mariakirken ruins (way/257875433, wikidata Q1133099) as the start; Gamle Aker kirke (way/32808508, heritage) 51 m from the line at km 4.5; Haslum (village) at km 20.3; Sæteren gård (node/530783833); distance, ascent, descent and high point from this stage's stages.json fields.

- [ ] stage 0

## stage 1 — Sæteren gård to Sundvollen

**Theme:** A day without villages  
**Narrative:** From Sæteren gård to Sundvollen OpenStreetMap records no village and no church within reach of the line: 24.9 km between one bed and the next. The day rises to 500 m and drops to 70 m before Sundvollen, 460 m of climbing and 570 m of descent in all.  
**Reflection:** With nothing to arrive at until evening, where does your attention go?

Written from: The fact sheet's empty church and settlement lists for this stage (nothing within 300 m and 500 m of the line respectively); Sundvolden hotell (way/697935467) at the end; figures from stages.json.

- [ ] stage 1

## stage 2 — Sundvollen to Klekken

**Theme:** Two churches on the way  
**Narrative:** Out of Sundvollen the way passes Vik early on, then two old parish churches set close to the line: Hole kirke a little under thirteen kilometres in, and Norderhov kirke at about twenty. It ends at Klekken after 24.9 km, with 310 m of ascent and 180 m of descent.  
**Reflection:** Two churches in an afternoon. What would you stop to ask in each?

Written from: Vik (village) at km 2.9; Hole kirke (way/558315311, heritage) 26 m from the line at km 12.7; Norderhov kirke (way/558315235, heritage) 38 m from the line at km 19.7; Klekken (node/9665422415) for Klækken Hotell; figures from stages.json. 'Old parish churches' rests on both carrying heritage=yes, and on nothing more.

- [ ] stage 2

## stage 3 — Klekken to Granavollen

**Theme:** To the sister churches  
**Narrative:** This is a long day, 31.3 km, because OpenStreetMap shows no bed between 20 and 30 km out of Klekken. It passes Haug kirke in its first kilometre and Jevnaker kirke at about thirteen and a half, and ends at Granavollen, where two churches, Mariakirken and Nikolaikirken, stand side by side as Søsterkirkene, the sister churches. 600 m up, 450 m down, the high point 410 m.  
**Reflection:** Two churches built side by side. Who walks beside you, even when you walk alone?

Written from: Haug kirke (way/558315240, heritage) at km 0.7; Jevnaker kirke (way/312111400, heritage) at km 13.6; Mariakirken (way/475158596) and Nikolaikirken (way/475158597), both heritage, and the Søsterkirkene node/8674241919 and relation/124134, at km 31.2–31.3; 'side by side' from both churches lying within 60 m of the same point on the line; the fallback arm of the day rule, recorded in this stage's end-anchor note; figures from stages.json.

- [ ] stage 3

## stage 4 — Granavollen to Alstad

**Theme:** The longest day  
**Narrative:** 49.6 km, the longest stage of the route, and long only because OpenStreetMap maps no bed between 20 and 30 km out of Granavollen. It passes Tingelstad gamle kirke within the first three and a half kilometres, then Brandbu, and much later Kolbu kirke and Lena, before Alstad. It climbs 700 m and descends 820 m. The stage marks where the map shows a bed, not a recommended day.  
**Reflection:** When a day is longer than you would choose, what do you let go of to finish it?

Written from: Tingelstad gamle kirke (way/557779909, heritage) at km 3.4; Brandbu (village) at km 7.5; Kolbu kirke (way/928048717, heritage) at km 40.5; Lena (village) at km 48.6; Alstad (node/9702200235) for Hoff Gjestgiveri (way/928625231); longest stage by distanceKm; figures from stages.json.

- [ ] stage 4

## stage 5 — Alstad to Gjøvik

**Theme:** Into Gjøvik  
**Narrative:** The day starts beside Hoff kirke, passes Kapp kirke and the village of Kapp, and ends in the town of Gjøvik by Gjøvik kirke: 24.4 km, 170 m of ascent, 250 m of descent.  
**Reflection:** After the longest day, an ordinary one. What does ordinary feel like now?

Written from: Hoff kirke (way/928625158, heritage) at km 1.2; Kapp kirke (way/928778405) at km 5.3; Kapp (village) at km 7.9; Gjøvik (town, node/31264090) and Gjøvik kirke (way/102350909, heritage) at the end; the previous stage's distance; figures from stages.json.

- [ ] stage 5

## stage 6 — Gjøvik to Biri

**Theme:** Between towns  
**Narrative:** Out of Gjøvik the line passes Redalen about halfway and reaches Biri after 22.7 km. It climbs 520 m and descends 520 m, between a low of 130 m and a high of 360 m.  
**Reflection:** Halfway between two places, which one are you thinking about?

Written from: Redalen (village) at km 13.7; Biri (village, node/317608349) at the end; figures from stages.json.

- [ ] stage 6

## stage 7 — Biri to Vingnes

**Theme:** Towards Lillehammer  
**Narrative:** The day leaves Biri past Biri kirke, passes two campsites, then Vingrom and Vingrom kirke, and ends at Vingnes, across from Lillehammer: 25.4 km, 250 m up and 260 m down.  
**Reflection:** The next town is in sight before the day is over. How do you walk the last stretch?

Written from: Biri kirke (way/932148418, heritage) at km 1.1; Flutua Camping and Furuodden Camping at km 9.8 and 13.7; Vingrom (village) at km 17.7; Vingrom kirke (way/557417253) at km 21.4; Vingnes (suburb, node/7157414792) at the end; 'across from Lillehammer' from Lillehammer town lying 1.8 km into the next stage; figures from stages.json.

- [ ] stage 7

## stage 8 — Vingnes to Kruke

**Theme:** Through Lillehammer  
**Narrative:** Within two kilometres the way is in Lillehammer, past Lillehammer kirke, and then it goes on north through Fåberg. The day ends at Kruke, by Skåden Gard, 25.2 km on, after 660 m of climbing and 290 m of descent.  
**Reflection:** A town full of beds, and you walk on through it. What makes you keep going?

Written from: Lillehammer kirke (way/125454938, heritage) at km 1.4; Lillehammer (town) at km 1.8; Fåberg (village) at km 9.6; Kruke (node/9659906306) for Skåden Gard (node/1821221821); figures from stages.json.

- [ ] stage 8

## stage 9 — Kruke to Sletring

**Theme:** A loft for pilgrims  
**Narrative:** No church and no village lies near the line on this stage, but about twelve kilometres in it passes Pilegrimsloftet Borkerud, a hostel whose name means the pilgrims' loft. It ends at Sletring after 24.9 km, with 660 m of ascent and 860 m of descent.  
**Reflection:** Someone made a room for walkers like you. What would you leave behind for the next one?

Written from: Empty church and settlement lists for this stage; Pilegrimsloftet Borkerud (way/1004842071, tourism=hostel) at km 11.8; Sletring (node/9634874637) for Fåvang Turistsenter; figures from stages.json. 'The pilgrims' loft' is a translation of the name, not a claim about the building.

- [ ] stage 9

## stage 10 — Sletring to Frya

**Theme:** The stave church  
**Narrative:** About fourteen kilometres in the way passes Ringebu stavkyrkje, the stave church at Ringebu, then the village itself, and ends at Frya: 24.7 km, 390 m up, 440 m down.  
**Reflection:** A church built of wood has stood long enough to be called old. What in you has lasted that long?

Written from: Ringebu stavkyrkje (way/557779921, heritage, wikidata Q2030772, also tagged tourism=attraction) at km 13.9; Ringebu (village) at km 17.4; Frya (village, node/3042543294) at the end; 'stave church' and 'built of wood' from the name, stavkyrkje; figures from stages.json.

- [ ] stage 10

## stage 11 — Frya to Klomstad

**Theme:** Farms along the valley  
**Narrative:** Over 29.8 km the way passes the farm lodgings of Rudi gard and Sygard Grytting about nine kilometres in and ends at Klomstad, with 860 m of ascent and 780 m of descent.  
**Reflection:** Farms that take in walkers. What does it mean to be a guest?

Written from: Rudi gard and Sygard Grytting (tourism=hotel) at km 9.0 and 9.7; Klomstad (node/9633674428) for Vertshuset Sinclair; empty church list; figures from stages.json.

- [ ] stage 11

## stage 12 — Klomstad to Rukin

**Theme:** Past Kvam and Sjoa  
**Narrative:** Kvam comes early, then two campsites at Sjoa a little after halfway; the day ends at Rukin, near Otta Turistsenter, after 25.4 km. 720 m of climbing, 710 m of descent, the high point 580 m.  
**Reflection:** The valley narrows the choices. Which ones are you glad not to have?

Written from: Kvam (village) at km 1.9; Storrusten Gjestehus & Camping Sjoa and Sjoa Raftingsenter at km 13.0–13.1; Rukin (node/9633049508) for Otta Turistsenter; figures from stages.json. 'The valley narrows' is the reflection's image, not a claim about the terrain.

- [ ] stage 12

## stage 13 — Rukin to Rindal

**Theme:** Sel and Nord-Sel  
**Narrative:** The stage starts beside Sel kirke and passes Nord-Sel kirke at about eleven kilometres, then Dovreskogen before Rindal: 25.2 km, 580 m up and 290 m down.  
**Reflection:** Two churches with one name between them. What do you share with the people who walked here before?

Written from: Sel kirke (way/557779819, heritage) at km 0.0; Nord-Sel kirke (way/557779816, heritage) at km 10.7; Dovreskogen gjestegård at km 21.4; Rindal (node/9632876382); figures from stages.json.

- [ ] stage 13

## stage 14 — Rindal to Fokstugu fjellstue

**Theme:** Up to Fokstugu  
**Narrative:** The way passes Dovre and Dovre kyrkje before eight kilometres, then Pilgrimsgården Busjord, and follows the old King's Road, Kongeveien over Dovre, up to Fokstugu fjellstue. The day climbs 840 m and descends 480 m over 24.7 km, its high point 1,210 m.  
**Reflection:** The road climbs out of the valley. What do you hope to see from higher up?

Written from: Dovre (village) at km 7.8 and Dovre kyrkje (way/294922586, heritage) at km 8.0; Pilgrimsgården Busjord (node/6808271323) at km 11.5; relation 3917970, name=Kongeveien over Dovre, from=Dovre, to=Fokstugu; Fokstugu fjellstue (way/298217058); figures from stages.json.

- [ ] stage 14

## stage 15 — Fokstugu fjellstue to Hjerkinn fjellstue

**Theme:** Across Dovrefjell  
**Narrative:** From Fokstugu the King's Road crosses Dovrefjell to Hageseter, nearly twenty kilometres on, and then to Hjerkinn fjellstue: 24.5 km, between 900 m and 1,200 m, with 340 m of ascent and 370 m of descent.  
**Reflection:** Up here there is a great deal of sky. What feels small, and what feels large?

Written from: Relations 3918309 (Fokstugu–Hageseter) and 1671572 (Hageseter–Kongsvold), name=Kongeveien over Dovre, wikidata=Q11995693 (Pilegrimsleia over Dovrefjell); Hageseter (alpine_hut) at km 19.9; Hjerkinn fjellstue (node/1873483825); figures from stages.json.

- [ ] stage 15

## stage 16 — Hjerkinn fjellstue to Ryphusan

**Theme:** Past Eysteinkyrkja  
**Narrative:** A kilometre out of Hjerkinn the way passes Eysteinkyrkja, then Kongsvold Fjeldstue at about thirteen kilometres, and goes on to Ryphusan: 34.2 km, long because OpenStreetMap maps no bed between 20 and 30 km out of Hjerkinn. It climbs 1,120 m and descends 960 m.  
**Reflection:** A long day after the high ground. How do you pace yourself when you cannot see the end?

Written from: Eysteinkyrkja (way/232307838) 14 m from the line at km 1.0; Kongsvold Fjeldstue (alpine_hut) at km 12.7; Ryphusan (node/4363452794, wilderness_hut); the fallback arm of the day rule; figures from stages.json.

- [ ] stage 16

## stage 17 — Ryphusan to Aungrenda

**Theme:** Down to Oppdal  
**Narrative:** The day passes St. Michaels kapell, then Driva, and ends at Aungrenda near Oppdal kirke, which lies about two kilometres before the end: 27 km, 230 m of ascent and 740 m of descent.  
**Reflection:** Back among houses after the mountain. What do you want to keep from up there?

Written from: St. Michaels kapell (way/955483091) at km 12.4; Driva (village) at km 15.1; Oppdal kirke (way/557738176, heritage) at km 25.1; Aungrenda (node/9628210434) for Oppdal Gjestetun; relation 5677571, Kongeveien over Dovre (Kongsvoll-Oppdal); figures from stages.json.

- [ ] stage 17

## stage 18 — Aungrenda to Hæverstølen

**Theme:** Nothing on the map  
**Narrative:** From Aungrenda to Hæverstølen OpenStreetMap records no church, no village and no other lodging near the line. 24.2 km, 230 m up, 260 m down, the high point 710 m.  
**Reflection:** A day the map leaves blank. What do you fill it with?

Written from: Empty church, settlement and lodging lists for this stage; Hæverstølen (way/945271281, guest_house); figures from stages.json.

- [ ] stage 18

## stage 19 — Hæverstølen to Voll

**Theme:** To Voll  
**Narrative:** The way passes Gjesteheim Havdal early and ends at Voll, by Rennebu kirke: 25 km, with 540 m of climbing and 830 m of descent.  
**Reflection:** Four days from the cathedral. What has changed in how you walk?

Written from: Gjesteheim Havdal (guest_house) at km 2.8; Voll (village, node/188803442); Rennebu kirke (way/300896838, heritage) at the start of the next stage, 227 m from the line; 'four days' counts stages 20-23; figures from stages.json.

- [ ] stage 19

## stage 20 — Voll to Løkken Verk

**Theme:** Ry, Meldal and Løkken Verk  
**Narrative:** Past Ry Herberge in the first seven kilometres, then Meldal and Meldal kirke, and on to Løkken Verk: 34.6 km, long because no bed is mapped between 20 and 30 km out of Voll. 380 m up and 430 m down.  
**Reflection:** A long day near the end. What are you walking towards now?

Written from: Ry Herberge (node/9040020597, guest_house) at km 6.6; Meldal (village) at km 24.3 and Meldal kirke (way/510511020) at km 23.9; Løkken Verk (village, node/1635193302); the fallback arm of the day rule; figures from stages.json.

- [ ] stage 20

## stage 21 — Løkken Verk to Hongslo

**Theme:** A short day  
**Narrative:** Only 8.9 km, from Løkken Verk to Hongslo by Gumdal Farm, because the next mapped bed near the line after it is 34.6 km further on. 140 m of climbing, 150 m of descent.  
**Reflection:** An afternoon with nowhere to be. How do you spend it?

Written from: Løkken Verk and Orkla Gjestebolig at the start; Gumdal Farm (tourism=hostel) at km 7.7; Hongslo (node/9914064277); the fallback arm of the day rule and the next stage's distance; figures from stages.json.

- [ ] stage 21

## stage 22 — Hongslo to Heggen

**Theme:** Past Skaun  
**Narrative:** The way passes Skaun kirke at about nineteen kilometres and Buvika at thirty-one, and ends at Heggen by Øysand Camping: 34.6 km, 640 m up and 810 m down.  
**Reflection:** One day left. What would you like to have finished before you arrive?

Written from: Skaun kirke (way/255772500, heritage) at km 18.9; Buvika (village) at km 31.0; Heggen (node/9916390099) for Øysand Camping (way/75923474); relation 5659103, Gudbrandsdalsleden (Skaun-Nidaros); figures from stages.json.

- [ ] stage 22

## stage 23 — Heggen to Nidarosdomen

**Theme:** Into Nidaros  
**Narrative:** The last day passes Haltdalen stavkirke and Lo kirke at about nineteen kilometres, then Ilen kirke, and comes into Trondheim to end at Nidarosdomen, where St Olav is buried: 23.5 km, 320 m of ascent and 310 m of descent. Beside the cathedral, Nidaros Pilgrimsgård is mapped as a stamp office for pilgrims.  
**Reflection:** You have arrived where the way was always going. What did you come to say?

Written from: Haltdalen stavkirke (way/170168535, heritage) at km 19.1; Lo kirke (way/177481699, heritage) at km 19.2; Ilen kirke (way/89753972, heritage) at km 22.1; Nidarosdomen (way/417245741, wikidata Q215023); St Olav's burial from Wikidata Q208331 P119; Nidaros Pilgrimsgård (way/167823309, pilgrimage=stamp_office, tourism=guest_house); figures from stages.json.

- [ ] stage 23
