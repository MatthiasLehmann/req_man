/**
 * TipTap React-NodeView für lokale Bildreferenzen.
 *
 * Zeigt ein Status-Badge, wenn die Datei geändert wurde oder fehlt:
 *   ⚠ Datei geändert  – gelb
 *   ✗ Datei fehlt     – rot
 */

import { NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { checkLocalFiles } from '../../api/client';

type FileStatus = 'loading' | 'ok' | 'changed' | 'missing' | 'forbidden' | 'remote';

export default function LocalImageView({ node }: ReactNodeViewProps) {
  const attrs = node.attrs as Record<string, string | undefined>;
  const src = attrs['src'] ?? '';
  const alt = attrs['alt'];
  const localPath = attrs['data-local-path'];
  const storedHash = attrs['data-hash'];

  const [status, setStatus] = useState<FileStatus>(localPath ? 'loading' : 'remote');

  useEffect(() => {
    if (!localPath || !storedHash) {
      setStatus('remote');
      return;
    }
    let cancelled = false;
    checkLocalFiles([{ path: localPath, hash: storedHash }])
      .then((res) => {
        if (!cancelled) setStatus((res.data[0]?.status as FileStatus) ?? 'ok');
      })
      .catch(() => {
        if (!cancelled) setStatus('ok');
      });
    return () => { cancelled = true; };
  }, [localPath, storedHash]);

  const badge =
    status === 'changed'
      ? { text: '⚠ Datei geändert', cls: 'bg-yellow-400 text-yellow-900' }
      : status === 'missing' || status === 'forbidden'
        ? { text: '✗ Datei fehlt', cls: 'bg-red-500 text-white' }
        : null;

  return (
    <NodeViewWrapper className="relative inline-block max-w-full my-1">
      <img
        src={src}
        alt={alt ?? ''}
        className="max-w-full rounded"
        style={{ display: 'block' }}
      />
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
