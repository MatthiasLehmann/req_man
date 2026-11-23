// Vorlage „Spezifikation“ (E2): Lastenheft/Pflichtenheft mit Dokumentenlenkung.
// Daten aus pdf_spezifikation.build_spec_data (typst_service.build_data + meta, history, glossary, options, logo).
#import "gemeinsam.typ": *
#let data = json("data.json")
#let md = markup.with(images: data.images)
#let m = data.meta
#let opt = data.options
#let tabellarisch = opt.layout == "tabelle"
#let gruen = rgb("#15803d")

// Feldwert (maskierter Text) oder Gedankenstrich
#let wert(v) = if v == none or v == "" { text(fill: grau)[–] } else { md(v) }
#let status-farbe = if m.status == "freigegeben" { gruen } else if m.status == "pruefung" { akzent } else { warnorange }

// ── Wasserzeichen, solange nicht freigegeben ──────────────────────────────────
#set page(foreground: if not m.released {
  place(center + horizon, rotate(-50deg,
    text(size: 104pt, weight: "bold", tracking: 0.06em, fill: luma(0).transparentize(91%))[ENTWURF]))
})

#show: grundlayout.with(
  titel: data.meta.title,
  kopf-links: md(m.title),
  kopf-rechts: (
    (if m.doc_number != "" { md(m.doc_number) }),
    (if m.version != "" [Version #md(m.version)]),
    [#m.status_label],
  ).filter(x => x != none).join([#h(0.5em)·#h(0.5em)]),
  fuss-links: [#if m.confidentiality != "" [#md(m.confidentiality) #h(0.5em)·#h(0.5em)]Stand #m.date],
  rand: (x: 2.2cm, top: 2.6cm, bottom: 2.4cm),
)

// Überschriften und Titel nicht trennen („Simu-lation“)
#show heading: set text(hyphenate: false)

// ── Deckblatt ─────────────────────────────────────────────────────────────────
// Eigenes Deckblatt statt gemeinsam.deckblatt: breitere Bezeichnungsspalte und Kennblatt als Tabelle.
#page(header: none, footer: none)[
  #grid(columns: (1fr, auto), align: (left + bottom, right + bottom),
    text(size: 9pt, fill: grau, md(m.project)),
    if data.logo != none { image(data.logo, height: 1.6cm) } else { v(1.6cm) })
  #line(length: 100%, stroke: 0.5pt + linie)
  #v(3.4cm)
  #block({
    set text(size: 26pt, weight: "bold", hyphenate: false)
    set par(justify: false, leading: 0.45em)
    md(m.title)
  })
  #v(0.15cm)
  #text(size: 13pt, fill: luma(90))[Spezifikation · #data.documents_label]
  #v(0.5cm)
  #line(length: 35%, stroke: 1.2pt + akzent)
  #v(1.2cm)
  #{
    set text(size: 10pt)
    table(
      columns: (4.4cm, 1fr),
      stroke: 0.5pt + luma(175),
      inset: (x: 7pt, y: 6pt),
      fill: (x, _) => if x == 0 { luma(242) } else { none },
      [Dokumentnummer], wert(m.doc_number),
      [Version], wert(m.version),
      [Status], text(fill: status-farbe, weight: "bold", m.status_label),
      [Vertraulichkeit], wert(m.confidentiality),
      [Datum], m.date,
      [Git-Stand], if data.git != none { data.git } else { text(fill: grau)[kein Git-Repository] },
      [Anforderungen], str(data.counts.anforderungen),
    )
  }
  #if opt.filtered {
    v(0.5cm)
    text(size: 9.5pt, fill: warnorange)[Auszug: Das Dokument enthält nur ausgewählte Anforderungen.]
  }
  #place(bottom + left, block(width: 100%, {
    line(length: 100%, stroke: 0.5pt + linie)
    set text(size: 8.5pt, fill: grau)
    grid(columns: (1fr, auto),
      [Erzeugt mit ReqMan aus dem Projektstand; maßgeblich ist der Stand im Repository.],
      if m.confidentiality != "" [Vertraulichkeit: #md(m.confidentiality)])
  }))
]

// ── Dokumentenlenkung ─────────────────────────────────────────────────────────
= Dokumentenlenkung

== Freigabe

#{
  set text(size: 9.5pt)
  table(
    columns: (3.2cm, 1fr, 2.8cm, 1fr),
    rows: (auto, 1.25cm, 1.25cm, 1.25cm),
    stroke: 0.5pt + luma(150),
    inset: (x: 6pt, y: 5pt),
    align: (left + horizon),
    fill: raster-fuellung,
    table.header(strong[Rolle], strong[Name], strong[Datum], strong[Unterschrift]),
    [Erstellt], md(m.author), [], [],
    [Geprüft], md(m.reviewer), [], [],
    [Freigegeben], md(m.approver), [], [],
  )
}
#v(0.3em)
#text(size: 8.5pt, fill: grau)[
  Status dieses Dokuments: *#m.status_label*.
  #if not m.released [Das Dokument ist nicht freigegeben und als Entwurf gekennzeichnet.]
]

== Änderungshistorie

