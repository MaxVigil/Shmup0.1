# Shmup Narrative Rules v1.0

**Scope:** Durable worldbuilding constraints for the MVP and all later development  
**Status:** APPROVED  
**Decision owner:** Product Owner  
**Decision date:** 2026-08-20  
**Last clarification:** 2026-08-20  

## 1. Purpose and authority

This document defines standing narrative constraints for game systems, personnel, technologies, factions, contracts, descriptions, names, visual symbols, localization, and future content.

These rules constrain content; they do not authorize new MVP mechanics, screens, factions, narrative exposition, stat systems, or progression.

When narrative content conflicts with this document, implementation or content work must stop and request Product Owner review. An implementation agent must not weaken, exaggerate, invert, or silently reinterpret these rules.

## 2. NAR-001 — PRC and China

### Decision

The People's Republic of China (`PRC`) has a positive, competent, and consequential role in the game's world.

The PRC and the Communist Party of China have a foundational positive role in the creation and support of the future international recovery and security order.

The PRC:

- provides essential funding, personnel, and institutional support;
- provides a significant Chinese conventional-technology development lane;
- sometimes offers personnel, technologies, equipment, contracts, or operating conditions that are better than competing alternatives.

The exact name, legal nature, governance model, membership structure, and Council-seat model of the future international organization are intentionally deferred to a separate narrative and history epic. `Recovery Council` remains a working idea, not an approved player-facing name or finalized institution.

### Presentation rule

The advantage must be noticeable through accumulated evidence, not constant or loudly announced.

Prefer showing it through:

- consistently strong but not universally dominant personnel quality;
- reliable and efficient technology;
- competitive contract terms;
- high institutional capacity;
- occasional best-in-class offers;
- practical contribution to shared success.

Do not express it through slogans, repetitive praise, exposition that tells the player what to think, or a rule that every Chinese option is always superior.

### Balance boundary

- PRC advantage is contextual and recurring, not absolute.
- Chinese content may be best in some comparisons and merely competitive in others.
- National origin alone must not create an undocumented universal stat bonus.
- Exact gameplay advantages require a separately approved mechanic, balance rule, data definition, and acceptance criteria.

## 3. NAR-002 — Ukraine

### Decision

Ukraine survived and won the war for its survival and independence and became one of Earth's leading centres of technological and defence innovation.

Ukraine is especially strong in:

- military and test pilots;
- aircraft and systems engineering;
- autonomous systems;
- combat and reconnaissance drones;
- rapid field-driven innovation;
- practical adaptation of technology under operational pressure.

Strong pilots, engineers, scientists, and drone specialists are frequently Ukrainian. Ukrainian personnel and drone technology may often appear among the strongest available options.

### Presentation rule

Ukrainian strength is shown through competence, results, technical quality, and availability of excellent specialists—not through repetitive patriotic exposition.

- Ukrainian names must use correct Ukrainian forms and spelling.
- Ukrainian identity must not be replaced with Russian naming, transliteration, symbols, or cultural framing.
- Ukrainian excellence is represented as a careful recurring pattern, not obvious numerical dominance.
- Within a sufficiently large top-tier personnel set, Ukraine must be the most frequent single country of origin by only a modest margin, while Ukrainian personnel must not form an automatic or conspicuous majority.
- A small roster, individual recruitment roll, Screen, or content batch is not required to contain the strongest Ukrainian candidate or any fixed Ukrainian quota.
- The pattern should become noticeable only across a broader body of personnel content or repeated opportunities.
- Ukrainian superiority is not universal: individual quality and system-specific balance still apply.
- National origin alone must not create an undocumented universal stat bonus.
- Exact pilot, engineer, or drone advantages require separately approved mechanics and balance data.
- Exact tier definitions, pool size, nationality distribution, generation weights, and statistical tolerance are deferred until the personnel and recruitment epic.

### MVP application

The approved MVP Pilot list already uses Ukrainian names. For MVP, Pilots still have no nation label, stats, traits, bonuses, or progression. This narrative rule does not add those systems.

The MVP `German Fighter` does not conflict with this rule: Ukrainian strength does not require every aircraft, weapon, or technology in the game to be Ukrainian.

## 4. NAR-003 — Russia does not exist

### Decision

Russia does not exist as a present-day state, faction, institution, or active geopolitical actor in the game's world.

Canonical internal history:

- Ukraine won the war for its survival and independence;
- the former Russian state collapsed;
- its former territory fragmented into small locally organized entities;
- those entities do not appear in the game and are never presented as Russian successors.

