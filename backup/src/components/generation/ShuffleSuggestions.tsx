import { useState, useCallback } from 'react';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUGGESTIONS } from '@/lib/constants';

interface ShuffleSuggestionsProps {
  onSelect: (suggestion: string) => void;
}

function getRandomSuggestions(count = 4): string[] {
  const shuffled = [...SUGGESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function ShuffleSuggestions({ onSelect }: ShuffleSuggestionsProps) {
  const [suggestions, setSuggestions] = useState(() => getRandomSuggestions());

  const shuffle = useCallback(() => {
    setSuggestions(getRandomSuggestions());
  }, []);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">Sugestões</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={shuffle}
          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <Shuffle className="h-3 w-3" />
          Embaralhar
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSelect(suggestion)}
            className="text-left px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors text-sm text-foreground/80 hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