#let hist = data.history
#if not hist.available [
  #text(fill: grau)[Kein Git-Repository – eine Änderungshistorie ist nicht verfügbar.]
] else if hist.entries.len() == 0 [
  #text(fill: grau)[Für die Dateien dieses Dokuments gibt es noch keine Commits.]
] else [
  #text(size: 8.5pt, fill: grau)[
    Commits, die die Dateien des Dokuments berühren (neueste zuerst)#if hist.truncated [; gezeigt werden die letzten #hist.entries.len()].
    Versionen = Git-Tags.
  ]
  #v(0.2em)
  #{
    set text(size: 8.5pt)
    set par(justify: false)
    table(
      columns: (1.9cm, 2.0cm, 3.2cm, 1fr, 1.7cm),
      stroke: 0.4pt + luma(190),
      inset: (x: 5pt, y: 4pt),
      fill: raster-fuellung,
      table.header(strong[Version], strong[Datum], strong[Autor], strong[Änderung], strong[Commit]),
      ..hist.entries.map(c => (
        if c.tags.len() > 0 { strong(c.tags.join(", ")) } else { [] },
        c.date, c.author, md(c.message), raw(c.hash),
      )).flatten(),
    )
  }
]
#if hist.dirty [
  #text(size: 8.5pt, fill: warnorange)[Hinweis: Die Arbeitskopie enthält noch nicht committete Änderungen an diesem Dokument; sie sind im PDF enthalten, aber nicht in der Historie.]
]

// ── Inhaltsverzeichnis ────────────────────────────────────────────────────────
#pagebreak()
#outline(title: [Inhaltsverzeichnis], depth: 3, indent: auto)

// ── Bausteine für die Darstellung „Tabelle“ ───────────────────────────────────
#let status-text(e) = {
  let notes = ()
  if not e.normative { notes.push("nicht normativ") }
  if e.derived { notes.push("abgeleitet") }
  notes.push(e.status)
  notes.join(", ")
}

#let attr-zelle(e) = {
  set text(size: 8pt)
  set par(justify: false)
  let zeilen = ((text(fill: grau)[Status:], [#status-text(e)]),)
  for a in e.attributes_markup { zeilen.push((text(fill: grau, md(a.name) + ":"), md(a.markup))) }
  if e.parents.len() > 0 { zeilen.push((text(fill: grau)[Oben:], jumps(e.parents))) }
  if e.children.len() > 0 { zeilen.push((text(fill: grau)[Unten:], jumps(e.children))) }
  grid(columns: (auto, 1fr), column-gutter: 0.4em, row-gutter: 0.4em, ..zeilen.flatten())
}

#let req-tabelle(zeilen) = {
  set par(justify: false)
  table(
    columns: (2.4cm, 1fr, 4.6cm),
    stroke: 0.4pt + luma(180),
    inset: (x: 5pt, y: 5pt),
    fill: raster-fuellung,
    table.header(strong[ID], strong[Anforderung], strong[Attribute]),
    ..zeilen.map(e => (
      [#text(size: 8.5pt, weight: "bold", e.uid)#label(e.ref)],
      md(e.markup),
      attr-zelle(e),
    )).flatten(),
  )
}

// ── Inhalt ────────────────────────────────────────────────────────────────────
#for doc in data.documents {
  heading(level: 1, [Dokument #doc.prefix#if doc.title != "" [ – #md(doc.title)]])
  if doc.items.len() == 0 {
    text(fill: grau)[Keine Anforderungen in der Auswahl.]
  }
  if tabellarisch {
    let zeilen = ()
    for e in doc.items {
      if e.kind == "heading" {
        if zeilen.len() > 0 { req-tabelle(zeilen); zeilen = () }
        kapitel(e.depth, e.level, md(e.markup), ziel: e.ref)
      } else {
        zeilen.push(e)
      }
    }
    if zeilen.len() > 0 { req-tabelle(zeilen) }
  } else {
    for e in doc.items {
      if e.kind == "heading" {
        kapitel(e.depth, e.level, md(e.markup), ziel: e.ref)
      } else {
        anforderung(e, md, attribute: true, kinder: true)
      }
    }
  }
}

// ── Anhänge (Reihenfolge fest: Trace, offene Punkte, Begriffe) ───────────────
#let anhaenge = ("trace", "offen", "glossar").filter(a => a in opt.appendices)
#for (i, a) in anhaenge.enumerate() {
  let buchstabe = numbering("A", i + 1)
  if a == "trace" {
    heading(level: 1, [Anhang #buchstabe: Trace-Tabelle])
    if data.trace.len() == 0 [Es gibt keine Verknüpfungen zwischen Anforderungen.] else [
      Übergeordnet ↔ untergeordnet; rot = Ziel liegt nicht in diesem Dokument.
      #v(0.4em)
      #raster((3.4cm, 2.4cm, 1fr), ([Anforderung], [Dokument], [Untergeordnet]),
        data.trace.map(t => (
          jump(t.parent), t.doc,
          if t.children.len() > 0 { jumps(t.children) } else { text(fill: warnorange)[— keine] },
        )))
    ]
  } else if a == "offen" {
    heading(level: 1, [Anhang #buchstabe: Offene Punkte])
    if data.open_points.len() == 0 [Keine offenen Punkte.] else {
      raster((3.4cm, 2.4cm, 1fr), ([Anforderung], [Dokument], [Offen]),
        data.open_points.map(o => (link(label(o.ref), o.uid), o.doc, o.reasons)))
    }
  } else if a == "glossar" {
    heading(level: 1, [Anhang #buchstabe: Begriffe und Abkürzungen])
    let g = data.glossary
    if g.documents.len() == 0 {
      text(fill: grau)[Kein Dokument ist als Glossar gekennzeichnet (Dokument-Eigenschaften → Dokumentenlenkung → Art „Glossar“).]
    } else if g.entries.len() == 0 [Das Glossar (#g.documents.join(", ")) enthält keine Einträge.] else {
      text(size: 8.5pt, fill: grau)[Quelle: #g.documents.join(", ")]
      v(0.2em)
      raster((4.6cm, 1fr), ([Begriff], [Erklärung]), g.entries.map(e => (strong(md(e.term)), md(e.markup))))
    }
  }
}
