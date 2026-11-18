import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cursadaClient } from '../../lib/api/client';
import {
  buildInteractivePracticeExam,
  evaluateSimulationQuestion,
  formatSimulationAttemptAsMarkdown,
  gradePracticeExamAttempt,
} from '../../lib/simulator/practiceExamSimulator';
import type {
  ExamStageTag,
  NoteWithCourse,
  PracticeExamFormat,
  PracticeExamSimulationAttempt,
  Source,
} from '../../types/domain';
import {
  SwissButton,
  SwissCitationBadge,
  SwissEmptyState,
  SwissErrorAlert,
} from '../../ui';

export interface SimulatorCitationTarget {
  index: number;
  sourceId: string;
  title: string;
  kind: 'note' | 'source';
}

export interface PracticeExamSimulatorModalProps {
  isOpen: boolean;
  courseId: string;
  courseName: string;
  examStage?: ExamStageTag | 'all';
  sources: Source[];
  notes: NoteWithCourse[];
  initialMarkdown?: string;
  questionCount?: number;
  format?: PracticeExamFormat;
  onClose: () => void;
  onCitationClick?: (citation: SimulatorCitationTarget) => void;
  onSavedNote?: (note: NoteWithCourse) => void;
}

const EXAM_STAGE_LABELS: Record<ExamStageTag | 'all', string> = {
  parcial_1: '1° Parcial',
  parcial_2: '2° Parcial',
  final: 'Final',
  general: 'General',
  all: 'Todas las instancias',
};

