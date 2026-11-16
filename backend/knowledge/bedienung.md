# Bedienung: Aufgaben in ReqMan

Kurze Anleitungen zu den häufigsten Aufgaben. Jeder Abschnitt nennt die Seite, auf der man die Aufgabe erledigt.

## Wie lege ich ein neues Projekt an?

Seite: /

1. Links oben auf den Projektnamen klicken (Projektwechsler, ohne Projekt „Projekt wählen“) – das öffnet die Projektübersicht. Kürzel: **P**.
2. Oben rechts **Neues Projekt** klicken.
3. **Name** eingeben (z. B. „Fahrzeugsteuerung 2025“) und den **Speicherpfad** wählen – das Verzeichnis, in dem das doorstop-Projekt angelegt wird. Es wird automatisch erstellt; über das Ordnersymbol lässt sich ein Verzeichnis suchen.
4. Optional eine **Beschreibung** ergänzen und **Erstellen** klicken.

Danach erscheint das Projekt als Karte in der Projektübersicht. Ein Klick auf die Karte macht es zum aktuellen Projekt; alle anderen Seiten (Anforderungen, Traceability, Metriken …) arbeiten dann mit diesem Projekt.

## Wie importiere ich ein bestehendes doorstop-Projekt?

Seite: /

1. In der Projektübersicht (Klick auf den Projektnamen links oben) oben rechts **Importieren** klicken.
2. Unter **Pfad zum Projektverzeichnis** den Ordner angeben, der die doorstop-Dokumente enthält (Ordner mit `.doorstop.yml`).
3. Optional einen **Anzeigenamen** eingeben; ohne Angabe wird der Verzeichnisname verwendet.
4. Bestätigen. Die Dateien werden nicht kopiert und nicht verändert – ReqMan arbeitet direkt in diesem Ordner.

**Projekt entfernen** (Papierkorb an der Karte) nimmt das Projekt nur aus der Liste. Nur mit der Option „Projektdateien dauerhaft vom Dateisystem löschen“ werden auch die Dateien gelöscht.

## Wie lege ich ein Dokument an (Präfix und Eltern-Dokument)?

Seite: /requirements

1. Seite **Anforderungen** öffnen.
2. Im linken Bereich **Dokumente** auf **+** (Neues Dokument) klicken.
3. **Präfix** eingeben, z. B. `SYS`, `SRS` oder `REQ`. Es wird Teil jeder Anforderungs-ID (SRS001, SRS002 …).
4. **Übergeordnetes Dokument** wählen, z. B. `SYS` für `SRS`. Anforderungen dieses Dokuments verlinken später nach oben auf das Eltern-Dokument. Das oberste Dokument hat kein Eltern-Dokument.

Dokumenttypen, Eigenschaften und die Hierarchie aller Dokumente bearbeitet man auf der Seite **Projekt einrichten** (Zahnrad-Eintrag unten links in der Seitenleiste, Kürzel **D**).

## Wie lege ich eine neue Anforderung an?

Seite: /requirements

1. Auf der Seite **Anforderungen** links das Dokument auswählen.
2. Über der Anforderungsliste auf **+** (Neue Anforderung) klicken oder die Taste **N** drücken. Die ID wird automatisch vergeben (z. B. `SRS013`).
3. Die neue Anforderung öffnet sich rechts im Editor. Im Feld **Anforderungstext** den Text schreiben, am besten nach dem Muster „Das System muss … [Bedingung] [messbares Kriterium].“
4. Bei Bedarf **Ebene** (z. B. `1.2`), die Schalter **Aktiv**, **Normativ**, **Abgeleitet** und die Verlinkungen setzen.
5. Oben **Speichern** klicken oder **Strg+S** drücken.

## Wie lege ich eine Überschrift oder einen Abschnitt an?

Seite: /requirements

