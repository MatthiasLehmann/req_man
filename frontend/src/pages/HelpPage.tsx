import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, ChevronRight, Menu, X } from 'lucide-react';
import workflowDoc from '../docs/workflow.md?raw';
import clsx from 'clsx';

// ─── Table of Contents ───────────────────────────────────────────────────────

interface TocEntry {
  id: string;
  level: number;
  text: string;
}

function buildToc(markdown: string): TocEntry[] {
  const lines = markdown.split('\n');
  const toc: TocEntry[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      toc.push({
        id: slugify(m[2]),
        level: m[1].length,
        text: m[2].replace(/[*_`]/g, ''),
      });
    }
  }
  return toc;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: 'a', ö: 'o', ü: 'u' }[c] ?? c))
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// ─── Heading renderer with anchor IDs ────────────────────────────────────────

function HeadingWithAnchor({
  level,
  children,
}: {
  level: number;
  children?: React.ReactNode;
}) {
  const text = extractText(children);
  const id = slugify(text);
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return (
    <Tag id={id} className="scroll-mt-6">
      {children}
    </Tag>
  );
}

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (typeof children === 'object' && children !== null && 'props' in (children as object)) {
    return extractText((children as React.ReactElement).props.children);
  }
  return '';
}

// ─── TOC Sidebar ──────────────────────────────────────────────────────────────

function TableOfContents({
  entries,
  activeId,
  onClose,
}: {
  entries: TocEntry[];
  activeId: string;
  onClose?: () => void;
}) {
  return (
    <nav className="space-y-0.5">
      {onClose && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Inhaltsverzeichnis
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!onClose && (
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Inhaltsverzeichnis
        </div>
      )}
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          onClick={onClose}
          className={clsx(
            'block text-sm py-1 transition-colors rounded px-2',
            entry.level === 1 && 'font-medium',
            entry.level === 2 && 'pl-4',
            entry.level === 3 && 'pl-7 text-xs',
            activeId === entry.id
              ? 'text-primary-600 bg-primary-50 font-medium'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          )}
        >
          {entry.text}
        </a>
      ))}
    </nav>
  );
}

// ─── HelpPage ─────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [activeId, setActiveId] = useState('');
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const toc = buildToc(workflowDoc);

  // Highlight active TOC entry on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0% -70% 0%', threshold: 0 }
    );

    const headings =
      contentRef.current?.querySelectorAll('h1[id], h2[id], h3[id]') ?? [];
    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const markdownComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <HeadingWithAnchor level={1}>{children}</HeadingWithAnchor>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <HeadingWithAnchor level={2}>{children}</HeadingWithAnchor>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <HeadingWithAnchor level={3}>{children}</HeadingWithAnchor>
    ),
  };

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Hilfe & Dokumentation</h1>
              <p className="text-sm text-gray-500">
                Workflow für Anforderungen · Review
              </p>
            </div>
          </div>
          {/* Mobile TOC toggle */}
          <button
            className="lg:hidden flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
            onClick={() => setMobileTocOpen(true)}
          >
            <Menu className="w-4 h-4" />
            Inhalt
          </button>
        </div>
      </div>

      {/* Mobile TOC Overlay */}
      {mobileTocOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileTocOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-xl p-5 overflow-y-auto">
            <TableOfContents
              entries={toc}
              activeId={activeId}
              onClose={() => setMobileTocOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main layout: TOC + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop TOC */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50">
          <div className="p-5 sticky top-0">
            <TableOfContents entries={toc} activeId={activeId} />
          </div>
        </aside>

        {/* Markdown content */}
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto bg-white"
        >
          <div className="max-w-4xl mx-auto px-8 py-8">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-6">
              <span>Hilfe</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-gray-600 font-medium">
                Workflow: Anforderungen · Review
              </span>
            </nav>

            {/* Rendered Markdown */}
            <article
              className="
                prose prose-sm sm:prose-base
                prose-headings:font-semibold prose-headings:text-gray-900
                prose-h1:text-2xl prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-3
                prose-h2:text-xl prose-h2:mt-10 prose-h2:border-b prose-h2:border-gray-100 prose-h2:pb-2
                prose-h3:text-base prose-h3:mt-6
                prose-p:text-gray-700 prose-p:leading-relaxed
                prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline
                prose-code:text-primary-700 prose-code:bg-primary-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-xl prose-pre:shadow-md
                prose-table:text-sm
                prose-thead:bg-gray-50
                prose-th:font-semibold prose-th:text-gray-700 prose-th:px-3 prose-th:py-2
                prose-td:px-3 prose-td:py-2 prose-td:text-gray-600
                prose-tr:border-b prose-tr:border-gray-100
                prose-blockquote:border-l-4 prose-blockquote:border-primary-400 prose-blockquote:bg-primary-50 prose-blockquote:py-1 prose-blockquote:not-italic prose-blockquote:text-gray-700
                prose-strong:text-gray-900
                prose-li:text-gray-700
                max-w-none
              "
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {workflowDoc}
              </ReactMarkdown>
            </article>

            {/* Footer */}
            <div className="mt-16 pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
              <span>ReqMan Dokumentation · Stand: 2026-03-08</span>
              <a
                href="#workflow-anforderungen--review--validierung"
                className="hover:text-gray-600 transition-colors"
              >
                ↑ Nach oben
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
