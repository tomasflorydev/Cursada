import type {
  AiSettings,
  OllamaHealthCheckResult,
  OllamaModelInfo,
  UpdateAiSettingsInput,
} from '../../types/domain';

const DEFAULT_MOCK_MODELS: OllamaModelInfo[] = [
  {
    name: 'llama3.2:latest',
    sizeBytes: 2_019_393_189,
    modifiedAt: '2026-11-10T10:00:00.000Z',
    family: 'llama',
    parameterSize: '3.2B',
    quantizationLevel: 'Q4_K_M',
  },
  {
    name: 'nomic-embed-text:latest',
    sizeBytes: 274_302_450,
    modifiedAt: '2026-11-10T10:05:00.000Z',
    family: 'nomic-bert',
    parameterSize: '137M',
    quantizationLevel: 'F16',
  },
];

let aiSettingsStore: AiSettings = {
  baseUrl: 'http://localhost:11434',
  chatModel: 'llama3.2:latest',
  embeddingModel: 'nomic-embed-text:latest',
};

export function resetMockOllama(): void {
  aiSettingsStore = {
    baseUrl: 'http://localhost:11434',
    chatModel: 'llama3.2:latest',
    embeddingModel: 'nomic-embed-text:latest',
  };
}

export async function mockGetAiSettings(): Promise<AiSettings> {
  return structuredClone(aiSettingsStore);
}

export async function mockUpdateAiSettings(
  input: UpdateAiSettingsInput
): Promise<AiSettings> {
  aiSettingsStore = {
    baseUrl: input.baseUrl?.trim() || aiSettingsStore.baseUrl,
    chatModel: input.chatModel?.trim() || aiSettingsStore.chatModel,
    embeddingModel: input.embeddingModel?.trim() || aiSettingsStore.embeddingModel,
  };
  return structuredClone(aiSettingsStore);
}

export async function mockCheckOllamaStatus(
  baseUrl?: string
): Promise<OllamaHealthCheckResult> {
  return {
    status: 'connected',
    baseUrl: baseUrl?.trim() || aiSettingsStore.baseUrl,
    version: '0.5.7',
    models: structuredClone(DEFAULT_MOCK_MODELS),
    chatModel: aiSettingsStore.chatModel,
    embeddingModel: aiSettingsStore.embeddingModel,
    errorMessage: null,
    checkedAt: new Date().toISOString(),
  };
}
