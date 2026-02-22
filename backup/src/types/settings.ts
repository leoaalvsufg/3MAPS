export type LLMProvider = 'openrouter' | 'openai';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  contextWindow: number;
  description: string;
}

export interface SettingsState {
  /** Used for server-side file persistence under DATA_DIR/users/<username>/... */
  username: string;
  openrouterApiKey: string;
  openaiApiKey: string;
  replicateApiKey: string;
  provider: LLMProvider;
  selectedModel: string;
  theme: ThemeMode;
  generateImages: boolean;
  language: string;
}

