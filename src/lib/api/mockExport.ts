import type {
  ExportMarkdownRequest,
  ExportMarkdownResult,
} from '../../types/domain';

export async function mockExportMarkdown(
  request: ExportMarkdownRequest
): Promise<ExportMarkdownResult> {
  return {
    canceled: false,
    targetDir: request.targetDir ?? null,
    filesCreated: [],
    fileCount: 0,
    mode: 'download',
  };
}
