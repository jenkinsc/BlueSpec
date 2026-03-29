import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.js';

interface Template {
  id: string;
  name: string;
  frequency: string;
  mode: string;
  region: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function TemplateCard({
  template,
  onDelete,
}: {
  template: Template;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{template.name}</p>
        <p className="text-xs text-gray-500 font-mono mt-0.5">
          {template.frequency} MHz · {template.mode}
          {template.region ? ` · ${template.region}` : ''}
        </p>
        {template.notes && (
          <p className="text-xs text-gray-400 mt-1 truncate">{template.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate(`/templates/${template.id}/edit`)}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1"
        >
          Edit
        </button>
        {confirming ? (
          <>
            <button
              onClick={() => { setConfirming(false); onDelete(); }}
              className="text-xs font-medium text-red-600 hover:text-red-800"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export function TemplateListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: templates, isLoading, isError } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: () => apiFetch<Template[]>('/api/templates'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-gray-900">Net Templates</h1>
        <button
          onClick={() => navigate('/templates/new')}
          className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700"
        >
          <span className="text-base leading-none">+</span> New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading && (
          <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
        )}
        {isError && (
          <p className="text-sm text-red-500 text-center py-8">Failed to load templates.</p>
        )}
        {!isLoading && !isError && templates?.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">
            No templates yet. Create one to quickly populate the new-net form.
          </p>
        )}
        {templates && templates.length > 0 && (
          <div className="space-y-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onDelete={() => deleteMutation.mutate(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
