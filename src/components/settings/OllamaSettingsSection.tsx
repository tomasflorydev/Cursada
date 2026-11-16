import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cursadaClient } from '../../lib/api/client';
import type {
  AiSettings,
  OllamaHealthCheckResult,
  OllamaModelInfo,
} from '../../types/domain';

type FormFieldKey = 'baseUrl' | 'chatModel' | 'embeddingModel';

const OLLAMA_HELP_COMMANDS = [
  'ollama serve',
  'ollama pull llama3.2',
  'ollama pull nomic-embed-text',
].join('\n');

const FALLBACK_CHAT_SUGGESTIONS = ['llama3.2', 'qwen2.5:7b'];
const FALLBACK_EMBED_SUGGESTIONS = ['nomic-embed-text', 'mxbai-embed-large'];

function formatModelSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'Tamaño desconocido';
  }
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) {
    return `${mb.toFixed(0)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function validateAndNormalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('La URL del servidor Ollama no puede estar vacía.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `La URL "${trimmed}" no es válida. Usá el formato http://localhost:11434.`
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      'La URL del servidor Ollama debe usar protocolo http:// o https://.'
    );
  }

  if (!parsed.hostname) {
    throw new Error('La URL del servidor Ollama debe incluir un host válido.');
  }

  return trimmed;
}

function isLikelyEmbeddingModel(model: OllamaModelInfo): boolean {
  const lowerName = model.name.toLowerCase();
  const lowerFamily = (model.family ?? '').toLowerCase();
  return (
    lowerName.includes('embed') ||
    lowerName.includes('bge') ||
    lowerFamily.includes('bert')
  );
}

