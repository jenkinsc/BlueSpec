import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.js';

const MODES = ['FM', 'SSB', 'CW', 'DMR', 'D-STAR', 'FT8', 'other'] as const;

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  frequency: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Enter a decimal frequency, e.g. 146.520'),
  mode: z.enum(MODES).default('FM'),
  region: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Template {
  id: string;
  name: string;
  frequency: string;
  mode: string;
  region: string | null;
  notes: string | null;
}

export function TemplateFormPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const existingQuery = useQuery<Template>({
    queryKey: ['template', id],
    queryFn: () => apiFetch<Template>(`/api/templates/${id}`),
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'FM' },
  });

  useEffect(() => {
    if (existingQuery.data) {
      const t = existingQuery.data;
      reset({
        name: t.name,
        frequency: t.frequency,
        mode: t.mode as typeof MODES[number],
        region: t.region ?? '',
        notes: t.notes ?? '',
      });
    }
  }, [existingQuery.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (isEdit) {
        return apiFetch<Template>(`/api/templates/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(values),
        });
      }
      return apiFetch<Template>('/api/templates', {
        method: 'POST',
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      navigate('/templates');
    },
    onError: (err) => {
      setError('root', {
        message: err instanceof Error ? err.message : 'Save failed',
      });
    },
  });

  if (isEdit && existingQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (isEdit && existingQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-red-500 gap-2">
        <p>Failed to load template.</p>
        <button onClick={() => navigate('/templates')} className="text-indigo-600 hover:underline">
          Back to Templates
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button
          onClick={() => navigate('/templates')}
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Templates
        </button>
        <h1 className="text-xl font-semibold text-gray-900">
          {isEdit ? 'Edit Template' : 'New Template'}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4 max-w-md">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              {...register('name')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Sunday Net"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          {/* Frequency + Mode */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency (MHz)
              </label>
              <input
                {...register('frequency')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="146.520"
                inputMode="decimal"
              />
              {errors.frequency && (
                <p className="mt-1 text-xs text-red-600">{errors.frequency.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
              <select
                {...register('mode')}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Region */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Region <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              {...register('region')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="South, Region 4…"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Weekly net, check-in starts at 20:00 local…"
            />
          </div>

          {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => navigate('/templates')}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
              className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
