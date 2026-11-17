import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import {
  getKnowledgeGraph,
  getNoteLinksSummary,
  openOrCreateWikiLinkNote,
  syncAllNoteLinks,
  syncNoteLinks,
} from '../../electron/db/knowledgeRepo';
import { createNote, getNoteById, updateNote } from '../../electron/db/notesRepo';
import {
  importObsidianVaultFromDir,
  parseMarkdownFrontmatter,
} from '../../electron/services/obsidianImportService';
import { ObsidianImportModal } from '../components/courses/ObsidianImportModal';
import { NoteBacklinksPanel } from '../components/notes/NoteBacklinksPanel';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import {
  mockGetKnowledgeGraph,
  mockGetNoteLinks,
  mockImportObsidianVault,
  mockOpenOrCreateWikiLink,
  resetMockKnowledge,
} from '../lib/api/mockKnowledge';
import {
  normalizeWikiTitle,
  parseWikiLinksFromMarkdown,
  resolveNoteByWikiTitle,
} from '../lib/knowledge/wikiLinksParser';

beforeAll(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal(
        this: HTMLDialogElement
      ) {
        this.setAttribute('open', '');
        this.returnValue = '';
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close(
        this: HTMLDialogElement,
        returnValue?: string
      ) {
        this.returnValue = returnValue ?? '';
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close', { bubbles: false }));
      };
    }
  }
});

