// Lastenheft-Vorlage für ReqMan (B3, seit E1 auf gemeinsam.typ). Die Daten kommen als data.json aus typst_service.py.
#import "gemeinsam.typ": *
#let data = json("data.json")
#let md = markup.with(images: data.images)

#show: grundlayout.with(
  titel: data.title,
  kopf-rechts: data.subtitle,
  fuss-links: [Stand #data.stand],
)

// ── Titelblatt ────────────────────────────────────────────────────────────────
#deckblatt(data.title, untertitel: data.subtitle, felder: (
  ("Stand", data.stand),
  ("Git-Stand", if data.git != none { data.git } else { [kein Git-Repository] }),
  ("Dokumente", data.documents_label),
  ("Anforderungen", str(data.counts.anforderungen)),
))

#outline(title: [Inhaltsverzeichnis], depth: 3)

// ── Dokumente ─────────────────────────────────────────────────────────────────
#for doc in data.documents {
  [= Dokument #doc.prefix]
  for e in doc.items {
    if e.kind == "heading" {
      kapitel(e.depth, e.level, md(e.markup), ziel: e.ref)
    } else {
      anforderung(e, md, attribute: false)
    }
  }
}

// ── Anhang A: Trace-Tabelle ───────────────────────────────────────────────────
#pagebreak(weak: true)
= Anhang A: Trace-Tabelle
#if data.trace.len() == 0 [Es gibt keine Verknüpfungen zwischen Anforderungen.] else [
  Eltern ↔ Kinder; rot = Ziel liegt nicht in diesem Dokument.
  #v(0.4em)
  #raster((3.4cm, 2.4cm, 1fr), ([Eltern], [Dokument], [Kinder]),
    data.trace.map(t => (
      jump(t.parent), t.doc,
      if t.children.len() > 0 { jumps(t.children) } else { text(fill: warnorange)[— keine Kinder] },
    )))
]

// ── Anhang B: Offene Punkte ───────────────────────────────────────────────────
= Anhang B: Offene Punkte
#if data.open_points.len() == 0 [Keine offenen Punkte.] else [
  #raster((3.4cm, 2.4cm, 1fr), ([Anforderung], [Dokument], [Offen]),
    data.open_points.map(o => (link(label(o.ref), o.uid), o.doc, o.reasons)))
]