1. Eine neue Anforderung anlegen (siehe „Wie lege ich eine neue Anforderung an?“).
2. Im Editor, Tab **Details**, den Schalter **Abschnitt** einschalten.
3. Als Text nur die Überschrift eintragen, z. B. „Sicherheitsanforderungen“.
4. Über die **Ebene** die Gliederung festlegen: `1.0` ist ein Hauptabschnitt, `1.1`, `1.2` … sind die Anforderungen darunter.
5. **Speichern**.

Abschnitte sind keine Anforderungen: Sie brauchen keinen Link und zählen nicht in Abdeckung und Review. In der Liste sind sie mit „Abschnitt“ markiert.

## Wie füge ich Anforderungen aus Excel ein?

Seite: /requirements

1. In Excel die Zeilen markieren (gern mit Überschriftenzeile) und kopieren (Strg+C).
2. In ReqMan das Zieldokument auswählen und oben **Importieren ▾ → Aus Zwischenablage einfügen** wählen – oder einfach in die Liste klicken und Strg+V drücken.
3. Im Dialog **Anforderungen aus Excel übernehmen** jeder Spalte ein Feld zuordnen. Eine Spalte muss **Anforderungstext** sein.
4. Die **Prüfung** in der Vorschau zeigt Fehler je Zeile; Fehler direkt in der Vorschau korrigieren.
5. Importieren. Die IDs vergibt ReqMan; Abschnitte aus Excel werden passend verschachtelt.

## Wie lade ich eine Excel-Datei?

Seite: /requirements

1. Seite **Anforderungen** öffnen und oben **Importieren ▾ → Excel-Datei laden** wählen (Kürzel **I** öffnet das Menü).
2. Die `.xlsx`-Datei auswählen.
3. Ist kein Dokument gewählt, fragt ReqMan **Wohin sollen die Anforderungen?** – ein vorhandenes Dokument wählen oder ein neues Präfix eingeben (Vorschlag aus dem Dateinamen).
4. Es folgt dieselbe Vorschau mit Spaltenzuordnung und Prüfung wie beim Einfügen. Importiert wird nur, wenn alle Zeilen gültig sind.

Stammt die Datei aus **Exportieren ▾ → Excel (zum Bearbeiten und Zurückladen)** (enthält also IDs), vergleicht ReqMan sie stattdessen mit dem Projekt – siehe „Wie bearbeite ich Anforderungen in Excel und hole die Änderungen zurück?“.

## Wie bearbeite ich Anforderungen in Excel und hole die Änderungen zurück?

Seite: /requirements

1. Dokument auswählen und oben **Exportieren ▾ → Excel (zum Bearbeiten und Zurückladen)** wählen. Die Datei enthält die IDs und kann in Excel bearbeitet und kommentiert werden.
2. Die Datei in Excel ändern: Texte anpassen, neue Zeilen ohne ID ergänzen, Kommentare schreiben.
3. Zurück in ReqMan **Importieren ▾ → Excel-Datei laden** wählen und die geänderte Datei auswählen.
4. ReqMan vergleicht die Datei mit dem Projekt und zeigt **Geänderte Anforderungen**, **Neue Zeilen (ohne ID)** und **Nur kommentiert**. Jede Änderung wurde geprüft.
5. Anhaken, was übernommen werden soll, und bestätigen. Übernommen wird alles Angehakte oder nichts. Kommentare werden nicht gespeichert, sie dienen nur als Hinweis.

## Wie verlinke ich Anforderungen?

Seite: /traceability

Links zeigen immer vom Kind nach oben auf die Eltern-Anforderung (z. B. SRS003 → SYRS002).

**Im Editor:** Anforderung öffnen, Tab **Verknüpfungen**, unter **Verlinkungen** die ID eintragen (z. B. `SYRS002`), **+ Hinzufügen** und dann **Speichern**. Mit × entfernt man einen Link. Unter dem Eingabefeld stehen **Vorschläge** aus dem Eltern-Dokument; **Verlinken** übernimmt einen Vorschlag ins Formular.

**Ansicht Verknüpfen:** in **Traceability** oben **Verknüpfen** wählen, links das **Quelldokument (ziehbar)**, rechts das **Zieldokument (Drop-Zone)** einstellen und eine Anforderung von links auf die passende rechts ziehen. Der Link wird sofort gespeichert.

