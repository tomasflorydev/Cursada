export type ReportLanguageOption = 'es' | 'en' | 'auto';

export const REPORT_LANGUAGE_KEY = 'cursada-ai-report-language';
export const CITE_SOURCES_KEY = 'cursada-ai-cite-sources';

export function readStoredReportLanguage(): ReportLanguageOption {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(REPORT_LANGUAGE_KEY);
      if (value === 'es' || value === 'en' || value === 'auto') {
        return value;
      }
    }
  } catch {
    // Ignore storage access errors in restricted environments.
  }
  return 'es';
}

export function writeStoredReportLanguage(lang: ReportLanguageOption): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(REPORT_LANGUAGE_KEY, lang);
    }
  } catch {
    // Ignore storage access errors.
  }
}

export function readStoredCiteSources(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(CITE_SOURCES_KEY);
      if (value === 'false') return false;
      if (value === 'true') return true;
    }
  } catch {
    // Ignore storage access errors.
  }
  return true;
}

export function writeStoredCiteSources(enabled: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CITE_SOURCES_KEY, String(enabled));
    }
  } catch {
    // Ignore storage access errors.
  }
}

export function readAiReportPreferences(): {
  reportLanguage: ReportLanguageOption;
  citeSources: boolean;
} {
  return {
    reportLanguage: readStoredReportLanguage(),
    citeSources: readStoredCiteSources(),
  };
}