export function PracticeExamSimulatorModal({
  isOpen,
  courseId,
  courseName,
  examStage = 'all',
  sources,
  notes,
  initialMarkdown,
  questionCount,
  format = 'mixed',
  onClose,
  onCitationClick,
  onSavedNote,
}: PracticeExamSimulatorModalProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const questions = useMemo(() => {
    if (!isOpen) {
      return [];
    }
    return buildInteractivePracticeExam({
      courseId,
      courseName,
      examStage,
      sources,
      notes,
      questionCount,
      format,
      generatedMarkdown: initialMarkdown,
    });
  }, [
    isOpen,
    courseId,
    courseName,
    examStage,
    sources,
    notes,
    questionCount,
    format,
    initialMarkdown,
  ]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<PracticeExamSimulationAttempt | null>(
    null
  );
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [savedNote, setSavedNote] = useState<NoteWithCourse | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset attempt state whenever modal opens or questions regenerate
  useEffect(() => {
    if (isOpen) {
      setAnswers({});
      setAttempt(null);
      setIsSavingNote(false);
      setSavedNote(null);
      setSaveError(null);
    }
  }, [isOpen, courseId, examStage, initialMarkdown]);

  // Sync native <dialog> open/close safely in both Chromium and jsdom
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (isOpen) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else {
        dialog.setAttribute('open', '');
      }
    } else {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      dialog.returnValue = '';
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function handleOptionSelect(questionId: string, letter: string): void {
    if (attempt) return;
    setAnswers((prev) => ({ ...prev, [questionId]: letter }));
  }

  function handleDevelopChange(questionId: string, text: string): void {
    if (attempt) return;
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
  }

  function handleSubmitExam(): void {
    const graded = gradePracticeExamAttempt({
      courseId,
      courseName,
      examStage,
      questions,
      answers,
    });
    setAttempt(graded);
  }

  function handleRetry(): void {
    setAnswers({});
    setAttempt(null);
    setSavedNote(null);
    setSaveError(null);
  }

  async function handleSaveAsNote(): Promise<void> {
    if (!attempt || isSavingNote || savedNote) {
      return;
    }
    setIsSavingNote(true);
    setSaveError(null);
    try {
      const stageTag: ExamStageTag =
        examStage && examStage !== 'all' ? examStage : 'general';
      const stageLabel = EXAM_STAGE_LABELS[examStage] ?? 'General';
      const created = await cursadaClient.createNote({
        courseId,
        title: `Simulacro — ${courseName} (${stageLabel})`,
        content: formatSimulationAttemptAsMarkdown(attempt),
        origin: 'ai_practice_exam',
        examStage: stageTag,
      });
      setSavedNote(created);
      onSavedNote?.(created);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el resultado del simulacro como nota.'
      );
    } finally {
      setIsSavingNote(false);
    }
  }

  const answeredCount = questions.filter(
    (q) => (answers[q.id] ?? '').trim().length > 0
  ).length;
  const stageLabel = EXAM_STAGE_LABELS[examStage] ?? 'Todas las instancias';

  return (
    <dialog
      ref={dialogRef}
      className="cursada-modal-dialog simulator-modal-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="cursada-modal-content simulator-modal-content">
        <header className="cursada-modal-header simulator-modal-header">
          <div className="simulator-header-copy">
            <span className="swiss-section-label">
              Simulacro interactivo · {stageLabel}
            </span>
            <h2 id={titleId} className="simulator-modal-title">
              {courseName}
            </h2>
          </div>

          <div className="simulator-header-meta">
            <span className="swiss-meta">
              {attempt
                ? `Resultado: ${attempt.correctCount} / ${attempt.totalCount} · ${attempt.scorePercent}%`
                : `${answeredCount} / ${questions.length} respondidas`}
            </span>
            <SwissButton variant="tertiary" onClick={onClose}>
              Cerrar
            </SwissButton>
          </div>
        </header>

        {questions.length === 0 ? (
          <SwissEmptyState
            title="Sin material suficiente para armar el simulacro"
            description="Subí una fuente indexada o creá al menos una nota en esta instancia de examen para practicar."
            actionLabel="Cerrar"
            onAction={onClose}
          />
        ) : (
          <>
            {attempt ? (
              <section
                className="simulator-score-banner"
                aria-label="Resultado del simulacro"
                data-testid="simulator-score-banner"
              >
                <div className="simulator-score-main">
                  <span className="simulator-score-number">
                    {attempt.correctCount} / {attempt.totalCount} ·{' '}
                    {attempt.scorePercent}%
                  </span>
                  <span className="swiss-meta-md">
                    Corrección completa con citas verificables de tus fuentes y notas.
                  </span>
                </div>
                <div className="simulator-score-actions">
                  <SwissButton
                    variant="primary"
                    disabled={isSavingNote || Boolean(savedNote)}
                    onClick={() => void handleSaveAsNote()}
                  >
                    {savedNote
                      ? 'Resultado guardado en Notas'
                      : isSavingNote
                        ? 'Guardando…'
                        : 'Guardar resultado como nota'}
                  </SwissButton>
                  <SwissButton variant="secondary" onClick={handleRetry}>
                    Reintentar
                  </SwissButton>
                </div>
              </section>
            ) : null}

            {saveError ? <SwissErrorAlert message={saveError} /> : null}

            <ol className="simulator-questions-list">
              {questions.map((question) => {
                const selectedValue = answers[question.id] ?? '';
                const evaluated = attempt
                  ? evaluateSimulationQuestion(question, selectedValue)
                  : null;

                return (
                  <li
                    key={question.id}
                    className={`simulator-question-card ${
                      evaluated
                        ? evaluated.status === 'correct'
                          ? 'is-correct'
                          : evaluated.status === 'incorrect'
                            ? 'is-incorrect'
                            : 'is-review'
                        : ''
                    }`.trim()}
                  >
                    <div className="simulator-question-head">
                      <span className="swiss-section-label">
                        Pregunta {question.number} ·{' '}
                        {question.kind === 'multiple_choice'
                          ? 'Opción múltiple'
                          : 'Desarrollo'}
                      </span>

                      {evaluated ? (
                        <span
                          className={`simulator-result-badge is-${evaluated.status}`.trim()}
                        >
                          {evaluated.status === 'correct'
                            ? 'Correcta'
                            : evaluated.status === 'incorrect'
                              ? 'Incorrecta'
                              : 'Revisar pauta'}
                        </span>
                      ) : null}
                    </div>

                    <p className="simulator-question-prompt">{question.prompt}</p>

                    {question.kind === 'multiple_choice' && question.options ? (
                      <fieldset
                        className="simulator-options-group"
                        disabled={Boolean(attempt)}
                      >
                        <legend className="visually-hidden">
                          Opciones de la pregunta {question.number}
                        </legend>
                        {question.options.map((opt) => {
                          const isSelected = selectedValue === opt.letter;
                          const isCorrectOption =
                            Boolean(attempt) &&
                            question.correctOption === opt.letter;
                          const isWrongSelected =
                            Boolean(attempt) &&
                            isSelected &&
                            question.correctOption !== opt.letter;

                          return (
                            <label
                              key={opt.letter}
                              className={`simulator-option-row ${
                                isSelected ? 'is-selected' : ''
                              } ${isCorrectOption ? 'is-correct-option' : ''} ${
                                isWrongSelected ? 'is-wrong-option' : ''
                              }`.trim()}
                            >
                              <input
                                type="radio"
                                name={question.id}
                                value={opt.letter}
                                checked={isSelected}
                                disabled={Boolean(attempt)}
                                onChange={() =>
                                  handleOptionSelect(question.id, opt.letter)
                                }
                              />
                              <span className="simulator-option-letter">
                                {opt.letter})
                              </span>
                              <span className="simulator-option-text">
                                {opt.text}
                              </span>
                            </label>
                          );
                        })}
                      </fieldset>
                    ) : (
                      <div className="simulator-develop-field">
                        <label
                          htmlFor={`${baseId}-${question.id}-dev`}
                          className="simulator-field-label"
                        >
                          Tu respuesta
                        </label>
                        <textarea
                          id={`${baseId}-${question.id}-dev`}
                          rows={3}
                          className="swiss-input simulator-develop-textarea"
                          placeholder="Escribí tu desarrollo conceptual acá…"
                          value={selectedValue}
                          disabled={Boolean(attempt)}
                          onChange={(e) =>
                            handleDevelopChange(question.id, e.target.value)
                          }
                        />
                      </div>
                    )}

                    {/* Answers, explanations, and citations stay strictly hidden until submission */}
                    {attempt ? (
                      <div
                        className="simulator-feedback-box"
                        data-testid={`simulator-feedback-${question.id}`}
                      >
                        <p className="simulator-model-answer">
                          <strong>Pauta esperada:</strong> {question.modelAnswer}
                        </p>
                        <p className="simulator-explanation">
                          {question.explanation}
                        </p>
                        <div className="simulator-citation-row">
                          <SwissCitationBadge
                            index={question.citationIndex}
                            title={`Ir a ${question.citationTitle}`}
                            onClick={
                              onCitationClick
                                ? () =>
                                    onCitationClick({
                                      index: question.citationIndex,
                                      sourceId: question.citationSourceId,
                                      title: question.citationTitle,
                                      kind: question.citationKind,
                                    })
                                : undefined
                            }
                          />
                          <span className="swiss-meta">
                            {question.citationKind === 'note' ? 'Nota' : 'Fuente'}:{' '}
                            {question.citationTitle}
                            {question.pageLabel ? ` · ${question.pageLabel}` : ''}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {!attempt ? (
              <footer className="cursada-modal-footer simulator-modal-footer">
                <span className="swiss-meta">
                  Las respuestas correctas y citas se muestran al corregir el simulacro.
                </span>
                <div className="simulator-footer-actions">
                  <SwissButton variant="tertiary" onClick={onClose}>
                    Cancelar
                  </SwissButton>
                  <SwissButton variant="primary" onClick={handleSubmitExam}>
                    Finalizar y corregir simulacro
                  </SwissButton>
                </div>
              </footer>
            ) : null}
          </>
        )}
      </div>
    </dialog>
  );
}