export function OllamaSettingsSection() {
  const baseId = useId();
  const headingId = `${baseId}-ollama-heading`;
  const baseUrlId = `${baseId}-base-url`;
  const chatModelId = `${baseId}-chat-model`;
  const chatListId = `${baseId}-chat-models-list`;
  const embedModelId = `${baseId}-embed-model`;
  const embedListId = `${baseId}-embed-models-list`;
  const formErrorId = `${baseId}-form-error`;

  const baseUrlRef = useRef<HTMLInputElement | null>(null);
  const chatModelRef = useRef<HTMLInputElement | null>(null);
  const embedModelRef = useRef<HTMLInputElement | null>(null);
  const checkSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  const [baseUrlInput, setBaseUrlInput] = useState('http://localhost:11434');
  const [chatModelInput, setChatModelInput] = useState('llama3.2');
  const [embeddingModelInput, setEmbeddingModelInput] =
    useState('nomic-embed-text');
  const [savedBaseUrl, setSavedBaseUrl] = useState('http://localhost:11434');

  const [health, setHealth] = useState<OllamaHealthCheckResult | null>(null);
  const [isCheckingManual, setIsCheckingManual] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<FormFieldKey | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<AiSettings | null>(null);

  const latestModelsRef = useRef({
    chatModel: chatModelInput,
    embeddingModel: embeddingModelInput,
  });
  latestModelsRef.current = {
    chatModel: chatModelInput,
    embeddingModel: embeddingModelInput,
  };

  const runHealthCheck = useCallback(
    async (targetBaseUrl?: string, options?: { manual?: boolean }) => {
      const requestId = ++checkSeqRef.current;
      if (options?.manual) {
        setIsCheckingManual(true);
      }

      try {
        const result = await cursadaClient.checkOllamaStatus(targetBaseUrl);
        if (!isMountedRef.current || requestId !== checkSeqRef.current) {
          return;
        }
        setHealth(result);
      } catch (err: unknown) {
        if (!isMountedRef.current || requestId !== checkSeqRef.current) {
          return;
        }
        setHealth({
          status: 'disconnected',
          baseUrl: (targetBaseUrl ?? '').trim() || 'http://localhost:11434',
          version: null,
          models: [],
          chatModel: latestModelsRef.current.chatModel,
          embeddingModel: latestModelsRef.current.embeddingModel,
          errorMessage:
            err instanceof Error
              ? err.message
              : 'No se pudo verificar el estado de Ollama.',
          checkedAt: new Date().toISOString(),
        });
      } finally {
        if (
          options?.manual &&
          isMountedRef.current &&
          requestId === checkSeqRef.current
        ) {
          setIsCheckingManual(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    void cursadaClient
      .getAiSettings()
      .then((settings) => {
        if (!active) return;
        setBaseUrlInput(settings.baseUrl);
        setSavedBaseUrl(settings.baseUrl);
        setChatModelInput(settings.chatModel);
        setEmbeddingModelInput(settings.embeddingModel);
        return runHealthCheck(settings.baseUrl);
      })
      .catch(() => {
        if (!active) return;
        return runHealthCheck('http://localhost:11434');
      });

    return () => {
      active = false;
      isMountedRef.current = false;
    };
  }, [runHealthCheck]);

  const chatDatalistOptions = useMemo(() => {
    const names = new Set<string>();
    const models = health?.models ?? [];
    for (const model of models) {
      if (!isLikelyEmbeddingModel(model)) {
        names.add(model.name);
      }
    }
    for (const model of models) {
      names.add(model.name);
    }
    if (names.size === 0) {
      for (const fallback of FALLBACK_CHAT_SUGGESTIONS) {
        names.add(fallback);
      }
    }
    return Array.from(names);
  }, [health?.models]);

  const embedDatalistOptions = useMemo(() => {
    const names = new Set<string>();
    const models = health?.models ?? [];
    for (const model of models) {
      if (isLikelyEmbeddingModel(model)) {
        names.add(model.name);
      }
    }
    for (const model of models) {
      names.add(model.name);
    }
    if (names.size === 0) {
      for (const fallback of FALLBACK_EMBED_SUGGESTIONS) {
        names.add(fallback);
      }
    }
    return Array.from(names);
  }, [health?.models]);

  function clearFormFeedback(): void {
    setFormError(null);
    setInvalidField(null);
    setSaveSuccess(null);
  }

  async function handleCheckConnection(): Promise<void> {
    setFormError(null);
    await runHealthCheck(baseUrlInput, { manual: true });
  }

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    e.preventDefault();
    setSaveSuccess(null);

    let normalizedUrl: string;
    try {
      normalizedUrl = validateAndNormalizeUrl(baseUrlInput);
    } catch (err: unknown) {
      setInvalidField('baseUrl');
      setFormError(
        err instanceof Error
          ? err.message
          : 'La URL del servidor Ollama no es válida.'
      );
      baseUrlRef.current?.focus();
      return;
    }

    const trimmedChat = chatModelInput.trim();
    if (!trimmedChat) {
      setInvalidField('chatModel');
      setFormError('El modelo de chat no puede estar vacío.');
      chatModelRef.current?.focus();
      return;
    }

    const trimmedEmbed = embeddingModelInput.trim();
    if (!trimmedEmbed) {
      setInvalidField('embeddingModel');
      setFormError('El modelo de embeddings no puede estar vacío.');
      embedModelRef.current?.focus();
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setInvalidField(null);

    try {
      const saved = await cursadaClient.updateAiSettings({
        baseUrl: normalizedUrl,
        chatModel: trimmedChat,
        embeddingModel: trimmedEmbed,
      });

      if (!isMountedRef.current) {
        return;
      }

      const urlChanged = saved.baseUrl !== savedBaseUrl;
      setBaseUrlInput(saved.baseUrl);
      setSavedBaseUrl(saved.baseUrl);
      setChatModelInput(saved.chatModel);
      setEmbeddingModelInput(saved.embeddingModel);
      setSaveSuccess(saved);

      if (urlChanged) {
        void runHealthCheck(saved.baseUrl);
      } else {
        setHealth((prev) =>
          prev
            ? {
                ...prev,
                chatModel: saved.chatModel,
                embeddingModel: saved.embeddingModel,
              }
            : prev
        );
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      setFormError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la configuración de IA.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }

  const isConnected = health?.status === 'connected';
  const isDisconnected = health?.status === 'disconnected';

  return (
    <section
      className="surface-panel settings-section"
      aria-labelledby={headingId}
    >
      <div className="section-heading-bar">
        <div className="section-heading-left" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 id={headingId} className="section-title">
            Inteligencia Artificial (Ollama)
          </h2>

          <span
            data-testid="ollama-status-badge"
            className={
              isConnected
                ? 'course-status-pill is-active'
                : isDisconnected
                  ? 'tasks-summary-pill is-urgent'
                  : 'tasks-summary-pill'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '0px',
                backgroundColor: 'currentColor',
                flexShrink: 0,
              }}
            />
            {isConnected
              ? 'Conectado'
              : isDisconnected
                ? 'Desconectado'
                : 'Verificando...'}
          </span>

          {isConnected && health?.version ? (
            <span className="section-counter">v{health.version}</span>
          ) : null}
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={isCheckingManual}
          onClick={() => void handleCheckConnection()}
        >
          {isCheckingManual ? 'Verificando...' : 'Verificar conexión'}
        </button>
      </div>

      {isDisconnected ? (
        <div
          data-testid="ollama-disconnected-help"
          role="status"
          className="settings-meta-box"
          style={{
            borderColor: 'var(--status-warn-text)',
            backgroundColor: 'var(--status-warn-bg)',
            gap: '10px',
          }}
        >
          <strong style={{ color: 'var(--status-warn-text)', fontSize: '0.86rem' }}>
            Ollama no está respondiendo en {health.baseUrl || baseUrlInput}
          </strong>
          {health.errorMessage ? (
            <p className="settings-description" style={{ color: 'var(--text-primary)' }}>
              {health.errorMessage}
            </p>
          ) : null}
          <p className="settings-description" style={{ color: 'var(--text-primary)' }}>
            Para activar el asistente de estudio local, abrí la aplicación{' '}
            <strong>Ollama.app</strong> o ejecutá <code>ollama serve</code> en
            tu Terminal. Si todavía no descargaste los modelos recomendados,
            ejecutá estos comandos:
          </p>
          <pre
            role="region"
            aria-label="Comandos para iniciar Ollama"
            tabIndex={0}
            style={{
              margin: 0,
              padding: '12px 14px',
              backgroundColor: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              lineHeight: 1.55,
              color: 'var(--text-primary)',
              overflowX: 'auto',
            }}
          >
            <code>{OLLAMA_HELP_COMMANDS}</code>
          </pre>
        </div>
      ) : null}

      {isConnected && health.models.length > 0 ? (
        <div
          data-testid="ollama-installed-models"
          className="settings-meta-box"
          style={{ gap: '12px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <span className="settings-meta-label">
              Modelos locales detectados ({health.models.length})
            </span>
            <span className="section-counter">
              Elegí un modelo instalado o escribí su nombre abajo
            </span>
          </div>

          <ul
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              margin: 0,
              padding: 0,
              listStyle: 'none',
            }}
          >
            {health.models.map((model) => {
              const isChatSelected = chatModelInput.trim() === model.name;
              const isEmbedSelected = embeddingModelInput.trim() === model.name;
              const metaParts = [formatModelSize(model.sizeBytes)];
              if (model.parameterSize) {
                metaParts.push(model.parameterSize);
              }
              if (model.quantizationLevel) {
                metaParts.push(model.quantizationLevel);
              }

              return (
                <li
                  key={model.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    padding: '10px 12px',
                          backgroundColor: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {model.name}
                    </span>
                    <span className="section-counter">
                      {metaParts.join(' · ')}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className={`secondary-button ${isChatSelected ? 'is-selected' : ''}`}
                      aria-pressed={isChatSelected}
                      aria-label={`Usar para Chat: ${model.name}`}
                      onClick={() => {
                        clearFormFeedback();
                        setChatModelInput(model.name);
                      }}
                    >
                      Usar para Chat
                    </button>
                    <button
                      type="button"
                      className={`secondary-button ${isEmbedSelected ? 'is-selected' : ''}`}
                      aria-pressed={isEmbedSelected}
                      aria-label={`Usar para Embeddings: ${model.name}`}
                      onClick={() => {
                        clearFormFeedback();
                        setEmbeddingModelInput(model.name);
                      }}
                    >
                      Usar para Embeddings
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {isConnected && health.models.length === 0 ? (
        <div className="settings-meta-box" style={{ gap: '8px' }}>
          <span className="settings-meta-label">
            Ollama está conectado, pero no se detectaron modelos locales.
          </span>
          <p className="settings-description">
            Descargá los modelos recomendados ejecutando en Terminal:{' '}
            <code>ollama pull llama3.2</code> y{' '}
            <code>ollama pull nomic-embed-text</code>.
          </p>
        </div>
      ) : null}

      <form
        className="course-form"
        aria-labelledby={headingId}
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="course-form-grid">
          <div className="course-form-field course-form-field-full">
            <label htmlFor={baseUrlId} className="course-form-label">
              URL del servidor Ollama
            </label>
            <input
              ref={baseUrlRef}
              id={baseUrlId}
              name="baseUrl"
              type="url"
              className="course-form-input"
              placeholder="http://localhost:11434"
              value={baseUrlInput}
              required
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              aria-invalid={invalidField === 'baseUrl' ? 'true' : 'false'}
              aria-describedby={
                invalidField === 'baseUrl' ? formErrorId : undefined
              }
              onChange={(e) => {
                clearFormFeedback();
                setBaseUrlInput(e.target.value);
              }}
            />
          </div>

          <div className="course-form-field">
            <label htmlFor={chatModelId} className="course-form-label">
              Modelo de Chat
            </label>
            <input
              ref={chatModelRef}
              id={chatModelId}
              name="chatModel"
              type="text"
              list={chatListId}
              className="course-form-input"
              placeholder="Ej. llama3.2"
              value={chatModelInput}
              required
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              aria-invalid={invalidField === 'chatModel' ? 'true' : 'false'}
              aria-describedby={
                invalidField === 'chatModel' ? formErrorId : undefined
              }
              onChange={(e) => {
                clearFormFeedback();
                setChatModelInput(e.target.value);
              }}
            />
            <datalist id={chatListId}>
              {chatDatalistOptions.map((modelName) => (
                <option key={modelName} value={modelName} />
              ))}
            </datalist>
          </div>

          <div className="course-form-field">
            <label htmlFor={embedModelId} className="course-form-label">
              Modelo de Embeddings
            </label>
            <input
              ref={embedModelRef}
              id={embedModelId}
              name="embeddingModel"
              type="text"
              list={embedListId}
              className="course-form-input"
              placeholder="Ej. nomic-embed-text"
              value={embeddingModelInput}
              required
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
              aria-invalid={
                invalidField === 'embeddingModel' ? 'true' : 'false'
              }
              aria-describedby={
                invalidField === 'embeddingModel' ? formErrorId : undefined
              }
              onChange={(e) => {
                clearFormFeedback();
                setEmbeddingModelInput(e.target.value);
              }}
            />
            <datalist id={embedListId}>
              {embedDatalistOptions.map((modelName) => (
                <option key={modelName} value={modelName} />
              ))}
            </datalist>
          </div>
        </div>

        {formError ? (
          <div id={formErrorId} role="alert" className="settings-alert is-error">
            {formError}
          </div>
        ) : null}

        {saveSuccess ? (
          <div
            role="status"
            aria-live="polite"
            className="settings-alert is-success"
          >
            <strong>Configuración de IA guardada correctamente</strong>
            <span>
              Servidor: <code>{saveSuccess.baseUrl}</code> · Chat:{' '}
              <code>{saveSuccess.chatModel}</code> · Embeddings:{' '}
              <code>{saveSuccess.embeddingModel}</code>
            </span>
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="primary-button"
            disabled={isSaving}
          >
            {isSaving
              ? 'Guardando configuración...'
              : 'Guardar configuración de IA'}
          </button>
        </div>
      </form>
    </section>
  );
}
