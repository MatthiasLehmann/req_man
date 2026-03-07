import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, CheckCircle, Circle, AlertCircle, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { listItems, createItem, deleteItem } from '../../api/client';
import { Item } from '../../types';
import { useAuthStore } from '../../store/authStore';

interface Props {
  projectId: string;
  prefix: string;
  selectedUid: string | null;
  onSelectItem: (uid: string) => void;
}

export default function ItemList({ projectId, prefix, selectedUid, onSelectItem }: Props) {
  const { user } = useAuthStore();
  const canEdit = user?.role !== 'viewer';
  const qc = useQueryClient();

  const { data: itemsRes, isLoading } = useQuery({
    queryKey: ['items', projectId, prefix],
    queryFn: () => listItems(projectId, prefix),
    enabled: !!prefix,
  });
  const items: Item[] = itemsRes?.data || [];

  const [filter, setFilter] = useState('');

  const createMut = useMutation({
    mutationFn: () => createItem(projectId, prefix, { text: '', normative: true, active: true }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['items', projectId, prefix] });
      toast.success(`${res.data.uid} erstellt`);
      onSelectItem(res.data.uid);
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Fehler beim Erstellen'),
  });

  const deleteMut = useMutation({
    mutationFn: (uid: string) => deleteItem(projectId, uid),
    onSuccess: (_, uid) => {
      qc.invalidateQueries({ queryKey: ['items', projectId, prefix] });
      toast.success(`${uid} gelöscht`);
      if (selectedUid === uid) onSelectItem('');
    },
    onError: () => toast.error('Fehler beim Löschen'),
  });

  const filtered = items.filter((item) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      item.uid.toLowerCase().includes(q) ||
      item.text.toLowerCase().includes(q) ||
      item.level.includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Suchen..."
          className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-400"
        />
        {canEdit && (
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="btn-primary text-xs py-1 px-2"
            title="Neue Anforderung"
          >
            {createMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Count */}
      <div className="px-3 py-1 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
        {filtered.length} von {items.length} Anforderungen
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {filter ? 'Keine Treffer' : 'Keine Anforderungen'}
          </div>
        ) : (
          filtered.map((item) => (
            <ItemRow
              key={item.uid}
              item={item}
              isSelected={selectedUid === item.uid}
              onClick={() => onSelectItem(item.uid)}
              onDelete={canEdit ? () => {
                if (confirm(`${item.uid} löschen?`)) deleteMut.mutate(item.uid);
              } : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: Item;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: () => void;
}

function ItemRow({ item, isSelected, onClick, onDelete }: ItemRowProps) {
  const textPreview = item.text.replace(/<[^>]*>/g, '').slice(0, 80);

  return (
    <div
      className={clsx(
        'flex items-start gap-2 px-3 py-2.5 border-b border-gray-100 cursor-pointer group transition-colors',
        isSelected ? 'bg-primary-50 border-l-2 border-l-primary-500' : 'hover:bg-gray-50'
      )}
      onClick={onClick}
    >
      <div className="shrink-0 mt-0.5">
        {!item.active ? (
          <Circle className="w-3.5 h-3.5 text-gray-300" />
        ) : item.reviewed ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={clsx(
            'text-xs font-mono font-semibold',
            isSelected ? 'text-primary-700' : 'text-gray-600'
          )}>
            {item.uid}
          </span>
          <span className="text-xs text-gray-400">{item.level}</span>
          {item.header && (
            <span className="badge-gray text-xs">Abschnitt</span>
          )}
          {!item.normative && (
            <span className="badge-yellow text-xs">Info</span>
          )}
          {item.links.length > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-blue-500">
              <Tag className="w-3 h-3" />
              {item.links.length}
            </span>
          )}
        </div>
        {textPreview && (
          <p className="text-xs text-gray-500 truncate leading-relaxed">
            {textPreview}
          </p>
        )}
      </div>

      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-0.5 transition-opacity shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
