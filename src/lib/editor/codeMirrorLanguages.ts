import { LanguageDescription } from '@codemirror/language';

/**
 * Curated subset of CodeMirror language loaders for Markdown fenced code blocks.
 * Replacing `@codemirror/language-data` avoids emitting 100+ unused legacy-mode chunks.
 */
export const CURSADA_CODE_LANGUAGES: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'node', 'ecmascript'],
    extensions: ['js', 'mjs', 'cjs'],
    load: async () => {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript();
    },
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'tsx', 'jsx'],
    extensions: ['ts', 'tsx', 'jsx'],
    load: async () => {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: true, jsx: true });
    },
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py', 'python3'],
    extensions: ['py'],
    load: async () => {
      const { python } = await import('@codemirror/lang-python');
      return python();
    },
  }),
  LanguageDescription.of({
    name: 'Java',
    extensions: ['java'],
    load: async () => {
      const { java } = await import('@codemirror/lang-java');
      return java();
    },
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sqlite', 'mysql', 'postgres', 'postgresql'],
    extensions: ['sql'],
    load: async () => {
      const { sql } = await import('@codemirror/lang-sql');
      return sql();
    },
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json5'],
    extensions: ['json'],
    load: async () => {
      const { json } = await import('@codemirror/lang-json');
      return json();
    },
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['htm'],
    extensions: ['html', 'htm'],
    load: async () => {
      const { html } = await import('@codemirror/lang-html');
      return html();
    },
  }),
  LanguageDescription.of({
    name: 'CSS',
    extensions: ['css'],
    load: async () => {
      const { css } = await import('@codemirror/lang-css');
      return css();
    },
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['c', 'cpp', 'c++', 'h', 'hpp'],
    extensions: ['c', 'h', 'cpp', 'cc', 'hpp'],
    load: async () => {
      const { cpp } = await import('@codemirror/lang-cpp');
      return cpp();
    },
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yml'],
    extensions: ['yaml', 'yml'],
    load: async () => {
      const { yaml } = await import('@codemirror/lang-yaml');
      return yaml();
    },
  }),
];

/**
 * Computes the minimal prefix/suffix incremental text change between two strings
 * so CodeMirror updates only the edited slice rather than replacing the whole document.
 */
export function computeMinimalTextDiff(
  prevText: string,
  nextText: string
): { from: number; to: number; insert: string } | null {
  if (prevText === nextText) {
    return null;
  }

  let start = 0;
  const minLen = Math.min(prevText.length, nextText.length);
  while (
    start < minLen &&
    prevText.charCodeAt(start) === nextText.charCodeAt(start)
  ) {
    start += 1;
  }

  let prevEnd = prevText.length;
  let nextEnd = nextText.length;
  while (
    prevEnd > start &&
    nextEnd > start &&
    prevText.charCodeAt(prevEnd - 1) === nextText.charCodeAt(nextEnd - 1)
  ) {
    prevEnd -= 1;
    nextEnd -= 1;
  }

  return {
    from: start,
    to: prevEnd,
    insert: nextText.slice(start, nextEnd),
  };
}