Ein geänderter Link macht den Review-Stempel ungültig.

## Wie lese ich Traceability, Graph und Matrix?

Seite: /traceability

**Traceability** (Menü links) hat vier Ansichten, alle mit derselben Dokumentauswahl (mindestens zwei Dokumente):

- **Graph**: das Netz aller Anforderungen. Farbe = Dokument, rot umrandet = ohne Link, gestrichelt = ungültiger Link. Mit der Maus über einen Knoten fahren hebt seine Nachbarn hervor; ein Klick öffnet die Anforderung im Editor. Kürzel **G** öffnet diese Ansicht.
- **Matrix**: jede Zeile eine Anforderung, die Spalten zeigen die verlinkten Anforderungen der anderen Dokumente. „✗ Nein“ bedeutet: keine Verlinkung – hier fehlt eine Ableitung oder ein Link nach oben.
- **Baum**: aufklappbare Spalten; der Schalter **Top-Down / Bottom-Up** wechselt die Richtung.
- **Verknüpfen**: Links per Ziehen anlegen (siehe „Wie verlinke ich Anforderungen?“).

**Metriken** fasst zusammen: Anzahl, **Link-Abdeckung** und **Review-Abdeckung** je Dokument. Die frühere Seite „Matrix“ (Attribut-Tabelle) gibt es nicht mehr: Spalten, Spaltenfilter und Sortierung stehen in der Ansicht **Tabelle** der Seite Anforderungen.

## Wie sehe ich das Umfeld einer Anforderung als Graph?

Seite: /requirements

1. Anforderung öffnen, Tab **Verknüpfungen**.
2. Oben steht der **lokale Graph**: die offene Anforderung mit ihren Nachbarn. Mit dem Schieber stellt man die **Tiefe** von 1 bis 3 ein.
3. Ein Klick auf einen Nachbarn öffnet ihn im Editor.

Den Graph des ganzen Projekts zeigt **Traceability → Graph**.

## Wie nutze ich das Befehlsfeld und die Tastenkürzel?

Seite: /requirements

**Strg+K** öffnet das Befehlsfeld oben in der Kopfzeile. Ohne Eingabe zeigt es die Befehle der aktuellen Seite, mit Eingabe zusätzlich Treffer der Anforderungssuche (findet auch sinngemäß, ab drei Zeichen). Pfeiltasten wählen, **Enter** führt aus, **Esc** schließt.

Kürzel (Einzeltasten gelten nicht in Textfeldern): **N** neue Anforderung, **Strg+S** speichern, **R** Review, **T** Tabelle, **L** Liste, **G** Graph, **I** Importieren, **E** Exportieren, **P** Projekt wechseln, **D** Projekt einrichten, **F1** Hilfe, **F** Frag ReqMan. Befehle, die es auf der aktuellen Seite nicht gibt, erscheinen nicht.

## Wie setze ich den Review-Stempel?

Seite: /requirements

Der Stempel bestätigt: „Genau diese Fassung wurde geprüft.“

1. Anforderung im Editor öffnen und sicherstellen, dass sie gespeichert ist („Zuerst speichern“; sonst ist die Auswahl gesperrt).
2. Oben **Review** klicken (Kürzel **R**), im Dialog **Nur als geprüft stempeln (ohne Protokoll)** wählen und **Stempeln** klicken.
3. Die Marke im Kopf wechselt zu **Reviewed**; mit der Maus darauf steht der Stempel als Hinweis.

ReqMan speichert dazu einen Fingerabdruck aus Text, Referenz und Links. Ändert sich einer davon, zeigt die Anforderung wieder **Ausstehend** bzw. „Inhalt geändert seit letztem Review“ – dann erneut prüfen und stempeln. Ebene, Aktiv, Normativ und eigene Attribute ändern den Stempel nicht.

## Wie führe ich ein formales Review (Validierung) durch?

