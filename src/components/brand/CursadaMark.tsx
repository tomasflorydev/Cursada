import markSvg from '../../assets/cursada-mark.svg?raw';

interface CursadaMarkProps {
  /** Height of the mark in px (minimum 16px per docs/brand.md). */
  size?: number;
  className?: string;
}

/**
 * Cursada mark (C + coral dot). The SVG is inlined so the C inherits
 * `currentColor` from the surrounding text; the dot stays coral.
 */
export function CursadaMark({ size = 24, className }: CursadaMarkProps) {
  const height = Math.max(size, 16);
  return (
    <span
      className={className ? `cursada-mark ${className}` : 'cursada-mark'}
      style={{ height }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markSvg }}
    />
  );
}
