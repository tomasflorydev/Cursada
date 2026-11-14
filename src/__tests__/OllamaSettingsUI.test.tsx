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

describe('Phase 5 Task 5.1 Frontend: OllamaSettingsSection in SettingsPage', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Inteligencia Artificial (Ollama) section, connected status, detected models, and saves settings', async () => {
    const updateSpy = vi.spyOn(cursadaClient, 'updateAiSettings');

    render(<SettingsPage themeMode="system" onChangeThemeMode={() => {}} />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Inteligencia Artificial (Ollama)',
      })
    ).toBeInTheDocument();

    const badge = screen.getByTestId('ollama-status-badge');
    await waitFor(() => {
      expect(badge).toHaveTextContent('Conectado');
    });

    expect(
      screen.queryByTestId('ollama-disconnected-help')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const modelsBox = await screen.findByTestId('ollama-installed-models');
    expect(within(modelsBox).getByText('llama3.2:latest')).toBeInTheDocument();
    expect(within(modelsBox).getByText('qwen2.5:7b')).toBeInTheDocument();
    expect(
      within(modelsBox).getByText('nomic-embed-text:latest')
    ).toBeInTheDocument();
    expect(
      within(modelsBox).getByText('mxbai-embed-large:latest')
    ).toBeInTheDocument();

    // Select models using quick chips
    fireEvent.click(
      within(modelsBox).getByRole('button', {
        name: 'Usar para Chat: qwen2.5:7b',
      })
    );
    fireEvent.click(
      within(modelsBox).getByRole('button', {
        name: 'Usar para Embeddings: mxbai-embed-large:latest',
      })
    );

    const chatInput = screen.getByLabelText(
      'Modelo de Chat'
    ) as HTMLInputElement;
    const embedInput = screen.getByLabelText(
      'Modelo de Embeddings'
    ) as HTMLInputElement;
    expect(chatInput.value).toBe('qwen2.5:7b');
    expect(embedInput.value).toBe('mxbai-embed-large:latest');

    // Also allow typing custom URL with trailing slash (normalized on save)
    const urlInput = screen.getByLabelText(
      'URL del servidor Ollama'
    ) as HTMLInputElement;
    fireEvent.change(urlInput, {
      target: { value: 'http://localhost:11434/' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar configuración de IA' })
    );

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:11434',
        chatModel: 'qwen2.5:7b',
        embeddingModel: 'mxbai-embed-large:latest',
      });
    });

    expect(
      await screen.findByText('Configuración de IA guardada correctamente')
    ).toBeInTheDocument();

    expect(await mockGetAiSettings()).toEqual({
      baseUrl: 'http://localhost:11434',
      chatModel: 'qwen2.5:7b',
      embeddingModel: 'mxbai-embed-large:latest',
    });
  });

  it('validates invalid URL and empty model names on submit without hanging', async () => {
    const updateSpy = vi.spyOn(cursadaClient, 'updateAiSettings');

    render(<SettingsPage themeMode="system" onChangeThemeMode={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('ollama-status-badge')).toHaveTextContent(
        'Conectado'
      );
    });

    const urlInput = screen.getByLabelText('URL del servidor Ollama');
    fireEvent.change(urlInput, { target: { value: 'ftp://invalid-host' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar configuración de IA' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/http/i);
    expect(urlInput).toHaveAttribute('aria-invalid', 'true');
    expect(updateSpy).not.toHaveBeenCalled();

    // Fix URL and clear chat model
    fireEvent.change(urlInput, {
      target: { value: 'http://localhost:11434' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const chatInput = screen.getByLabelText('Modelo de Chat');
    fireEvent.change(chatInput, { target: { value: '   ' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar configuración de IA' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /modelo de chat/i
    );
    expect(chatInput).toHaveAttribute('aria-invalid', 'true');
    expect(updateSpy).not.toHaveBeenCalled();

    // Typing manual custom model names and surfacing backend error cleanly
    fireEvent.change(chatInput, { target: { value: 'mistral:7b' } });
    const embedInput = screen.getByLabelText('Modelo de Embeddings');
    fireEvent.change(embedInput, { target: { value: 'bge-m3:latest' } });

    updateSpy.mockRejectedValueOnce(
      new Error('Error simulado al persistir en SQLite')
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar configuración de IA' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Error simulado al persistir en SQLite'
    );

    // Retry succeeds with manually typed values
    updateSpy.mockRestore();
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar configuración de IA' })
    );

    expect(
      await screen.findByText('Configuración de IA guardada correctamente')
    ).toBeInTheDocument();
    expect(await mockGetAiSettings()).toEqual({
      baseUrl: 'http://localhost:11434',
      chatModel: 'mistral:7b',
      embeddingModel: 'bge-m3:latest',
    });
  });

  it('shows Disconectado state with Spanish instructions when Ollama is down and reconnects on Verificar conexión', async () => {
    setMockOllamaConnectionState({ status: 'disconnected' });

    render(<SettingsPage themeMode="dark" onChangeThemeMode={() => {}} />);

    const badge = screen.getByTestId('ollama-status-badge');
    await waitFor(() => {
      expect(badge).toHaveTextContent('Desconectado');
    });

    // No intrusive role="alert" on mount
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const helpBox = screen.getByTestId('ollama-disconnected-help');
    expect(helpBox).toHaveTextContent(/ollama serve/i);
    expect(helpBox).toHaveTextContent(/Ollama\.app/i);

    const commandsRegion = within(helpBox).getByRole('region', {
      name: 'Comandos para iniciar Ollama',
    });
    expect(commandsRegion).toHaveTextContent('ollama pull llama3.2');
    expect(commandsRegion).toHaveTextContent('ollama pull nomic-embed-text');

    // Now start Ollama and click Verificar conexión
    setMockOllamaConnectionState({ status: 'connected', version: '0.5.9' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Verificar conexión' })
    );

    await waitFor(() => {
      expect(badge).toHaveTextContent('Conectado');
    });
    expect(
      screen.queryByTestId('ollama-disconnected-help')
    ).not.toBeInTheDocument();
    expect(
      await screen.findByTestId('ollama-installed-models')
    ).toBeInTheDocument();
    expect(screen.getByText('v0.5.9')).toBeInTheDocument();
  });

  it('is reachable from App sidebar under Ajustes', async () => {
    render(<App />);

    const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Ajustes/i }));

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Inteligencia Artificial (Ollama)',
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('ollama-status-badge')).toHaveTextContent(
        'Conectado'
      );
    });
  });
});