describe('Phase 12 (v2.2.0): Knowledge Network (WikiLinks, Backlinks, 2D Graph & Obsidian Importer)', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    resetAllMocks();
    resetMockKnowledge();
    if (typeof window !== 'undefined' && 'cursadaApi' in window) {
      delete window.cursadaApi;
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (typeof window !== 'undefined' && 'cursadaApi' in window) {
      delete window.cursadaApi;
    }
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses [[WikiLinks]] and [[Target|Alias]], ignores code/escapes, caps snippets <= 180 chars, and resolves titles accent-insensitively', () => {
    expect(normalizeWikiTitle('  Álgebra   Lineal  ')).toBe('algebra lineal');
    expect(normalizeWikiTitle('Programación Funcional')).toBe(
      'programacion funcional'
    );

    const longBody = 'x'.repeat(240);
    const md = [
      '# Apunte de pruebas',
      '',
      'Revisar [[Normalización]] y también [[Teorema de Bayes|Bayes]] para el parcial.',
      '',
      'Ignorar \\[[Escapado]], ![[diagrama.png]] y `[[InlineCode]]`.',
      '',
      '```ts',
      'const ignored = "[[CodeBlockLink]]";',
      '```',
      '',
      `Párrafo extenso: ${longBody} ver [[Árboles AVL|AVL]] en detalle ${longBody}.`,
      'Repetido: [[normalizacion]] no debería duplicar.',
    ].join('\n');

    const parsed = parseWikiLinksFromMarkdown(md);
    expect(parsed).toHaveLength(3);

    expect(parsed[0]).toMatchObject({
      raw: '[[Normalización]]',
      targetTitle: 'Normalización',
      displayText: 'Normalización',
    });
    expect(parsed[0].contextSnippet).toContain('[[Normalización]]');
    expect(parsed[0].contextSnippet.length).toBeLessThanOrEqual(180);

    expect(parsed[1]).toMatchObject({
      raw: '[[Teorema de Bayes|Bayes]]',
      targetTitle: 'Teorema de Bayes',
      displayText: 'Bayes',
    });

    expect(parsed[2]).toMatchObject({
      raw: '[[Árboles AVL|AVL]]',
      targetTitle: 'Árboles AVL',
      displayText: 'AVL',
    });
    expect(parsed[2].contextSnippet.length).toBeLessThanOrEqual(180);
    expect(parsed[2].contextSnippet).toContain('[[Árboles AVL|AVL]]');

    const notes = [
      { id: 'n1', title: 'Normalización', courseId: 'c1' },
      { id: 'n2', title: 'Normalización', courseId: 'c2' },
      { id: 'n3', title: 'Árboles AVL', courseId: 'c2' },
    ];

    // Prefers preferredCourseId when both courses share the same title
    expect(resolveNoteByWikiTitle('normalizacion', notes, 'c2')?.id).toBe('n2');
    expect(resolveNoteByWikiTitle('Normalizacion', notes, 'c1')?.id).toBe('n1');
    // Falls back globally when not present in preferredCourseId
    expect(resolveNoteByWikiTitle('Arboles AVL', notes, 'c1')?.id).toBe('n3');
    expect(resolveNoteByWikiTitle('Inexistente', notes, 'c1')).toBeNull();
  });

  it('SQLite v6 knowledgeRepo syncs forward links, resolves orphan backlinks on creation, handles openOrCreateWikiLinkNote, and filters graph', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    const activeA = createCourse(ctx.db, {
      name: 'Algoritmos II',
      color: 'blue',
      status: 'active',
    });
    const activeB = createCourse(ctx.db, {
      name: 'Base de Datos',
      color: 'emerald',
      status: 'active',
    });
    const archivedC = createCourse(ctx.db, {
      name: 'Física I (Vieja)',
      color: 'slate',
      status: 'archived',
    });

    const noteGrafos = createNote(ctx.db, {
      courseId: activeA.id,
      title: 'Grafos Dirigidos',
      content:
        'Para recorrer usamos [[BFS y DFS|Búsqueda en Grafo]] y lo conectamos con [[Índices B+]].',
    });
    const noteIndices = createNote(ctx.db, {
      courseId: activeB.id,
      title: 'Índices B+',
      content: 'Relación con [[Grafos Dirigidos]] y [[Óptica Geométrica]].',
    });
    const noteArchived = createNote(ctx.db, {
      courseId: archivedC.id,
      title: 'Óptica Geométrica',
      content: 'Referencia histórica a [[Grafos Dirigidos]].',
    });

    syncNoteLinks(ctx.db, noteGrafos.id);
    syncNoteLinks(ctx.db, noteIndices.id);
    syncNoteLinks(ctx.db, noteArchived.id);

    // Before creating "BFS y DFS", forward link targetNoteId is null
    const summaryBefore = getNoteLinksSummary(ctx.db, noteGrafos.id);
    expect(summaryBefore.forwardLinks).toHaveLength(2);
    expect(summaryBefore.forwardLinks[0]).toMatchObject({
      targetTitle: 'BFS y DFS',
      displayText: 'Búsqueda en Grafo',
      targetNoteId: null,
    });
    expect(summaryBefore.forwardLinks[1]).toMatchObject({
      targetTitle: 'Índices B+',
      targetNoteId: noteIndices.id,
    });
    expect(summaryBefore.backlinks).toHaveLength(2);
    expect(
      summaryBefore.backlinks.map((b) => b.sourceNoteTitle).sort()
    ).toEqual(['Índices B+', 'Óptica Geométrica'].sort());

    // openOrCreateWikiLinkNote creates missing note and back-resolves orphan row in note_links
    const createdBfs = openOrCreateWikiLinkNote(ctx.db, {
      courseId: activeA.id,
      targetTitle: 'BFS y DFS',
    });
    expect(createdBfs.title).toBe('BFS y DFS');
    expect(createdBfs.courseId).toBe(activeA.id);

    const summaryAfterCreate = getNoteLinksSummary(ctx.db, noteGrafos.id);
    expect(summaryAfterCreate.forwardLinks[0].targetNoteId).toBe(createdBfs.id);

    const bfsSummary = getNoteLinksSummary(ctx.db, createdBfs.id);
    expect(bfsSummary.backlinks).toHaveLength(1);
    expect(bfsSummary.backlinks[0]).toMatchObject({
      sourceNoteId: noteGrafos.id,
      sourceNoteTitle: 'Grafos Dirigidos',
      sourceCourseName: 'Algoritmos II',
    });
    expect(bfsSummary.backlinks[0].contextSnippet).toContain('[[BFS y DFS|Búsqueda en Grafo]]');

    // Opening existing WikiLink accent-insensitively returns existing note without duplicating
    const reopened = openOrCreateWikiLinkNote(ctx.db, {
      courseId: activeB.id,
      targetTitle: 'indices b+',
    });
    expect(reopened.id).toBe(noteIndices.id);

    // Local graph (activeA only): noteGrafos <-> createdBfs (1 edge), no cross-course edge
    const localGraph = getKnowledgeGraph(ctx.db, { courseId: activeA.id });
    expect(localGraph.nodes).toHaveLength(2);
    expect(localGraph.edges).toHaveLength(1);
    expect(localGraph.edges[0]).toMatchObject({
      sourceNoteId: noteGrafos.id,
      targetNoteId: createdBfs.id,
    });
    expect(
      localGraph.nodes.find((n) => n.noteId === noteGrafos.id)?.degree
    ).toBe(1);

    // Global graph excluding archived: 3 active notes (noteGrafos, createdBfs, noteIndices), 3 edges
    const globalActiveGraph = getKnowledgeGraph(ctx.db, {
      includeArchived: false,
    });
    expect(globalActiveGraph.nodes).toHaveLength(3);
    expect(
      globalActiveGraph.nodes.some((n) => n.courseStatus === 'archived')
    ).toBe(false);
    expect(globalActiveGraph.edges).toHaveLength(3);
    expect(
      globalActiveGraph.nodes.find((n) => n.noteId === noteGrafos.id)?.degree
    ).toBe(3);

    // Global graph including archived: 4 notes, 5 edges
    const globalAllGraph = getKnowledgeGraph(ctx.db, { includeArchived: true });
    expect(globalAllGraph.nodes).toHaveLength(4);
    expect(globalAllGraph.edges).toHaveLength(5);
    expect(
      globalAllGraph.nodes.find((n) => n.noteId === noteArchived.id)?.degree
    ).toBe(2);

    // Updating a note and syncing removes deleted links
    updateNote(ctx.db, noteGrafos.id, { content: 'Sin enlaces ahora.' });
    syncNoteLinks(ctx.db, noteGrafos.id);
    expect(getNoteLinksSummary(ctx.db, noteGrafos.id).forwardLinks).toHaveLength(0);
    expect(getNoteLinksSummary(ctx.db, createdBfs.id).backlinks).toHaveLength(0);

    syncAllNoteLinks(ctx.db);
    expect(getNoteById(ctx.db, createdBfs.id)?.title).toBe('BFS y DFS');

    ctx.close();
  });

  it('obsidianImportService parses YAML frontmatter, ignores .obsidian/.trash, imports active or archived courses, and resolves WikiLinks', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    const vaultDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cursada-test-obsidian-')
    );
    tempDirs.push(vaultDir);

    // Ignored Obsidian internal folders & non-markdown files
    fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
    fs.mkdirSync(path.join(vaultDir, '.trash'), { recursive: true });
    fs.writeFileSync(
      path.join(vaultDir, '.obsidian', 'workspace.md'),
      '# Ignorar',
      'utf8'
    );
    fs.writeFileSync(
      path.join(vaultDir, '.trash', 'borrada.md'),
      '# En papelera',
      'utf8'
    );

    // Valid course folders & root note
    fs.mkdirSync(path.join(vaultDir, 'Sistemas Operativos'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(vaultDir, 'Redes'), { recursive: true });
    fs.writeFileSync(
      path.join(vaultDir, 'Sistemas Operativos', 'imagen.png'),
      'binary',
      'utf8'
    );

    const rawWithFrontmatter = [
      '---',
      'tags: [so, concurrencia]',
      'aliases:',
      '  - Procesos',
      '  - Hilos',
      'date: 2026-10-05',
      'parcial: parcial_1',
      '---',
      '# Planificación de CPU',
      '',
      'Comparar con [[Sockets TCP|TCP]] y [[Índice General]].',
    ].join('\n');

    const parsedFm = parseMarkdownFrontmatter(rawWithFrontmatter);
    expect(parsedFm.frontmatter).toEqual({
      tags: 'so, concurrencia',
      aliases: 'Procesos, Hilos',
      date: '2026-10-05',
      parcial: 'parcial_1',
    });
    expect(parsedFm.body).toContain('# Planificación de CPU');
    expect(parsedFm.body).not.toContain('tags:');

    fs.writeFileSync(
      path.join(vaultDir, 'Sistemas Operativos', 'Planificación.md'),
      rawWithFrontmatter,
      'utf8'
    );
    fs.writeFileSync(
      path.join(vaultDir, 'Redes', 'Sockets TCP.md'),
      '---\nexam_stage: final\n---\nVer [[Planificacion]].',
      'utf8'
    );
    fs.writeFileSync(
      path.join(vaultDir, 'Índice General.md'),
      'Mapa hacia [[Planificación]] y [[Sockets TCP]].',
      'utf8'
    );

    const result = importObsidianVaultFromDir(ctx.db, {
      vaultDir,
      targetStatus: 'archived',
    });

    expect(result.canceled).toBe(false);
    expect(result.vaultPath).toBe(path.resolve(vaultDir));
    expect(result.notesImportedCount).toBe(3);
    expect(result.linksResolvedCount).toBe(5);
    expect(result.coursesCreated).toHaveLength(3);
    expect(result.coursesCreated.every((c) => c.status === 'archived')).toBe(
      true
    );

    const courseNames = result.coursesCreated.map((c) => c.name);
    expect(courseNames).toContain('Sistemas Operativos');
    expect(courseNames).toContain('Redes');
    expect(courseNames).toContain(path.basename(vaultDir));

    // Verify frontmatter_json and exam_stage persisted in SQLite
    const planRow = ctx.db
      .prepare('SELECT id, frontmatter_json, exam_stage FROM notes WHERE title = ?')
      .get('Planificación') as
      | { id: string; frontmatter_json: string; exam_stage: string }
      | undefined;
    expect(planRow).toBeDefined();
    expect(JSON.parse(planRow!.frontmatter_json)).toMatchObject({
      tags: 'so, concurrencia',
      aliases: 'Procesos, Hilos',
      date: '2026-10-05',
    });
    expect(planRow!.exam_stage).toBe('parcial_1');

    const tcpRow = ctx.db
      .prepare('SELECT id, exam_stage FROM notes WHERE title = ?')
      .get('Sockets TCP') as { id: string; exam_stage: string } | undefined;
    expect(tcpRow?.exam_stage).toBe('final');

    // Verify backlinks resolved across imported vault
    const planLinks = getNoteLinksSummary(ctx.db, planRow!.id);
    expect(planLinks.forwardLinks).toHaveLength(2);
    expect(planLinks.backlinks).toHaveLength(2);

    // Also verify active import with filesPayload and courseNameOverride
    const payloadResult = importObsidianVaultFromDir(ctx.db, {
      targetStatus: 'active',
      courseNameOverride: 'Consolidado IA',
      filesPayload: [
        { relativePath: '.obsidian/ignore.md', content: 'ignore' },
        { relativePath: 'CarpetaA/Nota 1.md', content: 'Enlaza a [[Nota 2]].' },
        { relativePath: 'CarpetaB/Nota 2.md', content: 'Contenido base.' },
      ],
    });
    expect(payloadResult.coursesCreated).toHaveLength(1);
    expect(payloadResult.coursesCreated[0].name).toBe('Consolidado IA');
    expect(payloadResult.coursesCreated[0].status).toBe('active');
    expect(payloadResult.notesImportedCount).toBe(2);
    expect(payloadResult.linksResolvedCount).toBe(1);

    ctx.close();
  });

  it('mockKnowledge provides full browser-mode WikiLinks, Graph, and Obsidian import parity', async () => {
    const created = await mockOpenOrCreateWikiLink({
      courseId: 'ing-soft-1',
      targetTitle: 'Deuda Técnica',
    });
    expect(created.title).toBe('Deuda Técnica');

    const importRes = await mockImportObsidianVault({
      targetStatus: 'active',
      filesPayload: [
        {
          relativePath: 'Arquitectura/Patrones.md',
          content: 'Ver [[Resumen de Métricas Ágiles, Velocidad y Deuda Técnica]] y [[Microservicios]].',
        },
        {
          relativePath: 'Arquitectura/Microservicios.md',
          content: 'Basado en [[Patrones]].',
        },
      ],
    });
    expect(importRes.canceled).toBe(false);
    expect(importRes.notesImportedCount).toBe(2);
    expect(importRes.linksResolvedCount).toBe(3);

    const graph = await mockGetKnowledgeGraph({ includeArchived: false });
    expect(graph.nodes.some((n) => n.title === 'Patrones')).toBe(true);
    expect(graph.edges.length).toBeGreaterThanOrEqual(3);

    const links = await mockGetNoteLinks(created.id);
    expect(links.noteId).toBe(created.id);
  });

  it('renders <NoteBacklinksPanel /> with forward links, backlinks, collapse toggle, and 1-click navigation', async () => {
    vi.spyOn(cursadaClient, 'getNoteLinks').mockResolvedValue({
      noteId: 'note-a',
      forwardLinks: [
        {
          id: 'fwd-1',
          sourceNoteId: 'note-a',
          sourceNoteTitle: 'Nota A',
          sourceCourseId: 'ing-soft-1',
          sourceCourseName: 'Ingeniería de Software I',
          targetNoteId: 'note-b',
          targetTitle: 'Nota B',
          displayText: 'Ir a B',
          contextSnippet: 'Ver [[Nota B|Ir a B]].',
        },
        {
          id: 'fwd-2',
          sourceNoteId: 'note-a',
          sourceNoteTitle: 'Nota A',
          sourceCourseId: 'ing-soft-1',
          sourceCourseName: 'Ingeniería de Software I',
          targetNoteId: null,
          targetTitle: 'Concepto Nuevo',
          displayText: 'Concepto Nuevo',
          contextSnippet: 'Crear [[Concepto Nuevo]].',
        },
      ],
      backlinks: [
        {
          id: 'back-1',
          sourceNoteId: 'note-c',
          sourceNoteTitle: 'Nota C',
          sourceCourseId: 'bd-2',
          sourceCourseName: 'Base de Datos II',
          targetNoteId: 'note-a',
          targetTitle: 'Nota A',
          displayText: 'Nota A',
          contextSnippet: 'Referencia desde Nota C hacia [[Nota A]].',
        },
      ],
    });

    const onOpenNote = vi.fn();
    const onOpenOrCreateWikiLink = vi.fn();

    render(
      <NoteBacklinksPanel
        noteId="note-a"
        courseId="ing-soft-1"
        onOpenNote={onOpenNote}
        onOpenOrCreateWikiLink={onOpenOrCreateWikiLink}
      />
    );

    expect(await screen.findByText('Ir a B')).toBeInTheDocument();
    expect(screen.getByText('Destino: Nota B')).toBeInTheDocument();
    expect(screen.getByText('Concepto Nuevo')).toBeInTheDocument();
    expect(screen.getByText('+ Crear nota')).toBeInTheDocument();
    expect(screen.getByText('Nota C')).toBeInTheDocument();
    expect(screen.getByText('Base de Datos II')).toBeInTheDocument();
    expect(
      screen.getByText('Referencia desde Nota C hacia [[Nota A]].')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Concepto Nuevo/i }));
    expect(onOpenOrCreateWikiLink).toHaveBeenCalledWith('Concepto Nuevo');

    fireEvent.click(screen.getByRole('button', { name: /Nota C/i }));
    expect(onOpenNote).toHaveBeenCalledWith('note-c', 'bd-2');

    const toggleBtn = screen.getByRole('button', {
      name: /Red de conocimiento/i,
    });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Nota C')).not.toBeInTheDocument();
  });

  it('renders <ObsidianImportModal /> supporting archived destination, native trigger, and fallback folder selection', async () => {
    const importSpy = vi
      .spyOn(cursadaClient, 'importObsidianVault')
      .mockImplementation(async (input) =>
        mockImportObsidianVault(input)
      );

    const onImported = vi.fn();
    const onClose = vi.fn();

    render(
      <ObsidianImportModal
        isOpen={true}
        onClose={onClose}
        onImported={onImported}
      />
    );

    // Select Archivo (archivados) and set optional override
    fireEvent.click(
      screen.getByRole('button', { name: 'Archivo (archivados)' })
    );
    fireEvent.change(
      screen.getByLabelText(/Nombre de anotador único/i),
      { target: { value: 'Mi Archivo Obsidian' } }
    );

    // Simulate folder selection via fallback input with webkitRelativePath
    const mdFileA = new File(['Ver [[Nota B]].'], 'Nota A.md', {
      type: 'text/markdown',
    });
    Object.defineProperty(mdFileA, 'webkitRelativePath', {
      value: 'Vault2025/Carpeta/Nota A.md',
    });
    const mdFileB = new File(['Contenido B'], 'Nota B.md', {
      type: 'text/markdown',
    });
    Object.defineProperty(mdFileB, 'webkitRelativePath', {
      value: 'Vault2025/Carpeta/Nota B.md',
    });
    const ignoredFile = new File(['{}'], 'app.json', {
      type: 'application/json',
    });
    Object.defineProperty(ignoredFile, 'webkitRelativePath', {
      value: 'Vault2025/.obsidian/app.json',
    });

    const folderInput = screen.getByTestId('obsidian-folder-input');
    fireEvent.change(folderInput, {
      target: { files: [mdFileA, mdFileB, ignoredFile] },
    });

    const summary = await screen.findByTestId('obsidian-import-summary');
    expect(summary).toHaveTextContent('2 notas importadas · 1 enlace resuelto');
    expect(summary).toHaveTextContent('Mi Archivo Obsidian');
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(importSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        targetStatus: 'archived',
        courseNameOverride: 'Mi Archivo Obsidian',
        vaultDir: 'Vault2025',
      })
    );

    // Verify native Electron API trigger path too
    importSpy.mockRestore();
    const nativeImportMock = vi.fn().mockResolvedValue({
      canceled: false,
      vaultPath: '/tmp/Obsidian',
      coursesCreated: [],
      notesImportedCount: 4,
      linksResolvedCount: 2,
    });
    window.cursadaApi = {
      importObsidianVault: nativeImportMock,
    };

    fireEvent.click(
      screen.getByRole('button', { name: 'Elegir carpeta de Obsidian' })
    );

    await waitFor(() => {
      expect(nativeImportMock).toHaveBeenCalledWith({
        targetStatus: 'archived',
        courseNameOverride: 'Mi Archivo Obsidian',
      });
    });
    expect(
      await screen.findByTestId('obsidian-import-summary')
    ).toHaveTextContent('4 notas importadas · 2 enlaces resueltos');
  });

  it('enforces Swiss zero-ornament rules on src/styles/knowledge.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/knowledge.css');
    const raw = fs.readFileSync(cssPath, 'utf8');
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(stripped).not.toMatch(
      /(?:linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\s*\(/i
    );

    const radiusMatches = stripped.matchAll(
      /border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;\}]+)/gi
    );
    for (const match of radiusMatches) {
      expect(match[1].trim()).toMatch(/^(?:0(?:px)?|var\(--radius-(?:sm|md|lg)\))$/i);
    }

    const shadowMatches = stripped.matchAll(/box-shadow\s*:\s*([^;\}]+)/gi);
    for (const match of shadowMatches) {
      expect(match[1].trim()).toBe('none');
    }
  });
});
