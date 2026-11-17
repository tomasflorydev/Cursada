import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { cursadaClient } from '../../lib/api/client';
import {
  readStoredCiteSources,
  readStoredReportLanguage,
  writeStoredCiteSources,
  writeStoredReportLanguage,
  type ReportLanguageOption,
} from '../../lib/ai/aiPreferences';
import type { OllamaHealthCheckResult } from '../../types';
import {
  SwissButton,
  SwissErrorAlert,
  SwissLinkButton,
  SwissSelect,
  SwissSwitch,
} from '../../ui';

const FALLBACK_CHAT_MODELS = ['llama3.2', 'qwen2.5:7b', 'mistral', 'gemma2'];
const FALLBACK_EMBED_MODELS = ['nomic-embed-text', 'mxbai-embed-large'];

function validateOllamaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('La URL del servidor Ollama no puede estar vacía.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Ingresá una URL válida, por ejemplo http://localhost:11434.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('La URL de Ollama debe usar http:// o https://.');
  }
  return trimmed;
}

export interface SettingsAiSectionProps {
  sectionRef: RefObject<HTMLElement | null>;
}

/**
 * Local AI & Ollama configuration section (models, server endpoint, language, citations).
 */
export function SettingsAiSection({ sectionRef }: SettingsAiSectionProps) {
  const [aiBaseUrl, setAiBaseUrl] = useState('http://localhost:11434');
  const [aiChatModel, setAiChatModel] = useState('llama3.2');
  const [aiEmbedModel, setAiEmbedModel] = useState('nomic-embed-text');
  const [isCustomChatModel, setIsCustomChatModel] = useState(false);
  const [customChatModelInput, setCustomChatModelInput] = useState('');
  const [ollamaHealth, setOllamaHealth] =
    useState<OllamaHealthCheckResult | null>(null);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [reportLanguage, setReportLanguage] = useState<ReportLanguageOption>(
    readStoredReportLanguage
  );
  const [citeSources, setCiteSources] = useState<boolean>(readStoredCiteSources);

  const checkOllama = useCallback(async (targetUrl?: string) => {
    setIsCheckingOllama(true);
    setAiError(null);
    try {
      const result = await cursadaClient.checkOllamaStatus(targetUrl);
      setOllamaHealth(result);
    } catch (err: unknown) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'No se pudo verificar la conexión con Ollama.'
      );
    } finally {
      setIsCheckingOllama(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void cursadaClient
      .getAiSettings()
      .then((settings) => {
        if (!active) return;
        setAiBaseUrl(settings.baseUrl);
        setAiChatModel(settings.chatModel);
        setAiEmbedModel(settings.embeddingModel);
        void checkOllama(settings.baseUrl);
      })
      .catch(() => {
        if (active) {
          setAiError('No se pudo cargar la configuración de IA local.');
        }
      });
    return () => {
      active = false;
    };
  }, [checkOllama]);

  const chatModelOptions = useMemo(() => {
    const names = new Set<string>(FALLBACK_CHAT_MODELS);
    if (aiChatModel) names.add(aiChatModel);
    if (ollamaHealth?.models) {
      for (const m of ollamaHealth.models) {
        const lower = m.name.toLowerCase();
        if (!lower.includes('embed') && !lower.includes('bge')) {
          names.add(m.name);
        }
      }
    }
    return Array.from(names);
  }, [aiChatModel, ollamaHealth]);

  const embedModelOptions = useMemo(() => {
    const names = new Set<string>(FALLBACK_EMBED_MODELS);
    if (aiEmbedModel) names.add(aiEmbedModel);
    if (ollamaHealth?.models) {
      for (const m of ollamaHealth.models) {
        const lower = m.name.toLowerCase();
        if (lower.includes('embed') || lower.includes('bge')) {
          names.add(m.name);
        }
      }
    }
    return Array.from(names);
  }, [aiEmbedModel, ollamaHealth]);

  async function handleSaveAiSettings(
    override?: Partial<{ baseUrl: string; chatModel: string; embeddingModel: string }>
  ): Promise<void> {
    setIsSavingAi(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const normalizedUrl = validateOllamaUrl(override?.baseUrl ?? aiBaseUrl);
      const nextChat = (override?.chatModel ?? aiChatModel).trim();
      const nextEmbed = (override?.embeddingModel ?? aiEmbedModel).trim();
      if (!nextChat) {
        throw new Error('Indicá el nombre del modelo de chat.');
      }
      if (!nextEmbed) {
        throw new Error('Indicá el nombre del modelo de embeddings.');
      }
      const saved = await cursadaClient.updateAiSettings({
        baseUrl: normalizedUrl,
        chatModel: nextChat,
        embeddingModel: nextEmbed,
      });
      setAiBaseUrl(saved.baseUrl);
      setAiChatModel(saved.chatModel);
      setAiEmbedModel(saved.embeddingModel);
      setIsCustomChatModel(false);
      setAiNotice('Configuración de IA guardada.');
      await checkOllama(saved.baseUrl);
    } catch (err: unknown) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la configuración de Ollama.'
      );
    } finally {
      setIsSavingAi(false);
    }
  }

  function handleChangeReportLanguage(next: ReportLanguageOption): void {
    setReportLanguage(next);
    writeStoredReportLanguage(next);
  }

  function handleToggleCiteSources(next: boolean): void {
    setCiteSources(next);
    writeStoredCiteSources(next);
  }

  const isOllamaConnected = ollamaHealth?.status === 'connected';

  return (
    <section
      ref={sectionRef}
      id="settings-ai"
      className="settings-section-block"
      aria-labelledby="settings-ai-heading"
    >
      <h2 id="settings-ai-heading" className="settings-section-block-head">
        Inteligencia artificial
      </h2>

      {aiError ? (
        <div style={{ marginBottom: '12px' }}>
          <SwissErrorAlert message={aiError} />
        </div>
      ) : null}

      {aiNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="swiss-meta-md"
          style={{
            borderLeft: '4px solid var(--ink)',
            padding: '6px 12px',
            marginBottom: '12px',
            color: 'var(--ink)',
          }}
        >
          {aiNotice}
        </div>
      ) : null}

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Estado de Ollama (IA local)</div>
          <div className="settings-row-desc">
            {isOllamaConnected
              ? `${ollamaHealth?.baseUrl ?? aiBaseUrl}${
                  ollamaHealth?.version ? ` · v${ollamaHealth.version}` : ''
                } · ${ollamaHealth?.models.length ?? 0} modelos locales`
              : ollamaHealth?.errorMessage ??
                'Ejecutá ollama serve en Terminal para usar el asistente e informes con modelos locales.'}
          </div>
        </div>
        <div className="settings-row-control">
          <span
            className={`ollama-status-square ${
              isOllamaConnected ? 'is-connected' : ''
            }`.trim()}
            aria-hidden="true"
          />
          <span className="swiss-meta-md">
            {isCheckingOllama
              ? 'Verificando…'
              : isOllamaConnected
                ? 'Conectado'
                : 'Sin conexión'}
          </span>
          <SwissButton
            variant="secondary"
            disabled={isCheckingOllama}
            onClick={() => void checkOllama(aiBaseUrl)}
          >
            {isCheckingOllama ? 'Probando…' : 'Probar'}
          </SwissButton>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Dirección del servidor</div>
          <div className="settings-row-desc">
            Endpoint local de Ollama en tu equipo.
          </div>
        </div>
        <div className="settings-row-control">
          <input
            type="url"
            className="swiss-input"
            aria-label="URL del servidor Ollama"
            value={aiBaseUrl}
            onChange={(e) => setAiBaseUrl(e.target.value)}
          />
          <SwissButton
            variant="secondary"
            disabled={isSavingAi}
            onClick={() => void handleSaveAiSettings()}
          >
            {isSavingAi ? 'Guardando…' : 'Guardar'}
          </SwissButton>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Modelo de chat e informes</div>
          <div className="settings-row-desc">
            Modelo usado para responder consultas y generar guías de estudio.
          </div>
        </div>
        <div className="settings-row-control">
          {isCustomChatModel ? (
            <>
              <input
                type="text"
                className="swiss-input"
                aria-label="Nombre de modelo personalizado"
                placeholder="Ej. llama3.2:latest"
                value={customChatModelInput}
                onChange={(e) => setCustomChatModelInput(e.target.value)}
              />
              <SwissButton
                variant="secondary"
                disabled={isSavingAi}
                onClick={() =>
                  void handleSaveAiSettings({ chatModel: customChatModelInput })
                }
              >
                Usar
              </SwissButton>
              <SwissLinkButton
                className="swiss-meta"
                onClick={() => setIsCustomChatModel(false)}
              >
                Cancelar
              </SwissLinkButton>
            </>
          ) : (
            <SwissSelect
              aria-label="Modelo de chat e informes"
              value={aiChatModel}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__custom__') {
                  setCustomChatModelInput(aiChatModel);
                  setIsCustomChatModel(true);
                  return;
                }
                setAiChatModel(val);
                void handleSaveAiSettings({ chatModel: val });
              }}
            >
              {chatModelOptions.map((modelName) => (
                <option key={modelName} value={modelName}>
                  {modelName}
                </option>
              ))}
              <option value="__custom__">Otro modelo…</option>
            </SwissSelect>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Modelo de embeddings</div>
          <div className="settings-row-desc">
            Vectorización local de PDFs y apuntes para búsqueda semántica.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSelect
            aria-label="Modelo de embeddings"
            value={aiEmbedModel}
            onChange={(e) => {
              const val = e.target.value;
              setAiEmbedModel(val);
              void handleSaveAiSettings({ embeddingModel: val });
            }}
          >
            {embedModelOptions.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </SwissSelect>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Idioma de informes</div>
          <div className="settings-row-desc">
            Idioma por defecto para resúmenes, guías y simulacros.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSelect
            aria-label="Idioma de informes"
            value={reportLanguage}
            onChange={(e) =>
              handleChangeReportLanguage(e.target.value as ReportLanguageOption)
            }
          >
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="auto">Según las fuentes</option>
          </SwissSelect>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Citar las fuentes</div>
          <div className="settings-row-desc">
            Incluir marcadores [1] verificables vinculados a notas y PDFs.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSwitch
            checked={citeSources}
            ariaLabel="Citar las fuentes"
            onChange={handleToggleCiteSources}
          />
          <span className="swiss-meta-md">
            {citeSources ? 'Incluir citas [1]' : 'Sin citas'}
          </span>
        </div>
      </div>
    </section>
  );
}
