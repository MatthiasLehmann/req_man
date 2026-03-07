/**
 * Vordefinierte Hilfetexte für alle Standard-Doorstop-Attribute.
 * Werden im ItemEditor als Tooltips angezeigt.
 */

export interface DoorstopAttrHelp {
  title: string;
  text: string;
}

export const DOORSTOP_HELP: Record<string, DoorstopAttrHelp> = {
  uid: {
    title: 'Eindeutige Kennung (UID)',
    text:
      'Automatisch vergebene, unveränderliche ID der Anforderung (z.B. REQ-001). ' +
      'Das Präfix entspricht dem Dokumentkürzel, die Nummer wird beim Anlegen automatisch vergeben. ' +
      'UIDs dürfen nicht manuell geändert werden, da sie als stabiler Ankerpunkt für Verlinkungen dienen.',
  },
  level: {
    title: 'Gliederungsebene (Level)',
    text:
      'Bestimmt die Position und Hierarchie der Anforderung innerhalb des Dokuments (z.B. "1", "1.1", "2.3.1"). ' +
      'Ganzzahlige Ebenen (z.B. "1.0") werden als Hauptabschnitte behandelt. ' +
      'Die Sortierung der Anforderungsliste richtet sich nach dieser Ebene.',
  },
  active: {
    title: 'Aktiv-Status',
    text:
      'Gibt an, ob eine Anforderung gültig und aktiv ist. ' +
      'Inaktive Anforderungen (z.B. veraltete oder abgelehnte) bleiben im System erhalten, ' +
      'werden aber bei Validierungen, Metriken und Berichten nicht berücksichtigt. ' +
      'Dies ermöglicht ein sauberes Change-Management ohne Datenverlust.',
  },
  normative: {
    title: 'Normativ / Informativ',
    text:
      'Normative Anforderungen sind verbindlich und MÜSSEN im System erfüllt werden (entspricht "SHALL"). ' +
      'Nicht-normative (informative) Einträge sind erläuternde Hinweise, Ratschläge oder Hintergrundinfos ' +
      'ohne technische Verbindlichkeit. ' +
      'Doorstop prüft fehlende Verlinkungen nur bei normativen Anforderungen.',
  },
  derived: {
    title: 'Abgeleitet (Derived)',
    text:
      'Abgeleitete Anforderungen wurden aus übergeordneten Anforderungen hergeleitet ' +
      'und benötigen keine direkten Verlinkungen nach oben (z.B. zu Systemanforderungen). ' +
      'Doorstop unterdrückt bei abgeleiteten Anforderungen Warnungen über fehlende Parent-Links. ' +
      'Typischerweise werden Detailanforderungen oder Implementierungsdetails als "derived" markiert.',
  },
  header: {
    title: 'Abschnittsüberschrift (Header)',
    text:
      'Markiert diesen Eintrag als reine Abschnittsüberschrift ohne eigenen Anforderungsinhalt. ' +
      'Abschnitte strukturieren das Dokument, sind aber selbst keine normativen Anforderungen ' +
      'und werden bei der Traceability-Analyse nicht berücksichtigt. ' +
      'Der Text eines Abschnitts dient als Überschrift für die nachfolgenden Anforderungen.',
  },
  links: {
    title: 'Verlinkungen (Links)',
    text:
      'Verlinkungen zu Anforderungen in anderen Dokumenten (z.B. SYS-001, SPEC-042). ' +
      'Links bilden die Grundlage der Traceability: Sie zeigen, welche übergeordneten ' +
      'Anforderungen durch diese Anforderung abgedeckt werden. ' +
      'Normative Anforderungen ohne Links erzeugen Warnungen bei der Doorstop-Validierung. ' +
      'Format: Präfix-Nummer (z.B. REQ-001). Mehrere Links möglich.',
  },
  reviewed: {
    title: 'Review-Status',
    text:
      'Kryptographischer Hash-Wert (SHA-1) des letzten genehmigten Anforderungsinhalts. ' +
      'Sobald der Inhalt (Text, Links oder Attribute) nach einem abgeschlossenen Review geändert wird, ' +
      'weicht der aktuelle Hash vom gespeicherten ab – die Anforderung gilt dann als "nicht reviewed". ' +
      'Das Review muss in diesem Fall wiederholt und mit "doorstop review" neu gesetzt werden.',
  },
  text: {
    title: 'Anforderungstext',
    text:
      'Der eigentliche Inhalt der Anforderung im Markdown-Format. ' +
      'Normative Anforderungen sollten eindeutige, testbare Formulierungen enthalten ' +
      '(z.B. "Das System SHALL …"). ' +
      'Markdown unterstützt: Überschriften (#), Fettschrift (**), Listen (- oder 1.), ' +
      'Tabellen, Code-Blöcke und Links. ' +
      'Der Text wird für den Review-Hash herangezogen.',
  },
};

/**
 * Gibt den Hilfetext für ein Standard-Doorstop-Attribut zurück,
 * oder undefined, wenn keiner vorhanden ist.
 */
export function getDoorstopHelp(key: string): DoorstopAttrHelp | undefined {
  return DOORSTOP_HELP[key];
}
