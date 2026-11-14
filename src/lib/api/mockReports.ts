import type {
  GenerateStudyReportInput,
  GenerateStudyReportResult,
} from '../../types/domain';

export async function mockGenerateStudyReport(
  _input: GenerateStudyReportInput
): Promise<GenerateStudyReportResult> {
  throw new Error('mockGenerateStudyReport not implemented');
}