Seite: /requirements

1. Anforderung öffnen und oben auf **Review** (Review starten) klicken.
2. Status wählen: **APPROVED** (genehmigt), **REJECTED** (abgelehnt) oder **NEEDS_REVISION** (Überarbeitung nötig).
3. Die **Checkliste** ausfüllen; „vollständig und eindeutig“ und „Akzeptanzkriterien definiert“ sind Pflichtpunkte.
4. Eine **Zusammenfassung** schreiben (Pflicht) und speichern. Ohne Protokoll geht es mit der Auswahl **Nur als geprüft stempeln**.

ReqMan schreibt einen Bericht in den Ordner `validation/` und legt einen Git-Commit an. Bei APPROVED wird automatisch auch der Review-Stempel gesetzt (abschaltbar mit „Review-Stempel NICHT setzen“). Alle Berichte stehen im Tab **Verlauf** unter „Reviews“.

## Was bedeutet OUTDATED bzw. Veraltet?

Seite: /requirements

**OUTDATED** (orange, im Editor „⚠ Veraltet“) heißt: Der Anforderungstext wurde geändert, **nachdem** das letzte formale Review (Validierung) abgeschlossen wurde. Das alte Ergebnis – etwa APPROVED – gilt damit für eine Fassung, die es so nicht mehr gibt.

Was zu tun ist: Änderung fachlich prüfen und ein neues Review durchführen (Knopf **Review**). Danach verschwindet die Markierung. Der alte Bericht bleibt im Tab **Verlauf** erhalten.

Verwandt: **Ausstehend** beim Review-Stempel bedeutet, dass Text, Referenz oder Links seit dem letzten Stempel geändert wurden.

## Wie starte ich die KI-Qualitätsprüfung und lese das Ergebnis?

Seite: /requirements

1. Anforderung öffnen, Tab **KI-Qualität**.
2. Gegebenenfalls ein **Qualitätsprofil** wählen und **Jetzt prüfen** klicken. Die Prüfung dauert einige Sekunden.
3. Oben steht die **Gesamtnote** von 0 bis 100 mit einer Zusammenfassung, darunter die Kategorien **Eindeutigkeit**, **Testbarkeit**, **Vollständigkeit** und **Konsistenz**.
4. Unter **Probleme** stehen die Befunde nach Schwere, jeweils mit **Verbesserungsvorschlag**.
5. Nach einer Änderung **Erneut prüfen**.

Die KI ist ein Hinweisgeber: Befunde fachlich prüfen, nicht blind übernehmen. Das Ergebnis wird neben der Anforderung gespeichert.

## Was sind Qualitätsprofile?

Seite: /requirements

Ein Qualitätsprofil legt fest, wonach die KI-Qualitätsprüfung bewertet: Bezugsnormen, Gewichtung der Kategorien, verbotene Füllwörter (z. B. „möglichst“, „ggf.“, „schnell“) und die **Mindestnote**. Liegt die Gesamtnote darunter, gilt die Anforderung als „nicht bestanden“.

Mitgeliefert sind:
- **standard** – INCOSE / IEEE 29148, Mindestnote 70, für alle Projekte ohne besondere Norm,
- **aspice** – Automotive SPICE,
- **iso26262** – funktionale Sicherheit im Fahrzeug,
- **do178c** – Luftfahrt-Software.

Das Profil wählt man im Tab **KI-Qualität** vor **Jetzt prüfen**. Die Profile liegen als YAML-Dateien in `data/ai_quality_profiles/`.

## Wie lege ich eigene Attribute an?

Seite: /admin

Nur für die Rolle **admin**.

1. Links unten **Administration** öffnen, Bereich Attribute.
2. Neues Attribut anlegen: **Schlüssel** (z. B. `MEIN_ATTRIBUT`), **Anzeigename**, **Datentyp** (Text, Mehrzeiliger Text, Zahl, Ja/Nein, Auswahl, Liste), bei Auswahl die **Auswahlwerte** (z. B. „Offen, In Review, Freigegeben“).
3. Optional **Pflichtfeld**, **Standardwert** und einen **Hilfetext** setzen. Der Hilfetext erscheint im Editor als Fragezeichen neben dem Feld.
4. Speichern.

