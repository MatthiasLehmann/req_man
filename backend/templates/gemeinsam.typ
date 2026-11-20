// Gemeinsames Grundgerüst der ReqMan-Berichte (E1). Nutzung in einer Vorlage:
//
//   #import "gemeinsam.typ": *
//   #let data = json("data.json")
//   #let md = markup.with(images: data.images)
//   #show: grundlayout.with(titel: data.title, kopf-rechts: data.subtitle, fuss-links: [Stand #data.stand])
//
// Bausteine: grundlayout (Seite, Schrift, Kopf-/Fußzeile, Überschriften), deckblatt, markup (Text mit
// Bildern und Tabellen), kapitel (nummerierte Überschrift), anforderung (Anforderungsblock),
// jump/jumps (Sprungmarken), raster (Tabellenstil), attribute-liste.

// ── Farben und Schrift ────────────────────────────────────────────────────────
#let akzent = rgb("#1d4ed8")
#let warnrot = rgb("#b91c1c")
#let warnorange = rgb("#b45309")
#let grau = luma(110)
#let linie = luma(210)
// Mitgelieferte Schrift (templates/fonts, SIL OFL 1.1); Rückfall auf die in Typst eingebauten Schriften.
#let schrift = ("Liberation Sans", "Libertinus Serif")

// ── Seite, Schrift, Kopf-/Fußzeile ────────────────────────────────────────────
// kopf-links/-rechts und fuss-links: Inhalt der Kopf-/Fußzeile ab Seite `ab-seite`.
// fuss-rechts: Funktion (seite, gesamt) => Inhalt; Standard „Seite x von y“.
#let grundlayout(
  titel: "",
  kopf-links: none,
  kopf-rechts: none,
  fuss-links: none,
  fuss-rechts: (s, n) => [Seite #s von #n],
  ab-seite: 2,
  papier: "a4",
  quer: false,
  rand: (x: 2.2cm, top: 2.4cm, bottom: 2.2cm),
  groesse: 10.5pt,
  body,
) = {
  set document(title: titel)
  set text(lang: "de", size: groesse, font: schrift)
  set page(
    paper: papier,
    flipped: quer,
    margin: rand,
    header: context {
      if counter(page).get().first() >= ab-seite [
        #set text(size: 8.5pt, fill: grau)
        #(if kopf-links == none { titel } else { kopf-links }) #h(1fr) #kopf-rechts
        #line(length: 100%, stroke: 0.4pt + luma(180))
      ]
    },
    footer: context {
      if counter(page).get().first() >= ab-seite [
        #set text(size: 8.5pt, fill: grau)
        #fuss-links #h(1fr) #fuss-rechts(counter(page).display(), counter(page).final().first())
      ]
    },
  )
  set par(justify: true, leading: 0.62em)
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(0.4em)
    block(text(size: 17pt, weight: "bold", {
      if it.numbering != none { numbering(it.numbering, ..counter(heading).get()); h(0.6em) }
      it.body
    }))
    v(0.3em)
  }
  show heading.where(level: 2): set text(size: 13pt)
  show heading.where(level: 3): set text(size: 11.5pt)
  show link: set text(fill: akzent)
  show raw: set text(font: ("DejaVu Sans Mono",), size: 0.9em)
  body
}

// ── Deckblatt ─────────────────────────────────────────────────────────────────
// felder: Array von (Bezeichnung, Wert)-Paaren; logo: Bildpfad im Satzordner oder none.
#let deckblatt(titel, untertitel: none, felder: (), logo: none, zusatz: none) = page(header: none, footer: none)[
  #if logo != none { align(right, image(logo, height: 1.8cm)) } else { v(1.8cm) }
  #v(3.2cm)
  #text(size: 30pt, weight: "bold", titel)
  #v(0.2cm)
  #if untertitel != none { text(size: 16pt, fill: luma(90), untertitel) }
  #v(0.6cm)
  #line(length: 40%, stroke: 1.2pt + akzent)
  #v(0.6cm)
  #set text(size: 11pt)
  #grid(
    columns: (3.2cm, 1fr), row-gutter: 0.7em,
    ..felder.map(((k, v)) => (strong(k), v)).flatten(),
  )
  #zusatz
]

// ── Sprungmarken ──────────────────────────────────────────────────────────────
// r = {uid, ref, ok}; ok = Ziel steht in diesem PDF, sonst rot ohne Link.
#let jump(r) = if r.ok { link(label(r.ref), r.uid) } else { text(fill: warnrot, r.uid) }
#let jumps(list) = list.map(jump).join(", ")

// ── Tabellen und Bilder im Anforderungstext ───────────────────────────────────
#let raster-fuellung = (_, y) => if y == 0 { luma(235) } else { none }