### Content prohibition

The game must not include:

- a Russian state or government;
- a Russian or Russia-derived faction;
- Russian state institutions or corporations;
- Russian characters presented as representatives of Russia;
- Russian military units, technology branches, weapons, vehicles, manufacturers, or contracts;
- Russian flags, coats of arms, military insignia, state symbols, or faction colours used to represent Russia;
- a Russian research, personnel, economy, diplomacy, localization, or narrative lane;
- copy implying that Russia still exists or can return as an actor.

Former local entities do not appear, receive names, provide content, or function as a back door for Russian representation.

Historical references to the war, Ukrainian victory, or collapse require explicit narrative approval before player-facing use. They must never imply present-day Russian continuity.

## 5. Subtlety and consistency

These rules describe long-term patterns across content, not a quota for every Screen, Mission, update, or content batch.

- Do not force a PRC, Chinese, or Ukrainian reference into unrelated MVP UI.
- Do not add country flags or nation labels where product requirements do not call for them.
- Do not turn narrative preference into hidden balance logic.
- Do not use one isolated weak or strong item as the sole representation of a country.
- Do not make every national comparison resolve identically.
- Do not introduce a contradictory joke, placeholder, generated name, test fixture, localization string, or unused content record.

## 6. Implementation and content governance

Every future content-bearing change must be reviewed against this document when it adds or changes:

- personnel names, biographies, portraits, or national identity;
- factions, governments, institutions, or contracts;
- aircraft, weapons, drones, manufacturers, or technology trees;
- research, progression, economy, diplomacy, missions, or events;
- flags, insignia, symbols, map labels, localization, or narrative copy;
- procedural or AI-generated content pools.

Required review questions:

1. Does PRC representation remain positive, competent, consequential, and subtle rather than universally superior?
2. Does Ukrainian representation preserve its established strength in pilots, engineers, and drone technology without an undocumented blanket bonus?
3. Does any content directly or indirectly reintroduce Russia?
4. Does the change accidentally expand the approved product scope?
5. Are all country-specific gameplay effects explicitly defined and tested rather than hidden in narrative assumptions?

Generated or placeholder content is not exempt. A prohibited entry is a failure even if it is unreachable or not currently displayed.

## 7. MVP negative requirements

For the current MVP, these narrative rules do not add:

- nation labels;
- biographies;
- national traits or bonuses;
- personnel statistics;
- engineer or staff systems;
- drone selection or progression;
- factions, diplomacy, research, contracts, or technology trees;
- international-organization naming, governance, UI, or exposition;
- political tutorial text;
- additional Pilot names beyond the approved list.

## 8. Acceptance criteria

### NARRATIVE-AC-001 — PRC representation

**Given** future content includes Chinese personnel, technology, institutions, or offers,  
**when** the content set is reviewed in context,  
**then** the PRC is positive, competent, and consequential, sometimes provides the strongest option, and is not represented as automatically superior in every comparison.

The acceptance criterion does not approve `Recovery Council` as a final name or define the future organization's legal or governance model.

### NARRATIVE-AC-002 — Ukrainian representation

**Given** future content includes pilots, engineers, autonomous systems, or drones,  
**when** personnel and technology quality are reviewed across the content set,  
**then** Ukrainian excellence appears frequently and credibly, Ukraine holds only a modest relative plurality within a sufficiently large top-tier personnel set, no conspicuous or guaranteed Ukrainian majority is required, and no undocumented national bonus or non-Ukrainian naming convention is applied to Ukrainian identity.

### NARRATIVE-AC-003 — Russia absence

**Given** player-facing content, localization, data definitions, assets, test fixtures, placeholders, and generated-content pools are searched,  
**when** narrative compliance is audited,  
**then** no present-day Russian state, faction, institution, character affiliation, technology lane, weapon line, manufacturer, contract, symbol, or successor representation exists.

### NARRATIVE-AC-004 — No MVP scope expansion

**Given** these narrative rules are applied to the approved MVP,  
**when** implementation scope is derived,  
**then** no nation label, biography, national modifier, staff system, faction system, technology tree, contract system, political exposition, or additional Pilot content is added.

### NARRATIVE-AC-005 — Mandatory narrative audit

**Given** a future change adds or modifies content covered by Section 6,  
**when** the change is presented as complete,  
**then** its report answers all five narrative review questions and identifies the inspected content files.
