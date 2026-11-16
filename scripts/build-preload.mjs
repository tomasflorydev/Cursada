import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Compiles `electron/preload.ts` into CommonJS `dist-electron/preload.cjs`
 * so `sandbox: true` BrowserWindows can load the preload script inside an ESM package.
 *
 * @param {string} [projectRoot]
 * @returns {string}
 */
export function buildSandboxedPreload(projectRoot) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const resolvedRoot = path.resolve(projectRoot ?? path.resolve(scriptDir, '..'));
  const sourcePath = path.join(resolvedRoot, 'electron', 'preload.ts');
  const outDir = path.join(resolvedRoot, 'dist-electron');
  const outPath = path.join(outDir, 'preload.cjs');

  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(sourceText, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
      strict: true,
    },
  });

  const errors = (transpiled.diagnostics ?? []).filter(
    (diag) => diag.category === ts.DiagnosticCategory.Error
  );
  if (errors.length > 0) {
    const messages = errors
      .map((diag) => ts.flattenDiagnosticMessageText(diag.messageText, '\n'))
      .join('; ');
    throw new Error(`Error compilando preload.cjs: ${messages}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, transpiled.outputText, 'utf8');
  return outPath;
}

const isMainExecution =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainExecution) {
  buildSandboxedPreload();
}
