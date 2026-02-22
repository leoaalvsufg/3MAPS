import { useState } from 'react';
import { OnboardingTour } from './OnboardingTour';

const STORAGE_KEY = 'onboardingCompleted';

function shouldShowOnboarding(): boolean {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [showTour, setShowTour] = useState(() => shouldShowOnboarding());

  const handleComplete = () => {
    markOnboardingComplete();
    setShowTour(false);
  };

  return (
    <>
      {children}
      {showTour && <OnboardingTour onComplete={handleComplete} />}
    </>
  );
}
