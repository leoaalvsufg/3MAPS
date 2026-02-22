import { Brain } from 'lucide-react';
import { InputPanel } from '@/components/generation/InputPanel';

export function HomePage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex flex-col items-center px-4 py-10 sm:py-16 min-h-full">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Brain className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">Pergunte Qualquer Coisa</h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-lg">
            Pesquise sobre qualquer tópico ou ideia de brainstorm e gere um mapa mental completo com IA.
          </p>
        </div>

        {/* Input Panel */}
        <InputPanel />
      </div>
    </div>
  );
}

