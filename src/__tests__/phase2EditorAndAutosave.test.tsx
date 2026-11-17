import { EditorState } from '@codemirror/state';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import {
  CURSADA_CODE_LANGUAGES,
  computeMinimalTextDiff,
} from '../lib/editor/codeMirrorLanguages';
import {
  createLivePreviewExtension,
  parseLivePreviewLines,
} from '../lib/editor/livePreviewExtension';
import {
  DEFAULT_UNTITLED_NOTE_TITLE,
  resolvePersistedNoteTitle,
} from '../lib/notes/noteDraftUtils';

describe('Phase 2 T2.4: Editor performance, bundle trim, and safe autosave', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('computes minimal prefix/suffix incremental diffs and excludes legacy language-data bloat', () => {
    expect(computeMinimalTextDiff('hola mundo', 'hola mundo')).toBeNull();
    expect(computeMinimalTextDiff('hola mundo', 'hola gran mundo')).toEqual({
      from: 5,
      to: 5,
      insert: 'gran ',
    });
    expect(computeMinimalTextDiff('**negrita**', 'negrita')).toEqual({
      from: 0,
      to: 11,
      insert: 'negrita',
    });

    const names = CURSADA_CODE_LANGUAGES.map((l) => l.name.toLowerCase());
    expect(names).toEqual(
      expect.arrayContaining([
        'javascript',
        'typescript',
        'python',
        'java',
        'sql',
        'json',
        'html',
        'css',
        'c++',
        'yaml',
      ])
    );
    expect(CURSADA_CODE_LANGUAGES.length).toBeLessThan(15);
  });

  it('shares one parseLivePreviewLines pass in StateField and skips intra-line cursor re-parses', () => {
    const parseSpy = vi.fn(parseLivePreviewLines);
    const ext = createLivePreviewExtension({ parseLines: parseSpy });

    let state = EditorState.create({
      doc: '# Título de prueba\n\nTexto con **negrita** y $x^2$\n\nOtra línea',
      selection: { anchor: 2 },
      extensions: [ext],
    });

    // State creation parses only once across shared StateField + ViewPlugin/multiLineMathField
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Horizontal selection movement within the same line must NOT re-parse
    state = state.update({ selection: { anchor: 6 } }).state;
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Moving cursor to a different line triggers 1 shared re-parse
    state = state.update({ selection: { anchor: 25 } }).state;
    expect(parseSpy).toHaveBeenCalledTimes(2);

    // Document edit triggers 1 shared re-parse
    state = state.update({
      changes: { from: 25, to: 25, insert: ' extra' },
    }).state;
    expect(parseSpy).toHaveBeenCalledTimes(3);
  });

  it('preserves body edits with fallback title and flushes pending autosave on beforeunload', async () => {
    expect(resolvePersistedNoteTitle('   ')).toBe(DEFAULT_UNTITLED_NOTE_TITLE);
    expect(resolvePersistedNoteTitle('  Parcial 1  ')).toBe('Parcial 1');

    const courses = await cursadaClient.listCourses({ status: 'active' });
    const targetCourse = courses[0];
    const updateSpy = vi.spyOn(cursadaClient, 'updateNote');

    render(
      <CourseDetailView courseId={targetCourse.id} onSelectCourse={vi.fn()} />
    );

    const titleInput = (await screen.findByLabelText(
      'Título de la nota'
    )) as HTMLTextAreaElement;
    const editorInput = (await screen.findByLabelText(
      'Contenido de la nota'
    )) as HTMLTextAreaElement;

    fireEvent.change(titleInput, { target: { value: '   ' } });
    fireEvent.change(editorInput, {
      target: { value: 'Contenido importante editado antes de cerrar' },
    });

    // Flush immediately via window beforeunload before the 450ms debounce fires
    window.dispatchEvent(new Event('beforeunload'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: DEFAULT_UNTITLED_NOTE_TITLE,
          content: 'Contenido importante editado antes de cerrar',
        })
      );
    });
  });
});
