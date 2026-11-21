// Lastenheft-Vorlage für ReqMan (B3). Die Daten kommen als data.json aus typst_service.py.
#let data = json("data.json")

#set document(title: data.title)
#set text(lang: "de", size: 10.5pt)
#set page(
  paper: "a4",
  margin: (x: 2.2cm, top: 2.4cm, bottom: 2.2cm),
  header: context {
    if counter(page).get().first() > 1 [
      #set text(size: 8.5pt, fill: luma(110))
      #data.title #h(1fr) #data.subtitle
      #line(length: 100%, stroke: 0.4pt + luma(180))
    ]
  },
  footer: context {
    if counter(page).get().first() > 1 [
      #set text(size: 8.5pt, fill: luma(110))
      Stand #data.stand #h(1fr) Seite #counter(page).display() von #counter(page).final().first()
    ]
  },
)
#set par(justify: true, leading: 0.62em)
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  v(0.4em)
  text(size: 17pt, weight: "bold", it.body)
  v(0.3em)
}
#show heading.where(level: 2): set text(size: 13pt)
#show heading.where(level: 3): set text(size: 11.5pt)
#show link: set text(fill: rgb("#1d4ed8"))

#let jump(r) = if r.ok { link(label(r.ref), r.uid) } else { text(fill: rgb("#b91c1c"), r.uid) }
#let jumps(list) = list.map(jump).join(", ")
#let md(s) = eval(s, mode: "markup")

// ── Titelblatt ────────────────────────────────────────────────────────────────
#page(header: none, footer: none)[
  #v(5cm)
  #text(size: 30pt, weight: "bold", data.title)
  #v(0.2cm)
  #text(size: 16pt, fill: luma(90), data.subtitle)
  #v(0.6cm)
  #line(length: 40%, stroke: 1.2pt + rgb("#1d4ed8"))
  #v(0.6cm)
  #set text(size: 11pt)
  #grid(
    columns: (3.2cm, 1fr), row-gutter: 0.7em,
    [*Stand*], data.stand,
    [*Git-Stand*], if data.git != none { data.git } else { [kein Git-Repository] },
    [*Dokumente*], data.documents_label,
    [*Anforderungen*], str(data.counts.anforderungen),
  )
]

#outline(title: [Inhaltsverzeichnis], depth: 3)

// ── Dokumente ─────────────────────────────────────────────────────────────────
#for doc in data.documents {
  [= Dokument #doc.prefix]
  for e in doc.items {
    if e.kind == "heading" {
      heading(level: e.depth)[#e.level #md(e.markup)]
    } else {
      block(breakable: false, width: 100%, above: 0.9em, below: 0.9em, {
        grid(
          columns: (2.9cm, 1fr), column-gutter: 0.6cm,
          {
            [#text(size: 8.5pt, weight: "bold", font: "DejaVu Sans Mono")[#e.uid]#label(e.ref)]
            if e.level != "" { linebreak(); text(size: 7.5pt, fill: luma(120))[Ebene #e.level] }
          },
          {
            md(e.markup)
            let notes = ()
            if not e.normative { notes.push("nicht normativ") }
            if e.derived { notes.push("abgeleitet") }
            notes.push(e.status)
            v(0.15em)
            text(size: 8pt, fill: luma(110))[Status: #notes.join(", ")]
            if e.parents.len() > 0 {
              linebreak()
              text(size: 8.5pt)[Übergeordnet: #jumps(e.parents)]
            }
          },
        )
        line(length: 100%, stroke: 0.3pt + luma(210))
      })
    }
  }
}

// ── Anhang A: Trace-Tabelle ───────────────────────────────────────────────────
#pagebreak(weak: true)
= Anhang A: Trace-Tabelle
#if data.trace.len() == 0 [Es gibt keine Verknüpfungen zwischen Anforderungen.] else [
  Eltern ↔ Kinder; rot = Ziel liegt nicht in diesem Dokument.
  #v(0.4em)
  #table(
    columns: (3.4cm, 2.4cm, 1fr),
    stroke: 0.4pt + luma(190),
    inset: 5pt,
    fill: (_, y) => if y == 0 { luma(235) } else { none },
    table.header[*Eltern*][*Dokument*][*Kinder*],
    ..data.trace.map(t => (
      jump(t.parent), t.doc,
      if t.children.len() > 0 { jumps(t.children) } else { text(fill: rgb("#b45309"))[— keine Kinder] },
    )).flatten(),
  )
]

// ── Anhang B: Offene Punkte ───────────────────────────────────────────────────
= Anhang B: Offene Punkte
#if data.open_points.len() == 0 [Keine offenen Punkte.] else [
  #table(
    columns: (3.4cm, 2.4cm, 1fr),
    stroke: 0.4pt + luma(190),
    inset: 5pt,
    fill: (_, y) => if y == 0 { luma(235) } else { none },
    table.header[*Anforderung*][*Dokument*][*Offen*],
    ..data.open_points.map(o => (link(label(o.ref), o.uid), o.doc, o.reasons)).flatten(),
  )
]
