import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../lib/auth.tsx';
import { useNavigate, Link } from 'react-router-dom';

const schema = z.object({
  callsign: z.string().min(3, 'Enter your callsign'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { login, loginDemo } = useAuth();
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      await login(values.callsign, values.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Login failed',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-8">EmComm Net Control</h1>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white shadow rounded-lg p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Callsign</label>
            <input
              {...register('callsign')}
              autoCapitalize="characters"
              autoComplete="username"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="W1AW"
            />
            {errors.callsign && (
              <p className="mt-1 text-xs text-red-600">{errors.callsign.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              {...register('password')}
              type="password"
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>
          {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600 mb-3">
            No account?{' '}
            <Link to="/register" className="font-medium text-indigo-600 hover:underline">
              Sign up
            </Link>
          </p>
          <p className="text-xs text-gray-400 mb-2">Want to explore without signing up?</p>
          {demoError && <p className="text-xs text-red-600 mb-2">{demoError}</p>}
          <button
            onClick={async () => {
              setDemoLoading(true);
              setDemoError(null);
              try {
                await loginDemo();
                navigate('/', { replace: true });
              } catch (err) {
                setDemoError(err instanceof Error ? err.message : 'Demo failed');
              } finally {
                setDemoLoading(false);
              }
            }}
            disabled={demoLoading}
            className="text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50"
          >
            {demoLoading ? 'Starting demo…' : 'Try Demo →'}
          </button>
        </div>
      </div>
    </div>
  );
}