Die Attribute erscheinen danach im Editor im Tab **Details** bei jeder Anforderung.

## Welche Rollen gibt es und wie lege ich Benutzer an?

Seite: /admin

- **viewer** (Betrachter): darf alles lesen, aber nichts ändern.
- **editor** (Bearbeiter): darf Anforderungen und Projekte bearbeiten, stempeln und Reviews durchführen.
- **admin** (Administrator): zusätzlich Benutzer und Attribute verwalten.

Benutzer anlegen (nur admin): **Administration** öffnen, **Neuen Benutzer erstellen**, dann **Benutzername**, **Vollständiger Name**, **E-Mail**, **Passwort** und **Rolle** eingeben, optional ein **Home-Verzeichnis** für die Ordnersuche. Benutzer lassen sich dort auch deaktivieren oder löschen.

Beim ersten Start gibt es den Benutzer `admin`; dessen Passwort sollte sofort geändert werden.

## Wie exportiere ich ein Dokument?

Seite: /requirements

1. Auf der Seite **Anforderungen** das Dokument auswählen.
2. Oben auf **Exportieren ▾** klicken (Kürzel **E**).
3. Format wählen: **Excel (zum Bearbeiten und Zurückladen)**, **CSV**, **TSV**, **YAML** oder **PDF (gesetzt)**. Die Datei wird heruntergeladen. **Nach Obsidian** liefert das ganze Projekt als Obsidian-Ordner aus.

Nur die Excel-Datei erkennt ReqMan beim Zurückladen wieder (siehe „Wie bearbeite ich Anforderungen in Excel und hole die Änderungen zurück?“). Geänderte Notizen aus Obsidian holt **Importieren ▾ → Änderungen aus Obsidian holen** als Vorschläge zurück.

## Wie finde ich Anforderungen und sehe, was eine Änderung betrifft?

Seite: /requirements

**Suche:** Oben in der Kopfzeile ins Feld schreiben oder **Strg+K** drücken. Die Suche findet Anforderungen nach Bedeutung, also auch mit anderen Wörtern („Bremsweg“ findet „Verzögerungsstrecke“). Ein Klick springt zur Anforderung. In der Anforderungsliste filtert das Feld **Filtern…** dagegen nur nach Wortlaut im gewählten Dokument; die Tabelle filtert zusätzlich je Spalte.

**Auswirkungen:** Anforderung öffnen, Tab **Verknüpfungen**, Abschnitt **Auswirkungen**. Dort steht, welche Anforderungen über Links davon abhängen (abwärts), wovon sie abhängt (aufwärts) und welche ähnlichen Anforderungen nicht verlinkt sind. Darüber zeigt der lokale Graph das Umfeld.

**Ähnliche Anforderungen:** Beim Schreiben warnt ein gelber Kasten, wenn es eine sehr ähnliche Anforderung schon gibt.

## Was ist doorstop und wo liegen meine Dateien?

Seite: /help

ReqMan speichert Anforderungen mit **doorstop**, einem offenen Werkzeug, das jede Anforderung als eigene YAML-Datei ablegt. Im Projektordner hat jedes Dokument einen Unterordner (z. B. `SRS/`) mit einer `.doorstop.yml` und je Anforderung einer Datei wie `SRS001.yml` (Text, Ebene, Links, Review-Stempel). Berichte formaler Reviews liegen in `validation/`, Ergebnisse der KI-Prüfung als Zusatzdateien daneben.

Weil alles aus Textdateien besteht, lässt sich das Projekt mit Git versionieren; der Tab **Verlauf** im Editor zeigt unter „Git“ die Historie einer Anforderung. Den Speicherort sieht man auf der Projektkarte in der Projektübersicht. Benutzer, Rollen und Projektliste liegen getrennt im Ordner `data/` von ReqMan.
