// Review-/Meeting-Unterlage (E3, Querformat). Daten aus pdf_review.py (data.json):
// title, project, git, stand, meeting {title, date, place, participants}, auswahl (Text), attribute (Namen),
// rows [{nr, uid, ref, doc, level, markup, status, attributes_markup, gross}], summary [{status, anzahl}], gesamt.
#import "gemeinsam.typ": *
#let data = json("data.json")
#let md = markup.with(images: data.images)

#show: grundlayout.with(
  titel: data.meeting.at("title"),
  kopf-rechts: [#data.project],
  fuss-links: [Stand #data.stand],
  quer: true,
  rand: (x: 1.6cm, top: 2.2cm, bottom: 1.9cm),
  groesse: 9.5pt,
)
#set par(justify: false)

// ── Hilfsbausteine ────────────────────────────────────────────────────────────
// Gezeichnetes Kästchen (☐ fehlt in Liberation Sans) mit Beschriftung.
#let kaestchen(beschriftung) = box(baseline: 1.5pt, stroke: 0.7pt + luma(60), width: 3.2mm, height: 3.2mm, radius: 0.3mm) + h(0.4em) + beschriftung

// Eingabelinie (leer zum Ausfüllen) mit Mindestbreite.
#let eingabe(breite: 100%) = box(width: breite, stroke: (bottom: 0.5pt + luma(120)), height: 1.1em)

// Feld im Kopf: Bezeichnung + Wert oder Linie.
#let feld(name, wert, breite: 100%) = {
  text(size: 8pt, fill: grau, name)
  linebreak()
  if wert != none and wert != "" { wert } else { eingabe(breite: breite) }
}

#let status-farbe(s) = if s == "geprüft" { rgb("#15803d") } else if s == "nicht geprüft" { warnorange } else { warnrot }
#let status-marke(s) = box(baseline: 0.5pt, width: 2.2mm, height: 2.2mm, radius: 50%, fill: status-farbe(s)) + h(0.3em) + s

// ── Kopf ──────────────────────────────────────────────────────────────────────
#text(size: 20pt, weight: "bold", data.meeting.at("title"))
#v(0.15cm)
#text(size: 10.5pt, fill: luma(90))[#data.project #if data.git != none [ · Git-Stand #data.git] · erstellt #data.stand]
#v(0.35cm)
#line(length: 100%, stroke: 1.2pt + akzent)
#v(0.3cm)
#grid(
  columns: (4.5cm, 1fr, 1.4fr), column-gutter: 0.8cm, row-gutter: 0.7cm,
  feld("Datum", data.meeting.date),
  feld("Ort / Link", data.meeting.place),
  feld("Auswahl", data.auswahl),
  grid.cell(colspan: 3, feld("Teilnehmer", if data.meeting.participants.len() > 0 { data.meeting.participants.join(", ") } else { none })),
)
#if data.meeting.participants.len() == 0 { v(0.6cm); eingabe() }
#v(0.5cm)

// ── Tabelle ───────────────────────────────────────────────────────────────────
#let kopfzelle(t) = table.cell(fill: luma(228), text(weight: "bold", size: 9pt, t))

#let zeile(r) = {
  let breakable = r.gross
  (
    table.cell(breakable: breakable)[#r.nr],
    table.cell(breakable: breakable)[#text(weight: "bold", size: 8.5pt)[#r.uid]#label(r.ref)
      #if r.level != "" [ #linebreak() #text(size: 7.5pt, fill: grau)[Ebene #r.level]]],
    table.cell(breakable: breakable, md(r.markup)),
    table.cell(breakable: breakable)[
      #set text(size: 8.5pt)
      #status-marke(r.status)
      #if r.attributes_markup.len() > 0 {
        v(0.2em)
        attribute-liste(r.attributes_markup, md)
      }
    ],
    table.cell(breakable: breakable, []),
    table.cell(breakable: breakable)[
      #set text(size: 8.5pt)
      #kaestchen[angenommen] \
      #v(0.15em)
      #kaestchen[ändern] \
      #v(0.15em)
      #kaestchen[abgelehnt]
    ],
  )
}

#if data.rows.len() == 0 [
  #block(inset: 10pt, stroke: (paint: warnorange, thickness: 0.6pt, dash: "dashed"),
    text(fill: warnorange)[Keine Anforderung entspricht der Auswahl.])
] else {
  table(
    columns: (0.9cm, 2.4cm, 1fr, 4.3cm, 4.6cm, 3.3cm),
    stroke: 0.4pt + luma(150),
    inset: (x: 4pt, y: 5pt),
    align: left + top,
    table.header(
      kopfzelle[Nr.], kopfzelle[ID], kopfzelle[Text],
      kopfzelle[Status#if data.attribute.len() > 0 [ \/ Attribute]],
      kopfzelle[Kommentar], kopfzelle[Entscheidung],
    ),
    ..data.rows.map(zeile).flatten(),
  )
}

// ── Zusammenfassung ───────────────────────────────────────────────────────────
#v(0.8cm)
#block(breakable: false, width: 100%)[
  #text(size: 13pt, weight: "bold")[Zusammenfassung]
  #v(0.2cm)
  Besprochen: *#data.gesamt* Anforderung#if data.gesamt != 1 [en]#if data.gesamt > 0 [ – davon
  #data.summary.filter(s => s.anzahl > 0).map(s => [#s.anzahl #s.status]).join(", ")].
  #v(0.25cm)
  #table(
    columns: (auto, auto, auto, auto),
    stroke: 0.4pt + luma(150),
    inset: (x: 8pt, y: 4pt),
    table.header(kopfzelle[Status], kopfzelle[Anzahl], kopfzelle[Entscheidung], kopfzelle[Anzahl]),
    [nicht geprüft], [#data.summary.at(0).anzahl], [angenommen], [],
    [geändert nach Prüfung], [#data.summary.at(1).anzahl], [ändern], [],
    [geprüft], [#data.summary.at(2).anzahl], [abgelehnt], [],
  )
]

// ── Beschlüsse und Aufgaben ───────────────────────────────────────────────────
#v(0.6cm)
#block(breakable: false, width: 100%)[
  #text(size: 13pt, weight: "bold")[Beschlüsse und Aufgaben]
  #v(0.2cm)
  #table(
    columns: (1fr, 5cm, 3.2cm),
    stroke: 0.4pt + luma(150),
    inset: (x: 5pt, y: 9pt),
    table.header(kopfzelle[Was], kopfzelle[Wer], kopfzelle[Bis wann]),
    ..range(6).map(_ => ([], [], [])).flatten(),
  )
]
