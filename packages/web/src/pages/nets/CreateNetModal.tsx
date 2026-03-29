import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.js';

const MODES = ['FM', 'SSB', 'CW', 'DMR', 'D-STAR', 'FT8', 'other'] as const;

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  frequency: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Enter a decimal frequency, e.g. 146.520'),
  mode: z.enum(MODES).default('FM'),
  schedule: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface NetRow {
  id: string;
  name: string;
  frequency: number;
  mode: string;
  schedule: string | null;
  netControl: string;
  status: 'draft' | 'open' | 'closed';
  openedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  onClose: () => void;
  onCreated: (net: NetRow) => void;
}

export function CreateNetModal({ onClose, onCreated }: Props) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'FM' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiFetch<NetRow>('/api/nets', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: (net) => {
      void queryClient.invalidateQueries({ queryKey: ['nets'] });
      onCreated(net);
    },
    onError: (err) => {
      setError('root', {
        message: err instanceof Error ? err.message : 'Failed to create net',
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">New Net</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Net Name
            </label>
            <input
              {...register('name')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Sunday Net"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          {/* Frequency + Mode row */}
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
                <p className="mt-1 text-xs text-red-600">
                  {errors.frequency.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mode
              </label>
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

          {/* Schedule (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schedule{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              {...register('schedule')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Sundays 20:00 local"
            />
          </div>

          {errors.root && (
            <p className="text-sm text-red-600">{errors.root.message}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
              className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating…' : 'Create Net'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