// Tabelle aus einem Anforderungstext (HTML- oder Markdown-Tabelle); Zellen kommen fertig gesetzt.
// Zellen nicht umhüllen – sonst erkennt table() `table.header`/`table.cell` nicht mehr.
#let tabelle(spalten, ..zellen) = block(width: 100%, above: 0.6em, below: 0.6em, {
  set par(justify: false)
  set text(size: 0.92em)
  table(
    columns: (auto,) * spalten,
    stroke: 0.4pt + luma(170),
    inset: (x: 4pt, y: 3pt),
    align: left + top,
    ..zellen,
  )
})

// Größte Bildhöhe im Text; breitere Bilder werden auf die Spaltenbreite verkleinert.
#let bild-max-hoehe = 9cm

// Bild aus data.images: {file, alt, ok, hint, source}. Fehlt die Datei → sichtbarer Hinweis.
#let abbildung(b) = {
  if b == none {
    text(fill: warnrot)[\[Bild fehlt\]]
  } else if b.ok and b.file != none {
    let alt = if b.alt != "" { b.alt } else { none }
    block(width: 100%, above: 0.6em, below: 0.6em, breakable: false, {
      layout(platz => {
        let natur = measure(image(b.file), width: platz.width)
        let img = if natur.height > bild-max-hoehe { image(b.file, height: bild-max-hoehe, alt: alt) }
                  else { image(b.file, alt: alt) }
        align(center, img)
      })
      if b.alt != "" { align(center, text(size: 8pt, fill: grau, b.alt)) }
    })
  } else {
    block(width: 100%, inset: 6pt, stroke: (paint: warnorange, thickness: 0.6pt, dash: "dashed"),
      text(size: 8.5pt, fill: warnorange)[
        *Bild nicht eingebettet:* #b.source #if b.hint != none [ – #b.hint]
        #if b.alt != "" [ (#b.alt)]
      ])
  }
}

// Fertiges Typst-Markup (aus typst_service.html_to_typst) setzen; Bilder über ihre ID auflösen.
#let markup(s, images: (:)) = eval(s, mode: "markup", scope: (
  bild: id => abbildung(images.at(id, default: none)),
  tabelle: tabelle,
))

// ── Überschriften mit Kapitelnummer ───────────────────────────────────────────
// Die Nummer ist die doorstop-Ebene (z. B. „2.1“), nicht Typsts Zähler – so stimmt sie mit ReqMan überein.
#let kapitel(tiefe, nummer, inhalt, ziel: none) = {
  let h = heading(level: tiefe, numbering: if nummer != "" { (..n) => nummer } else { none }, inhalt)
  if ziel != none [#h#label(ziel)] else { h }
}

// ── Eigene Attribute ──────────────────────────────────────────────────────────
// liste = [{name, markup}]; md = Markup-Funktion der Vorlage.
#let attribute-liste(liste, md) = if liste.len() > 0 {
  set text(size: 8.5pt)
  grid(columns: (auto, 1fr), column-gutter: 0.6em, row-gutter: 0.35em,
    ..liste.map(a => (text(fill: grau, md(a.name) + ":"), md(a.markup))).flatten())
}

// ── Anforderungsblock (Fließtext) ─────────────────────────────────────────────
// e = Anforderung aus build_data; md = Markup-Funktion; attribute/kinder = anzeigen ja/nein.
#let anforderung(e, md, attribute: true, kinder: false) = {
  let gross = e.images.len() > 0 or e.markup.contains("#tabelle(")
  block(breakable: gross, width: 100%, above: 0.9em, below: 0.9em, {
    grid(
      columns: (2.9cm, 1fr), column-gutter: 0.6cm,
      {
        [#text(size: 8.5pt, weight: "bold")[#e.uid]#label(e.ref)]
        if e.level != "" { linebreak(); text(size: 7.5pt, fill: luma(120))[Ebene #e.level] }
      },
      {
        md(e.markup)
        if attribute and e.at("attributes_markup", default: ()).len() > 0 {
          v(0.2em)
          attribute-liste(e.attributes_markup, md)
        }
        let notes = ()
        if not e.normative { notes.push("nicht normativ") }
        if e.derived { notes.push("abgeleitet") }
        notes.push(e.status)
        v(0.15em)
        text(size: 8pt, fill: grau)[Status: #notes.join(", ")]
        if e.parents.len() > 0 {
          linebreak()
          text(size: 8.5pt)[Übergeordnet: #jumps(e.parents)]
        }
        if kinder and e.at("children", default: ()).len() > 0 {
          linebreak()
          text(size: 8.5pt)[Untergeordnet: #jumps(e.children)]
        }
      },
    )
    line(length: 100%, stroke: 0.3pt + linie)
  })
}

// ── Einfache Tabelle für Anhänge ──────────────────────────────────────────────
#let raster(spalten, kopf, zeilen) = table(
  columns: spalten,
  stroke: 0.4pt + luma(190),
  inset: 5pt,
  fill: raster-fuellung,
  table.header(..kopf.map(k => strong(k))),
  ..zeilen.flatten(),
)
