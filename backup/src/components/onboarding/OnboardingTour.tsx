import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface TourStep {
  title: string;
  description: string;
}

const STEPS: TourStep[] = [
  {
    title: 'Bem-vindo ao 3Maps! 🧠',
    description: 'Vamos fazer um tour rápido para você conhecer as principais funcionalidades.',
  },
  {
    title: 'Área de entrada',
    description: 'Digite qualquer tópico ou pergunta aqui para gerar um mapa mental com IA.',
  },
  {
    title: 'Templates',
    description: 'Escolha um template para personalizar o tipo de mapa gerado.',
  },
  {
    title: 'Barra lateral',
    description: 'Acesse seus mapas salvos, tags e configurações pela barra lateral.',
  },
  {
    title: 'Tudo pronto! 🚀',
    description: 'Tudo pronto! Comece gerando seu primeiro mapa mental.',
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Tour de boas-vindas"
    >
      {/* Modal */}
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 flex flex-col gap-6">
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 text-center">
          <h2 className="text-xl font-bold text-foreground">{current.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
        </div>

        {/* Step counter */}
        <p className="text-xs text-muted-foreground text-center">
          {step + 1}/{STEPS.length}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button onClick={handleNext} className="w-full">
            {isLast ? 'Começar' : 'Próximo'}
          </Button>
          {!isLast && (
            <button
              onClick={onComplete}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 text-center"
            >
              Pular tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
