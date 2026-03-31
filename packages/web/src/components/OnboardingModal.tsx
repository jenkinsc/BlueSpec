import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ONBOARDING_KEY = 'onboarding_complete';

export function useOnboarding() {
  const complete = localStorage.getItem(ONBOARDING_KEY) === 'true';
  return {
    isComplete: complete,
    markComplete: () => localStorage.setItem(ONBOARDING_KEY, 'true'),
  };
}

const STEPS = [
  {
    title: 'Create your organization',
    description:
      'Organizations let you scope your nets and incidents to your ARES group. Head to the Org tab to create your first one.',
    action: '/org',
    actionLabel: 'Go to Org →',
  },
  {
    title: 'Invite your first member',
    description: 'Once you have an org, invite other operators by email from the Org page.',
    action: '/org',
    actionLabel: 'Go to Org →',
  },
  {
    title: 'Open your first net',
    description:
      'Ready to go on air? Create a net from the Nets tab, then open it to start accepting check-ins.',
    action: '/',
    actionLabel: 'Go to Nets →',
  },
];

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleAction = () => {
    onClose();
    navigate(current.action);
  };

  const handleSkip = () => {
    if (isLast) {
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`inline-block w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <h2 className="text-base font-semibold text-gray-900 mb-2">
          Step {step + 1}: {current.title}
        </h2>
        <p className="text-sm text-gray-500 mb-6">{current.description}</p>

        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            {isLast ? 'Done' : 'Skip'}
          </button>
          <button
            onClick={handleAction}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            {current.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
