import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Fragment } from 'react';

export interface SwissButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function SwissButton({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...rest
}: SwissButtonProps) {
  const variantClass = variant === 'primary' ? 'swiss-btn-primary' : 'swiss-btn-secondary';
  return (
    <button
      type={type}
      className={`${variantClass} ${className}`.trim()}
      {...rest}
    />
  );
}

export interface SwissLinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  underlined?: boolean;
}

export function SwissLinkButton({
  underlined = false,
  className = '',
  type = 'button',
  ...rest
}: SwissLinkButtonProps) {
  return (
    <button
      type={type}
      className={`swiss-link ${underlined ? 'is-underlined' : ''} ${className}`.trim()}
      {...rest}
    />
  );
}

export interface SwissCheckboxProps {
  checked: boolean;
  muted?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: () => void;
}

export function SwissCheckbox({
  checked,
  muted = false,
  disabled = false,
  ariaLabel,
  onChange,
}: SwissCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      className={`swiss-checkbox-btn ${checked ? 'is-checked' : ''} ${muted ? 'is-muted' : ''}`.trim()}
    >
      {checked ? (
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.2 6.3L4.9 9L9.8 3.2"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
      ) : null}
    </button>
  );
}

export interface SwissSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
}

export function SwissSwitch({
  checked,
  onChange,
  ariaLabel,
  id,
  disabled = false,
}: SwissSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`swiss-switch ${checked ? 'is-on' : ''}`.trim()}
    >
      <span className="swiss-switch-knob" aria-hidden="true" />
    </button>
  );
}

export interface SwissSegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SwissSegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<SwissSegmentedOption<T>>;
  onChange: (next: T) => void;
  ariaLabel: string;
}

export function SwissSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SwissSegmentedProps<T>) {
  return (
    <div className="swiss-segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={`swiss-segmented-btn ${isActive ? 'is-active' : ''}`.trim()}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface SwissSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function SwissSelect({ className = '', children, ...rest }: SwissSelectProps) {
  return (
    <span className="swiss-select-wrap">
      <select className={`swiss-select ${className}`.trim()} {...rest}>
        {children}
      </select>
      <span className="swiss-select-caret" aria-hidden="true">
        ▾
      </span>
    </span>
  );
}

export interface SwissSectionHeaderProps {
  title: string;
  right?: ReactNode;
  subtle?: boolean;
}

export function SwissSectionHeader({
  title,
  right,
  subtle = false,
}: SwissSectionHeaderProps) {
  return (
    <div className={`swiss-section-head ${subtle ? 'is-subtle' : ''}`.trim()}>
      <h2 className="swiss-section-label">{title}</h2>
      {right ? <div className="swiss-meta">{right}</div> : null}
    </div>
  );
}

export interface SwissProgressBarProps {
  value: number;
  max: number;
  ariaLabel?: string;
}

export function SwissProgressBar({ value, max, ariaLabel }: SwissProgressBarProps) {
  const safeMax = max <= 0 ? 1 : max;
  const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));
  return (
    <div
      className="swiss-progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={ariaLabel}
    >
      <div className="swiss-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export interface SwissCitationBadgeProps {
  index: number;
  title?: string;
  onClick?: () => void;
}

export function SwissCitationBadge({
  index,
  title,
  onClick,
}: SwissCitationBadgeProps) {
  if (onClick) {
    return (
      <button
        type="button"
        className="swiss-citation"
        title={title ?? `Ir a fuente [${index}]`}
        aria-label={`Fuente [${index}]`}
        onClick={onClick}
      >
        [{index}]
      </button>
    );
  }
  return (
    <span className="swiss-citation" title={title}>
      [{index}]
    </span>
  );
}

export function SwissTitleUnderline() {
  return <div className="swiss-title-underline" aria-hidden="true" />;
}

export interface SwissLoadingBarProps {
  text?: string;
}

export function SwissLoadingBar({ text = 'Generando informe…' }: SwissLoadingBarProps) {
  return (
    <div className="swiss-loading" role="status" aria-live="polite">
      <div className="swiss-loading-track">
        <div className="swiss-loading-bar" />
      </div>
      <span className="swiss-loading-text">{text}</span>
    </div>
  );
}

export interface SwissErrorAlertProps {
  message: string;
}

export function SwissErrorAlert({ message }: SwissErrorAlertProps) {
  return (
    <div className="swiss-error" role="alert">
      {message}
    </div>
  );
}

export interface SwissEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SwissEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: SwissEmptyStateProps) {
  return (
    <div className="swiss-empty">
      <p className="swiss-empty-title">{title}</p>
      <p className="swiss-empty-body">{description}</p>
      {actionLabel && onAction ? (
        <SwissButton variant="secondary" onClick={onAction}>
          {actionLabel}
        </SwissButton>
      ) : null}
    </div>
  );
}

export function renderTextWithCitations(
  text: string,
  onCitationClick?: (citationIndex: number) => void
): ReactNode {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, idx) => {
    const match = /^\[(\d+)\]$/.exec(part);
    if (!match) {
      return <Fragment key={idx}>{part}</Fragment>;
    }
    const citationNumber = Number(match[1]);
    return (
      <SwissCitationBadge
        key={`${idx}-${citationNumber}`}
        index={citationNumber}
        onClick={
          onCitationClick ? () => onCitationClick(citationNumber) : undefined
        }
      />
    );
  });
}
