import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION, RELEASE_ID, RELEASE_NOTES } from '@/lib/version';

export function ReleaseNotesPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Notas da Versão
            </h1>
            <p className="text-muted-foreground text-sm">
              3Maps · Versão atual: v{APP_VERSION} (Release {RELEASE_ID})
            </p>
          </div>
        </div>

        {/* Release notes list */}
        <div className="space-y-6">
          {RELEASE_NOTES.map((release) => (
            <article
              key={release.version}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-bold text-slate-900">v{release.version}</h2>
                <span className="text-xs text-slate-500 font-medium">
                  {new Date(release.date).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{release.title}</h3>
              <ul className="space-y-1.5 text-sm text-slate-600">
                {release.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="text-xs text-slate-400 text-center">
          Mantenha o app atualizado para ter acesso às últimas melhorias.
        </p>
      </div>
    </div>
  );
}
