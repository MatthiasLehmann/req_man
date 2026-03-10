/**
 * TipTap React-NodeView für lokale Bildreferenzen.
 *
 * Problem: <img src="/api/localfile?..."> sendet keine Auth-Header → 401.
 * Lösung: Bild via Axios als Blob laden (inkl. Bearer-Token), Blob-URL rendern.
 *         X-File-Status-Header aus der Response zeigt Änderungs-/Fehlerstatus.
 *
 * Badges:
 *   ⚠ Datei geändert  – gelb
 *   ✗ Datei fehlt     – rot
 */

import { NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import api from '../../api/client';

type FileStatus = 'loading' | 'ok' | 'changed' | 'missing' | 'forbidden' | 'remote';

export default function LocalImageView({ node }: ReactNodeViewProps) {
  const attrs = node.attrs as Record<string, string | undefined>;
  const src = attrs['src'] ?? '';
  const alt = attrs['alt'];
  const localPath = attrs['data-local-path'];
  const storedHash = attrs['data-hash'];

  const [status, setStatus] = useState<FileStatus>(localPath ? 'loading' : 'remote');
  const [imgSrc, setImgSrc] = useState<string>(localPath ? '' : src);
  const blobUrlRef = useRef<string>('');

  useEffect(() => {
    if (!localPath || !storedHash) {
      // Normales Remote-Bild: src direkt verwenden
      setStatus('remote');
      setImgSrc(src);
      return;
    }

    let cancelled = false;

    const url = `/localfile?path=${encodeURIComponent(localPath)}&h=${encodeURIComponent(storedHash)}`;

    api
      .get(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;

        // X-File-Status aus Response-Header lesen
        const fileStatus = (res.headers['x-file-status'] as FileStatus) ?? 'ok';
        setStatus(fileStatus);

        // Blob-URL erzeugen und als img.src verwenden
        const blob: Blob = res.data;
        const newBlobUrl = URL.createObjectURL(blob);

        // Alten Blob-URL freigeben
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = newBlobUrl;

        setImgSrc(newBlobUrl);
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });

    return () => {
      cancelled = true;
    };
  }, [localPath, storedHash, src]);

  // Blob-URL beim Unmount freigeben
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const badge =
    status === 'changed'
      ? { text: '⚠ Datei geändert', cls: 'bg-yellow-400 text-yellow-900' }
      : status === 'missing' || status === 'forbidden'
        ? { text: '✗ Datei fehlt', cls: 'bg-red-500 text-white' }
        : null;

  return (
    <NodeViewWrapper className="relative inline-block max-w-full my-1">
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={alt ?? ''}
          className="max-w-full rounded"
          style={{ display: 'block' }}
        />
      ) : status === 'loading' ? (
        /* Platzhalter während Laden */
        <div className="w-40 h-24 bg-gray-100 rounded animate-pulse flex items-center justify-center">
          <span className="text-xs text-gray-400">Lädt…</span>
        </div>
      ) : null}

      {badge && (
        <span
          className={`absolute top-1 left-1 text-xs px-1.5 py-0.5 rounded font-medium leading-none ${badge.cls}`}
        >
          {badge.text}
        </span>
      )}

      {localPath && (
        <span className="block text-xs text-gray-400 truncate mt-0.5 max-w-full" title={localPath}>
          {localPath.split('/').pop()}
        </span>
      )}
    </NodeViewWrapper>
  );
}
