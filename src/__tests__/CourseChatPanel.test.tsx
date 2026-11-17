import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';

describe('CourseDetailView RAG Ask Flow (migrated Swiss UI)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('sends question grounded on course sources, renders assistant reply and citation references', async () => {
    const sendSpy = vi.spyOn(cursadaClient, 'sendChatMessage');

    render(<CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />);

    const assistantPane = await screen.findByLabelText(
      'Asistente e informes con IA'
    );
    const input = within(assistantPane).getByPlaceholderText(
      'Preguntale a tus fuentes…'
    );
    const submitBtn = within(assistantPane).getByRole('button', {
      name: 'Enviar consulta',
    });

    expect(submitBtn).toBeDisabled();

    fireEvent.change(input, {
      target: { value: '¿Qué cubre el programa sobre ciclo de vida y requisitos?' },
    });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 'ing-soft-1',
          content: '¿Qué cubre el programa sobre ciclo de vida y requisitos?',
        })
      );
    });

    expect(
      await within(assistantPane).findByText(
        '¿Qué cubre el programa sobre ciclo de vida y requisitos?'
      )
    ).toBeInTheDocument();

    // Citation list below answer
    await waitFor(() => {
      expect(
        assistantPane.querySelector('.notebook-answer-copy')?.textContent?.trim()
          .length ?? 0
      ).toBeGreaterThan(15);
    });
  });

  it('supports canceling an in-flight RAG query without rendering an error alert', async () => {
    const cancelSpy = vi
      .spyOn(cursadaClient, 'cancelChatMessage')
      .mockResolvedValue(undefined);
    let resolvePending!: (val: never) => void;
    vi.spyOn(cursadaClient, 'sendChatMessage').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePending = resolve as (val: never) => void;
        })
    );

    render(<CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />);

    const assistantPane = await screen.findByLabelText(
      'Asistente e informes con IA'
    );
    const input = within(assistantPane).getByPlaceholderText(
      'Preguntale a tus fuentes…'
    );
    fireEvent.change(input, { target: { value: 'Consulta lenta' } });
    fireEvent.click(
      within(assistantPane).getByRole('button', { name: 'Enviar consulta' })
    );

    const cancelBtn = await within(assistantPane).findByRole('button', {
      name: 'Cancelar consulta',
    });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });
    expect(
      within(assistantPane).queryByRole('button', { name: 'Cancelar consulta' })
    ).not.toBeInTheDocument();
    expect(within(assistantPane).getByRole('alert')).toHaveTextContent(
      /Consulta cancelada/i
    );
    void resolvePending;
  });

  it('surfaces errors gracefully when sendChatMessage rejects', async () => {
    vi.spyOn(cursadaClient, 'sendChatMessage').mockRejectedValueOnce(
      new Error('Error de conexión con Ollama')
    );

    render(<CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />);

    const assistantPane = await screen.findByLabelText(
      'Asistente e informes con IA'
    );
    fireEvent.change(
      within(assistantPane).getByPlaceholderText('Preguntale a tus fuentes…'),
      { target: { value: 'Consulta con fallo' } }
    );
    fireEvent.click(
      within(assistantPane).getByRole('button', { name: 'Enviar consulta' })
    );

    expect(
      await within(assistantPane).findByText(/Error de conexión con Ollama/i)
    ).toBeInTheDocument();
  });
});
