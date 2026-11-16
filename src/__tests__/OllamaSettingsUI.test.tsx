import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import {
  mockGetAiSettings,
  setMockOllamaConnectionState,
} from '../lib/api/mockOllama';
import { SettingsPage } from '../pages/SettingsPage';

describe('Phase 5 Task 5.1 Frontend: Ollama / Inteligencia artificial section in SettingsPage', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Inteligencia artificial section, connected status, detected models, and saves settings', async () => {
    const updateSpy = vi.spyOn(cursadaClient, 'updateAiSettings');

    render(<SettingsPage themeMode="dark" onChangeThemeMode={() => {}} />);

    const aiHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Inteligencia artificial',
    });
    const aiSection = aiHeading.closest('section') as HTMLElement;

    await waitFor(() => {
      expect(within(aiSection).getByText('Conectado')).toBeInTheDocument();
    });

    expect(
      within(aiSection).getByText(/http:\/\/localhost:11434 · v0\.5\.7 · 4 modelos locales/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const chatSelect = within(aiSection).getByLabelText(
      'Modelo de chat e informes'
    ) as HTMLSelectElement;
    const embedSelect = within(aiSection).getByLabelText(
      'Modelo de embeddings'
    ) as HTMLSelectElement;

    // Detected models are listed as select options
    expect(
      within(chatSelect).getByRole('option', { name: 'llama3.2:latest' })
    ).toBeInTheDocument();
    expect(
      within(chatSelect).getByRole('option', { name: 'qwen2.5:7b' })
    ).toBeInTheDocument();
    expect(
      within(embedSelect).getByRole('option', { name: 'nomic-embed-text:latest' })
    ).toBeInTheDocument();
    expect(
      within(embedSelect).getByRole('option', { name: 'mxbai-embed-large:latest' })
    ).toBeInTheDocument();

    // Select chat and embedding models
    fireEvent.change(chatSelect, { target: { value: 'qwen2.5:7b' } });
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ chatModel: 'qwen2.5:7b' })
      );
    });

    fireEvent.change(embedSelect, {
      target: { value: 'mxbai-embed-large:latest' },
    });
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ embeddingModel: 'mxbai-embed-large:latest' })
      );
    });

    // Also allow typing custom URL with trailing slash (normalized on save)
    const urlInput = within(aiSection).getByLabelText(
      'URL del servidor Ollama'
    ) as HTMLInputElement;
    fireEvent.change(urlInput, {
      target: { value: 'http://localhost:11434/' },
    });

    fireEvent.click(within(aiSection).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenLastCalledWith({
        baseUrl: 'http://localhost:11434',
        chatModel: 'qwen2.5:7b',
        embeddingModel: 'mxbai-embed-large:latest',
      });
    });

    expect(
      await within(aiSection).findByText('Configuración de IA guardada.')
    ).toBeInTheDocument();

    expect(await mockGetAiSettings()).toEqual({
      baseUrl: 'http://localhost:11434',
      chatModel: 'qwen2.5:7b',
      embeddingModel: 'mxbai-embed-large:latest',
    });
  });

  it('validates invalid URL and empty model names on submit without hanging', async () => {
    const updateSpy = vi.spyOn(cursadaClient, 'updateAiSettings');

    render(<SettingsPage themeMode="dark" onChangeThemeMode={() => {}} />);

    const aiHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Inteligencia artificial',
    });
    const aiSection = aiHeading.closest('section') as HTMLElement;

    await waitFor(() => {
      expect(within(aiSection).getByText('Conectado')).toBeInTheDocument();
    });

    const urlInput = within(aiSection).getByLabelText('URL del servidor Ollama');
    fireEvent.change(urlInput, { target: { value: 'ftp://invalid-host' } });

    fireEvent.click(within(aiSection).getByRole('button', { name: 'Guardar' }));

    expect(await within(aiSection).findByRole('alert')).toHaveTextContent(/http/i);
    expect(updateSpy).not.toHaveBeenCalled();

    // Fix URL, select embedding model first, and test empty custom chat model
    fireEvent.change(urlInput, {
      target: { value: 'http://localhost:11434' },
    });

    const embedSelect = within(aiSection).getByLabelText('Modelo de embeddings');
    fireEvent.change(embedSelect, {
      target: { value: 'mxbai-embed-large:latest' },
    });
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
    updateSpy.mockClear();

    const chatSelect = within(aiSection).getByLabelText(
      'Modelo de chat e informes'
    );
    fireEvent.change(chatSelect, { target: { value: '__custom__' } });

    const customChatInput = await within(aiSection).findByLabelText(
      'Nombre de modelo personalizado'
    );
    fireEvent.change(customChatInput, { target: { value: '   ' } });
    fireEvent.click(within(aiSection).getByRole('button', { name: 'Usar' }));

    expect(await within(aiSection).findByRole('alert')).toHaveTextContent(
      /modelo de chat/i
    );
    expect(updateSpy).not.toHaveBeenCalled();

    // Typing manual custom model name and surfacing backend error cleanly
    fireEvent.change(customChatInput, { target: { value: 'mistral:7b' } });

    updateSpy.mockRejectedValueOnce(
      new Error('Error simulado al persistir en SQLite')
    );
    fireEvent.click(within(aiSection).getByRole('button', { name: 'Usar' }));

    expect(await within(aiSection).findByRole('alert')).toHaveTextContent(
      'Error simulado al persistir en SQLite'
    );

    // Retry succeeds with manually typed value
    updateSpy.mockRestore();
    fireEvent.click(within(aiSection).getByRole('button', { name: 'Usar' }));

    expect(
      await within(aiSection).findByText('Configuración de IA guardada.')
    ).toBeInTheDocument();
    expect(await mockGetAiSettings()).toEqual({
      baseUrl: 'http://localhost:11434',
      chatModel: 'mistral:7b',
      embeddingModel: 'mxbai-embed-large:latest',
    });
  });

  it('shows Sin conexión state with Spanish instructions when Ollama is down and reconnects on Probar', async () => {
    setMockOllamaConnectionState({ status: 'disconnected' });

    render(<SettingsPage themeMode="dark" onChangeThemeMode={() => {}} />);

    const aiHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Inteligencia artificial',
    });
    const aiSection = aiHeading.closest('section') as HTMLElement;

    await waitFor(() => {
      expect(within(aiSection).getByText('Sin conexión')).toBeInTheDocument();
    });

    // No intrusive role="alert" on mount
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(aiSection).toHaveTextContent(/ollama serve/i);
    expect(aiSection).toHaveTextContent(/Ollama/i);

    // Now start Ollama and click Probar
    setMockOllamaConnectionState({ status: 'connected', version: '0.5.9' });
    fireEvent.click(within(aiSection).getByRole('button', { name: 'Probar' }));

    await waitFor(() => {
      expect(within(aiSection).getByText('Conectado')).toBeInTheDocument();
    });
    expect(within(aiSection).getByText(/v0\.5\.9/i)).toBeInTheDocument();
  });

  it('is reachable from App header under Ajustes', async () => {
    render(<App />);

    const banner = screen.getByRole('banner');
    fireEvent.click(within(banner).getByRole('button', { name: 'Ajustes' }));

    const aiHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Inteligencia artificial',
    });
    expect(aiHeading).toBeInTheDocument();
    const aiSection = aiHeading.closest('section') as HTMLElement;

    await waitFor(() => {
      expect(within(aiSection).getByText('Conectado')).toBeInTheDocument();
    });
  });
});
