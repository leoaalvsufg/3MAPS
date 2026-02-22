import { useState, useRef, useEffect } from 'react';
import { X, Trash2, Send, Loader2, MessageSquare, Lock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { UpgradePrompt } from '@/components/monetization/UpgradePrompt';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUsageStore } from '@/stores/usage-store';
import { callLLMStream } from '@/services/llm/client';
import { getChatSystemPrompt, getSuggestionsPrompt } from '@/services/llm/prompts';
import { parseJSON } from '@/services/llm/client';
import type { SavedMap } from '@/types/mindmap';

interface ChatPanelProps {
  map: SavedMap;
  onClose: () => void;
}

export function ChatPanel({ map, onClose }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [chatLimitReached, setChatLimitReached] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const session = useChatStore((s) => s.getSession(map.id));
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const clearSession = useChatStore((s) => s.clearSession);
  const isLoading = useChatStore((s) => s.isLoading);
  const setLoading = useChatStore((s) => s.setLoading);
  const settings = useSettingsStore();
  const checkAction = useUsageStore((s) => s.checkAction);

  const messages = session?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (messages.length === 0 && map.analysis) {
      loadSuggestions();
    }
  }, []);

  const loadSuggestions = async () => {
    if (!settings.hasApiKey() || !map.analysis) return;
    setLoadingSuggestions(true);
    try {
      const prompt = getSuggestionsPrompt(map.title, map.analysis.subtopics);
      const result = await callLLMStream(
        [{ role: 'user', content: prompt }],
        { provider: settings.provider, apiKey: await settings.getActiveApiKey(), model: settings.selectedModel },
        () => {}
      );
      const parsed = parseJSON<string[]>(result);
      setSuggestions(parsed.slice(0, 3));
    } catch {
      setSuggestions([
        `Quais são os principais aspectos de ${map.title}?`,
        `Como posso aprofundar meu conhecimento sobre ${map.title}?`,
        `Quais são as aplicações práticas de ${map.title}?`,
      ]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading || !settings.hasApiKey()) return;

    // Check chat message limit before sending
    try {
      const check = await checkAction('chat_message', { mapId: map.id });
      if (!check.allowed) {
        setChatLimitReached(true);
        return;
      }
    } catch {
      // Fail open
    }

    setInput('');
    setSuggestions([]);

    addMessage(map.id, { role: 'user', content });
    const assistantId = addMessage(map.id, { role: 'assistant', content: '', isStreaming: true });

    setLoading(true);
    try {
      const analysis = map.analysis ?? {
        central_theme: map.title,
        subtopics: [],
        key_concepts: [],
        relationships: [],
        depth_level: 3,
        suggested_node_count: 20,
        suggested_tags: map.tags,
        template_context: map.template,
      };
      const systemPrompt = getChatSystemPrompt(map.title, analysis, map.article);
      const history = (session?.messages ?? []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      let accumulated = '';
      await callLLMStream(
        [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content }],
        { provider: settings.provider, apiKey: await settings.getActiveApiKey(), model: settings.selectedModel },
        (chunk) => {
          accumulated += chunk;
          updateMessage(map.id, assistantId, { content: accumulated });
        }
      );
      updateMessage(map.id, assistantId, { isStreaming: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
      updateMessage(map.id, assistantId, { content: `❌ ${msg}`, isStreaming: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {showUpgrade && (
        <UpgradePrompt
          message="Limite de mensagens de chat atingido para este mapa."
          onClose={() => setShowUpgrade(false)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Chat</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearSession(map.id)} className="h-7 w-7 p-0">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground text-center">
              Pergunte qualquer coisa sobre <strong>{map.title}</strong>
            </p>
            {loadingSuggestions ? (
              <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (
              suggestions.map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors text-foreground/80">
                  💬 {s}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        {chatLimitReached ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span>
                Limite de mensagens atingido para este mapa.
              </span>
            </div>
            <Button
              size="sm"
              className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => setShowUpgrade(true)}
            >
              <Crown className="h-3.5 w-3.5" />
              Fazer Upgrade
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Pergunte sobre o mapa..."
              className="min-h-[60px] max-h-[120px] resize-none text-sm"
              disabled={isLoading}
            />
            <Button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()} size="sm" className="self-end h-9 w-9 p-0">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

