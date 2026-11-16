import { Fragment, type ReactNode } from 'react';
import { SwissCitationBadge } from '../../ui';

type MathStyleKind = 'cal' | 'bb' | 'bf' | 'rm' | 'it' | 'tt' | 'sf';
type MathAccentKind =
  | 'hat'
  | 'bar'
  | 'tilde'
  | 'vec'
  | 'dot'
  | 'ddot'
  | 'overline'
  | 'underline';
type MatrixEnvKind =
  | 'bmatrix'
  | 'pmatrix'
  | 'vmatrix'
  | 'Vmatrix'
  | 'Bmatrix'
  | 'matrix'
  | 'cases'
  | 'aligned';

type SymbolCategory = 'op' | 'rel' | 'punct' | 'greek' | 'delim' | 'misc';

type MathNode =
  | { type: 'text'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'number'; value: string }
  | { type: 'symbol'; value: string; category: SymbolCategory; bigOp?: boolean; defaultLimits?: boolean }
  | { type: 'func'; name: string; defaultLimits?: boolean }
  | { type: 'style'; style: MathStyleKind; children: MathNode[] }
  | { type: 'frac'; num: MathNode[]; den: MathNode[] }
  | { type: 'binom'; top: MathNode[]; bottom: MathNode[] }
  | { type: 'sqrt'; index: MathNode[] | null; body: MathNode[] }
  | { type: 'accent'; accent: MathAccentKind; body: MathNode[] }
  | {
      type: 'scripted';
      base: MathNode;
      sub: MathNode[] | null;
      sup: MathNode[] | null;
      forceLimits: boolean | null;
    }
  | { type: 'matrix'; env: MatrixEnvKind; rows: MathNode[][][] }
  | { type: 'group'; children: MathNode[] }
  | { type: 'space'; size: 'thin' | 'med' | 'thick' | 'quad' | 'qquad' };

const GREEK_LOWER: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
};

const GREEK_UPPER: Record<string, string> = {
  Alpha: 'Α',
  Beta: 'Β',
  Gamma: 'Γ',
  Delta: 'Δ',
  Epsilon: 'Ε',
  Zeta: 'Ζ',
  Eta: 'Η',
  Theta: 'Θ',
  Iota: 'Ι',
  Kappa: 'Κ',
  Lambda: 'Λ',
  Mu: 'Μ',
  Nu: 'Ν',
  Xi: 'Ξ',
  Omicron: 'Ο',
  Pi: 'Π',
  Rho: 'Ρ',
  Sigma: 'Σ',
  Tau: 'Τ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Chi: 'Χ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

interface SymbolDef {
  glyph: string;
  category: SymbolCategory;
  bigOp?: boolean;
  defaultLimits?: boolean;
}

const SYMBOL_COMMANDS: Record<string, SymbolDef> = {
  // Arithmetic & binary operators
  cdot: { glyph: '·', category: 'op' },
  cdots: { glyph: '⋯', category: 'misc' },
  ldots: { glyph: '…', category: 'misc' },
  dots: { glyph: '…', category: 'misc' },
  vdots: { glyph: '⋮', category: 'misc' },
  ddots: { glyph: '⋱', category: 'misc' },
  times: { glyph: '×', category: 'op' },
  div: { glyph: '÷', category: 'op' },
  pm: { glyph: '±', category: 'op' },
  mp: { glyph: '∓', category: 'op' },
  ast: { glyph: '∗', category: 'op' },
  star: { glyph: '⋆', category: 'op' },
  circ: { glyph: '∘', category: 'op' },
  bullet: { glyph: '•', category: 'op' },
  oplus: { glyph: '⊕', category: 'op' },
  ominus: { glyph: '⊖', category: 'op' },
  otimes: { glyph: '⊗', category: 'op' },
  odot: { glyph: '⊙', category: 'op' },
  wedge: { glyph: '∧', category: 'op' },
  vee: { glyph: '∨', category: 'op' },
  land: { glyph: '∧', category: 'op' },
  lor: { glyph: '∨', category: 'op' },
  setminus: { glyph: '∖', category: 'op' },

  // Big operators
  sum: { glyph: '∑', category: 'op', bigOp: true, defaultLimits: true },
  prod: { glyph: '∏', category: 'op', bigOp: true, defaultLimits: true },
  coprod: { glyph: '∐', category: 'op', bigOp: true, defaultLimits: true },
  int: { glyph: '∫', category: 'op', bigOp: true, defaultLimits: false },
  iint: { glyph: '∬', category: 'op', bigOp: true, defaultLimits: false },
  iiint: { glyph: '∭', category: 'op', bigOp: true, defaultLimits: false },
  oint: { glyph: '∮', category: 'op', bigOp: true, defaultLimits: false },
  bigcup: { glyph: '⋃', category: 'op', bigOp: true, defaultLimits: true },
  bigcap: { glyph: '⋂', category: 'op', bigOp: true, defaultLimits: true },
  bigoplus: { glyph: '⨁', category: 'op', bigOp: true, defaultLimits: true },
  bigotimes: { glyph: '⨂', category: 'op', bigOp: true, defaultLimits: true },

  // Relations
  leq: { glyph: '≤', category: 'rel' },
  le: { glyph: '≤', category: 'rel' },
  geq: { glyph: '≥', category: 'rel' },
  ge: { glyph: '≥', category: 'rel' },
  neq: { glyph: '≠', category: 'rel' },
  ne: { glyph: '≠', category: 'rel' },
  approx: { glyph: '≈', category: 'rel' },
  equiv: { glyph: '≡', category: 'rel' },
  cong: { glyph: '≅', category: 'rel' },
  sim: { glyph: '∼', category: 'rel' },
  simeq: { glyph: '≃', category: 'rel' },
  propto: { glyph: '∝', category: 'rel' },
  ll: { glyph: '≪', category: 'rel' },
  gg: { glyph: '≫', category: 'rel' },
  prec: { glyph: '≺', category: 'rel' },
  succ: { glyph: '≻', category: 'rel' },
  preceq: { glyph: '⪯', category: 'rel' },
  succeq: { glyph: '⪰', category: 'rel' },
  mid: { glyph: '∣', category: 'rel' },
  parallel: { glyph: '∥', category: 'rel' },
  perp: { glyph: '⊥', category: 'rel' },
  models: { glyph: '⊨', category: 'rel' },
  vdash: { glyph: '⊢', category: 'rel' },

  // Sets & logic
  in: { glyph: '∈', category: 'rel' },
  notin: { glyph: '∉', category: 'rel' },
  ni: { glyph: '∋', category: 'rel' },
  subset: { glyph: '⊂', category: 'rel' },
  subseteq: { glyph: '⊆', category: 'rel' },
  supset: { glyph: '⊃', category: 'rel' },
  supseteq: { glyph: '⊇', category: 'rel' },
  nsubseteq: { glyph: '⊈', category: 'rel' },
  cup: { glyph: '∪', category: 'op' },
  cap: { glyph: '∩', category: 'op' },
  emptyset: { glyph: '∅', category: 'misc' },
  varnothing: { glyph: '∅', category: 'misc' },
  forall: { glyph: '∀', category: 'misc' },
  exists: { glyph: '∃', category: 'misc' },
  nexists: { glyph: '∄', category: 'misc' },
  neg: { glyph: '¬', category: 'misc' },
  lnot: { glyph: '¬', category: 'misc' },
  therefore: { glyph: '∴', category: 'rel' },
  because: { glyph: '∵', category: 'rel' },

  // Arrows
  to: { glyph: '→', category: 'rel' },
  rightarrow: { glyph: '→', category: 'rel' },
  leftarrow: { glyph: '←', category: 'rel' },
  gets: { glyph: '←', category: 'rel' },
  leftrightarrow: { glyph: '↔', category: 'rel' },
  Rightarrow: { glyph: '⇒', category: 'rel' },
  implies: { glyph: '⇒', category: 'rel' },
  Leftarrow: { glyph: '⇐', category: 'rel' },
  impliedby: { glyph: '⇐', category: 'rel' },
  Leftrightarrow: { glyph: '⇔', category: 'rel' },
  iff: { glyph: '⟺', category: 'rel' },
  longrightarrow: { glyph: '⟶', category: 'rel' },
  longleftarrow: { glyph: '⟵', category: 'rel' },
  longleftrightarrow: { glyph: '⟷', category: 'rel' },
  Longrightarrow: { glyph: '⟹', category: 'rel' },
  mapsto: { glyph: '↦', category: 'rel' },
  uparrow: { glyph: '↑', category: 'rel' },
  downarrow: { glyph: '↓', category: 'rel' },

  // Miscellaneous scientific symbols
  infty: { glyph: '∞', category: 'misc' },
  partial: { glyph: '∂', category: 'misc' },
  nabla: { glyph: '∇', category: 'misc' },
  hbar: { glyph: 'ℏ', category: 'misc' },
  ell: { glyph: 'ℓ', category: 'misc' },
  Re: { glyph: 'ℜ', category: 'misc' },
  Im: { glyph: 'ℑ', category: 'misc' },
  aleph: { glyph: 'ℵ', category: 'misc' },
  wp: { glyph: '℘', category: 'misc' },
  prime: { glyph: '′', category: 'misc' },
  angle: { glyph: '∠', category: 'misc' },
  triangle: { glyph: '△', category: 'misc' },
  square: { glyph: '□', category: 'misc' },
  degree: { glyph: '°', category: 'misc' },
  circledcirc: { glyph: '⊚', category: 'op' },

  // Delimiters
  langle: { glyph: '⟨', category: 'delim' },
  rangle: { glyph: '⟩', category: 'delim' },
  lfloor: { glyph: '⌊', category: 'delim' },
  rfloor: { glyph: '⌋', category: 'delim' },
  lceil: { glyph: '⌈', category: 'delim' },
  rceil: { glyph: '⌉', category: 'delim' },
  lbrace: { glyph: '{', category: 'delim' },
  rbrace: { glyph: '}', category: 'delim' },
  Vert: { glyph: '‖', category: 'delim' },
  vert: { glyph: '|', category: 'delim' },
};

const NAMED_FUNCTIONS = new Set([
  'log',
  'ln',
  'lg',
  'exp',
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'coth',
  'det',
  'dim',
  'gcd',
  'lcm',
  'ker',
  'deg',
  'hom',
  'arg',
  'Pr',
  'mod',
  'bmod',
  'pmod',
]);

const LIMIT_FUNCTIONS = new Set([
  'lim',
  'limsup',
  'liminf',
  'max',
  'min',
  'sup',
  'inf',
  'argmax',
  'argmin',
]);

const BLACKBOARD_CHARS: Record<string, string> = {
  C: 'ℂ',
  H: 'ℍ',
  N: 'ℕ',
  P: 'ℙ',
  Q: 'ℚ',
  R: 'ℝ',
  Z: 'ℤ',
};

const ACCENT_MAP: Record<string, MathAccentKind> = {
  hat: 'hat',
  widehat: 'hat',
  bar: 'bar',
  tilde: 'tilde',
  widetilde: 'tilde',
  vec: 'vec',
  dot: 'dot',
  ddot: 'ddot',
  overline: 'overline',
  underline: 'underline',
};

const STYLE_MAP: Record<string, MathStyleKind> = {
  mathcal: 'cal',
  mathbb: 'bb',
  mathbf: 'bf',
  boldsymbol: 'bf',
  bm: 'bf',
  mathrm: 'rm',
  mathit: 'it',
  mathtt: 'tt',
  mathsf: 'sf',
};

const MATRIX_ENVS = new Set<MatrixEnvKind>([
  'bmatrix',
  'pmatrix',
  'vmatrix',
  'Vmatrix',
  'Bmatrix',
  'matrix',
  'cases',
  'aligned',
]);

class LatexParser {
  private readonly src: string;
  private pos = 0;

  constructor(src: string) {
    this.src = src;
  }

  parseAll(): MathNode[] {
    return this.parseSequence(null);
  }

  private isAtEnd(): boolean {
    return this.pos >= this.src.length;
  }

  private peek(): string {
    return this.src[this.pos] ?? '';
  }

  private skipSpaces(): void {
    while (!this.isAtEnd() && /\s/.test(this.src[this.pos])) {
      this.pos += 1;
    }
  }

  private matchEndEnv(envName: string): boolean {
    const prefix = `\\end{${envName}}`;
    return this.src.startsWith(prefix, this.pos);
  }

  private parseSequence(stopChar: string | null, stopEnv: string | null = null): MathNode[] {
    const nodes: MathNode[] = [];

    while (!this.isAtEnd()) {
      this.skipSpaces();
      if (this.isAtEnd()) break;

      const ch = this.peek();
      if (stopChar !== null && ch === stopChar) {
        break;
      }
      if (stopEnv !== null && this.matchEndEnv(stopEnv)) {
        break;
      }
      if (stopEnv !== null && (ch === '&' || this.src.startsWith('\\\\', this.pos))) {
        break;
      }

      const node = this.parseAtomWithScripts();
      if (node !== null) {
        nodes.push(node);
      }
    }

    return nodes;
  }

  private parseAtomWithScripts(): MathNode | null {
    const base = this.parseAtom();
    if (base === null) return null;

    let sub: MathNode[] | null = null;
    let sup: MathNode[] | null = null;
    let forceLimits: boolean | null = null;

    // Consume any combination of \limits, \nolimits, _, ^
    while (!this.isAtEnd()) {
      this.skipSpaces();
      if (this.src.startsWith('\\limits', this.pos)) {
        this.pos += 7;
        forceLimits = true;
        continue;
      }
      if (this.src.startsWith('\\nolimits', this.pos)) {
        this.pos += 9;
        forceLimits = false;
        continue;
      }
      const next = this.peek();
      if (next === '_' && sub === null) {
        this.pos += 1;
        sub = this.parseScriptArg();
        continue;
      }
      if (next === '^' && sup === null) {
        this.pos += 1;
        sup = this.parseScriptArg();
        continue;
      }
      break;
    }

    if (sub !== null || sup !== null) {
      return {
        type: 'scripted',
        base,
        sub,
        sup,
        forceLimits,
      };
    }

    return base;
  }

  private parseScriptArg(): MathNode[] {
    this.skipSpaces();
    if (this.isAtEnd()) return [];
    if (this.peek() === '{') {
      return this.parseBraceGroup();
    }
    const single = this.parseSingleToken();
    return single ? [single] : [];
  }

  private parseBraceGroup(): MathNode[] {
    this.skipSpaces();
    if (this.peek() !== '{') {
      const single = this.parseSingleToken();
      return single ? [single] : [];
    }
    this.pos += 1; // consume '{'
    const inner = this.parseSequence('}');
    if (this.peek() === '}') {
      this.pos += 1;
    }
    return inner;
  }

  private parseBracketOptional(): MathNode[] | null {
    this.skipSpaces();
    if (this.peek() !== '[') return null;
    this.pos += 1;
    const inner = this.parseSequence(']');
    if (this.peek() === ']') {
      this.pos += 1;
    }
    return inner;
  }

  private parseSingleToken(): MathNode | null {
    this.skipSpaces();
    if (this.isAtEnd()) return null;
    const ch = this.peek();
    if (ch === '{') {
      return { type: 'group', children: this.parseBraceGroup() };
    }
    if (ch === '\\') {
      return this.parseCommand();
    }
    this.pos += 1;
    if (/[0-9]/.test(ch)) {
      return { type: 'number', value: ch };
    }
    if (/[a-zA-Z]/.test(ch)) {
      return { type: 'ident', value: ch };
    }
    return this.classifyChar(ch);
  }

  private parseAtom(): MathNode | null {
    this.skipSpaces();
    if (this.isAtEnd()) return null;

    const ch = this.peek();

    if (ch === '_' || ch === '^') {
      // Orphan script without base (e.g. ^2)
      return { type: 'text', value: '' };
    }

    if (ch === '{') {
      return { type: 'group', children: this.parseBraceGroup() };
    }

    if (ch === '}') {
      // Unmatched closing brace; skip gracefully
      this.pos += 1;
      return null;
    }

    if (ch === '\\') {
      return this.parseCommand();
    }

    if (/[0-9]/.test(ch)) {
      const start = this.pos;
      while (!this.isAtEnd() && /[0-9.]/.test(this.src[this.pos])) {
        if (this.src[this.pos] === '.' && !/[0-9]/.test(this.src[this.pos + 1] ?? '')) {
          break;
        }
        this.pos += 1;
      }
      return { type: 'number', value: this.src.slice(start, this.pos) };
    }

    if (/[a-zA-Z]/.test(ch)) {
      this.pos += 1;
      return { type: 'ident', value: ch };
    }

    this.pos += 1;
    return this.classifyChar(ch);
  }

  private classifyChar(ch: string): MathNode {
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      return { type: 'symbol', value: ch === '-' ? '−' : ch, category: 'op' };
    }
    if (ch === '=' || ch === '<' || ch === '>') {
      return { type: 'symbol', value: ch, category: 'rel' };
    }
    if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '|') {
      return { type: 'symbol', value: ch, category: 'delim' };
    }
    if (ch === ',' || ch === ';' || ch === ':' || ch === '.') {
      return { type: 'symbol', value: ch, category: 'punct' };
    }
    if (ch === '~') {
      return { type: 'space', size: 'med' };
    }
    return { type: 'symbol', value: ch, category: 'misc' };
  }

  private readRawBraceText(): string {
    this.skipSpaces();
    if (this.peek() !== '{') {
      const ch = this.peek();
      if (ch) this.pos += 1;
      return ch;
    }
    this.pos += 1;
    let depth = 1;
    const start = this.pos;
    while (!this.isAtEnd() && depth > 0) {
      const c = this.src[this.pos];
      if (c === '\\') {
        this.pos += 2;
        continue;
      }
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      if (depth > 0) {
        this.pos += 1;
      }
    }
    const raw = this.src.slice(start, this.pos);
    if (this.peek() === '}') {
      this.pos += 1;
    }
    return raw;
  }

  private parseCommand(): MathNode | null {
    this.pos += 1; // consume '\'
    if (this.isAtEnd()) {
      return { type: 'text', value: '\\' };
    }

    const first = this.src[this.pos];

    // Single-character escaped / spacing commands
    if (!/[a-zA-Z]/.test(first)) {
      this.pos += 1;
      switch (first) {
        case ',':
          return { type: 'space', size: 'thin' };
        case ':':
        case '>':
          return { type: 'space', size: 'med' };
        case ';':
          return { type: 'space', size: 'thick' };
        case '!':
          return null;
        case ' ':
          return { type: 'space', size: 'med' };
        case '{':
        case '}':
          return { type: 'symbol', value: first, category: 'delim' };
        case '|':
          return { type: 'symbol', value: '‖', category: 'delim' };
        case '%':
        case '$':
        case '&':
        case '#':
        case '_':
          return { type: 'text', value: first };
        case '\\':
          return { type: 'space', size: 'med' };
        default:
          return { type: 'text', value: first };
      }
    }

    const start = this.pos;
    while (!this.isAtEnd() && /[a-zA-Z]/.test(this.src[this.pos])) {
      this.pos += 1;
    }
    const cmd = this.src.slice(start, this.pos);

    if (cmd === 'left' || cmd === 'right' || cmd === 'big' || cmd === 'Big' || cmd === 'bigg' || cmd === 'Bigg') {
      this.skipSpaces();
      if (this.peek() === '.') {
        this.pos += 1;
        return null;
      }
      if (this.peek() === '\\') {
        return this.parseCommand();
      }
      if (!this.isAtEnd()) {
        const delim = this.src[this.pos];
        this.pos += 1;
        return { type: 'symbol', value: delim, category: 'delim' };
      }
      return null;
    }

    if (cmd === 'quad') return { type: 'space', size: 'quad' };
    if (cmd === 'qquad') return { type: 'space', size: 'qquad' };

    if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac' || cmd === 'cfrac') {
      const num = this.parseBraceGroup();
      const den = this.parseBraceGroup();
      return { type: 'frac', num, den };
    }

    if (cmd === 'binom' || cmd === 'dbinom' || cmd === 'tbinom') {
      const top = this.parseBraceGroup();
      const bottom = this.parseBraceGroup();
      return { type: 'binom', top, bottom };
    }

    if (cmd === 'sqrt') {
      const index = this.parseBracketOptional();
      const body = this.parseBraceGroup();
      return { type: 'sqrt', index, body };
    }

    if (cmd === 'text' || cmd === 'textbf' || cmd === 'textit' || cmd === 'textrm' || cmd === 'mbox') {
      const raw = this.readRawBraceText();
      if (cmd === 'textbf') {
        return { type: 'style', style: 'bf', children: [{ type: 'text', value: raw }] };
      }
      if (cmd === 'textit') {
        return { type: 'style', style: 'it', children: [{ type: 'text', value: raw }] };
      }
      return { type: 'text', value: raw };
    }

    if (cmd === 'operatorname') {
      const raw = this.readRawBraceText();
      return { type: 'func', name: raw, defaultLimits: false };
    }

    if (cmd in STYLE_MAP) {
      const style = STYLE_MAP[cmd];
      const children = this.parseBraceGroup();
      return { type: 'style', style, children };
    }

    if (cmd in ACCENT_MAP) {
      const accent = ACCENT_MAP[cmd];
      const body = this.parseBraceGroup();
      return { type: 'accent', accent, body };
    }

    if (cmd === 'begin') {
      const rawEnv = this.readRawBraceText().trim() as MatrixEnvKind;
      if (MATRIX_ENVS.has(rawEnv)) {
        return this.parseMatrixEnvironment(rawEnv);
      }
      // Fallback for unknown environments: parse body until \end{...}
      const fallbackNodes = this.parseSequence(null, rawEnv);
      if (this.matchEndEnv(rawEnv)) {
        this.pos += `\\end{${rawEnv}}`.length;
      }
      return { type: 'group', children: fallbackNodes };
    }

    if (cmd === 'end') {
      this.readRawBraceText();
      return null;
    }

    if (cmd in GREEK_LOWER) {
      return { type: 'symbol', value: GREEK_LOWER[cmd], category: 'greek' };
    }

    if (cmd in GREEK_UPPER) {
      return { type: 'symbol', value: GREEK_UPPER[cmd], category: 'greek' };
    }

    if (cmd in SYMBOL_COMMANDS) {
      const def = SYMBOL_COMMANDS[cmd];
      return {
        type: 'symbol',
        value: def.glyph,
        category: def.category,
        bigOp: def.bigOp,
        defaultLimits: def.defaultLimits,
      };
    }

    if (NAMED_FUNCTIONS.has(cmd)) {
      return { type: 'func', name: cmd, defaultLimits: false };
    }

    if (LIMIT_FUNCTIONS.has(cmd)) {
      return { type: 'func', name: cmd, defaultLimits: true };
    }

    if (cmd === 'not') {
      this.skipSpaces();
      if (this.src.startsWith('\\in', this.pos)) {
        this.pos += 3;
        return { type: 'symbol', value: '∉', category: 'rel' };
      }
      if (this.peek() === '=') {
        this.pos += 1;
        return { type: 'symbol', value: '≠', category: 'rel' };
      }
      return { type: 'symbol', value: '̸', category: 'op' };
    }

    // Fallback for unrecognized commands
    return { type: 'func', name: cmd, defaultLimits: false };
  }

  private parseMatrixEnvironment(env: MatrixEnvKind): MathNode {
    const rows: MathNode[][][] = [];
    let currentRow: MathNode[][] = [];

    while (!this.isAtEnd()) {
      this.skipSpaces();
      if (this.matchEndEnv(env)) {
        this.pos += `\\end{${env}}`.length;
        break;
      }
      const cell = this.parseSequence(null, env);
      currentRow.push(cell);

      this.skipSpaces();
      if (this.peek() === '&') {
        this.pos += 1;
        continue;
      }
      if (this.src.startsWith('\\\\', this.pos)) {
        this.pos += 2;
        rows.push(currentRow);
        currentRow = [];
        continue;
      }
      if (this.matchEndEnv(env)) {
        this.pos += `\\end{${env}}`.length;
        break;
      }
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    return { type: 'matrix', env, rows };
  }
}

function parseLatex(latex: string): MathNode[] {
  try {
    return new LatexParser(latex ?? '').parseAll();
  } catch {
    return [{ type: 'text', value: latex ?? '' }];
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyBlackboardNodesToString(nodes: MathNode[]): string | null {
  if (nodes.length === 1 && nodes[0].type === 'ident') {
    return BLACKBOARD_CHARS[nodes[0].value] ?? null;
  }
  return null;
}

function getSpaceHtmlClass(size: 'thin' | 'med' | 'thick' | 'quad' | 'qquad'): string {
  return `katex-space-${size}`;
}

function shouldUseLimits(
  base: MathNode,
  forceLimits: boolean | null,
  displayMode: boolean
): boolean {
  if (forceLimits !== null) return forceLimits;
  if (base.type === 'func') {
    return Boolean(base.defaultLimits) && displayMode;
  }
  if (base.type === 'symbol' && base.bigOp) {
    return Boolean(base.defaultLimits) && displayMode;
  }
  return false;
}

function nodesToHtml(nodes: MathNode[], displayMode: boolean): string {
  return nodes.map((node) => nodeToHtml(node, displayMode)).join('');
}

function nodeToHtml(node: MathNode, displayMode: boolean): string {
  switch (node.type) {
    case 'text':
      return `<span class="katex-text">${escapeHtml(node.value)}</span>`;
    case 'ident':
      return `<span class="katex-var">${escapeHtml(node.value)}</span>`;
    case 'number':
      return `<span class="katex-num">${escapeHtml(node.value)}</span>`;
    case 'symbol': {
      const classes = ['katex-sym', `katex-sym-${node.category}`];
      if (node.bigOp) classes.push('katex-bigop');
      return `<span class="${classes.join(' ')}">${escapeHtml(node.value)}</span>`;
    }
    case 'func':
      return `<span class="katex-func">${escapeHtml(node.name)}</span>`;
    case 'space':
      return `<span class="${getSpaceHtmlClass(node.size)}" aria-hidden="true"></span>`;
    case 'group':
      return nodesToHtml(node.children, displayMode);
    case 'style': {
      if (node.style === 'bb') {
        const bbChar = applyBlackboardNodesToString(node.children);
        if (bbChar) {
          return `<span class="katex-bb">${escapeHtml(bbChar)}</span>`;
        }
      }
      return `<span class="katex-${node.style}">${nodesToHtml(node.children, displayMode)}</span>`;
    }
    case 'frac':
      return `<span class="katex-frac"><span class="katex-frac-num">${nodesToHtml(
        node.num,
        false
      )}</span><span class="katex-frac-den">${nodesToHtml(
        node.den,
        false
      )}</span></span>`;
    case 'binom':
      return `<span class="katex-binom"><span class="katex-delim-paren">(</span><span class="katex-binom-inner"><span class="katex-binom-top">${nodesToHtml(
        node.top,
        false
      )}</span><span class="katex-binom-bottom">${nodesToHtml(
        node.bottom,
        false
      )}</span></span><span class="katex-delim-paren">)</span></span>`;
    case 'sqrt': {
      const indexHtml = node.index
        ? `<sup class="katex-sqrt-index">${nodesToHtml(node.index, false)}</sup>`
        : '';
      return `<span class="katex-sqrt">${indexHtml}<span class="katex-sqrt-rad" aria-hidden="true">√</span><span class="katex-sqrt-body">${nodesToHtml(
        node.body,
        displayMode
      )}</span></span>`;
    }
    case 'accent': {
      const inner = nodesToHtml(node.body, displayMode);
      return `<span class="katex-accent katex-accent-${node.accent}">${inner}</span>`;
    }
    case 'scripted': {
      const useLimits = shouldUseLimits(node.base, node.forceLimits, displayMode);
      const baseHtml = nodeToHtml(node.base, displayMode);
      const subHtml = node.sub ? nodesToHtml(node.sub, false) : '';
      const supHtml = node.sup ? nodesToHtml(node.sup, false) : '';

      if (useLimits) {
        return `<span class="katex-mathop-limits">${
          node.sup ? `<span class="katex-mathop-sup">${supHtml}</span>` : ''
        }<span class="katex-mathop-sym">${baseHtml}</span>${
          node.sub ? `<span class="katex-mathop-sub">${subHtml}</span>` : ''
        }</span>`;
      }

      if (node.sub && node.sup) {
        return `${baseHtml}<span class="katex-supsub"><span class="katex-sup">${supHtml}</span><span class="katex-sub">${subHtml}</span></span>`;
      }
      if (node.sup) {
        return `${baseHtml}<sup class="katex-sup">${supHtml}</sup>`;
      }
      return `${baseHtml}<sub class="katex-sub">${subHtml}</sub>`;
    }
    case 'matrix': {
      const colCount = Math.max(
        1,
        ...node.rows.map((row) => row.length)
      );
      const rowsHtml = node.rows
        .map((row) =>
          row
            .map(
              (cell) =>
                `<span class="katex-matrix-cell">${nodesToHtml(cell, false)}</span>`
            )
            .join('')
        )
        .join('');
      const [leftDelim, rightDelim] = getMatrixDelimiters(node.env);
      const leftHtml = leftDelim
        ? `<span class="katex-matrix-delim is-left is-${node.env}" aria-hidden="true">${escapeHtml(
            leftDelim
          )}</span>`
        : '';
      const rightHtml = rightDelim
        ? `<span class="katex-matrix-delim is-right is-${node.env}" aria-hidden="true">${escapeHtml(
            rightDelim
          )}</span>`
        : '';
      return `<span class="katex-matrix-wrap is-${node.env}">${leftHtml}<span class="katex-matrix" style="grid-template-columns: repeat(${colCount}, auto)">${rowsHtml}</span>${rightHtml}</span>`;
    }
  }
}

function getMatrixDelimiters(env: MatrixEnvKind): [string, string] {
  switch (env) {
    case 'bmatrix':
      return ['[', ']'];
    case 'pmatrix':
      return ['(', ')'];
    case 'vmatrix':
      return ['|', '|'];
    case 'Vmatrix':
      return ['‖', '‖'];
    case 'Bmatrix':
      return ['{', '}'];
    case 'cases':
      return ['{', ''];
    case 'matrix':
    case 'aligned':
      return ['', ''];
  }
}

function nodesToReact(
  nodes: MathNode[],
  displayMode: boolean,
  keyPrefix: string
): ReactNode {
  return nodes.map((node, index) =>
    nodeToReact(node, displayMode, `${keyPrefix}-${index}`)
  );
}

function nodeToReact(
  node: MathNode,
  displayMode: boolean,
  key: string
): ReactNode {
  switch (node.type) {
    case 'text':
      return (
        <span key={key} className="katex-text">
          {node.value}
        </span>
      );
    case 'ident':
      return (
        <span key={key} className="katex-var">
          {node.value}
        </span>
      );
    case 'number':
      return (
        <span key={key} className="katex-num">
          {node.value}
        </span>
      );
    case 'symbol': {
      const classes = ['katex-sym', `katex-sym-${node.category}`];
      if (node.bigOp) classes.push('katex-bigop');
      return (
        <span key={key} className={classes.join(' ')}>
          {node.value}
        </span>
      );
    }
    case 'func':
      return (
        <span key={key} className="katex-func">
          {node.name}
        </span>
      );
    case 'space':
      return (
        <span
          key={key}
          className={getSpaceHtmlClass(node.size)}
          aria-hidden="true"
        />
      );
    case 'group':
      return (
        <Fragment key={key}>
          {nodesToReact(node.children, displayMode, key)}
        </Fragment>
      );
    case 'style': {
      if (node.style === 'bb') {
        const bbChar = applyBlackboardNodesToString(node.children);
        if (bbChar) {
          return (
            <span key={key} className="katex-bb">
              {bbChar}
            </span>
          );
        }
      }
      return (
        <span key={key} className={`katex-${node.style}`}>
          {nodesToReact(node.children, displayMode, key)}
        </span>
      );
    }
    case 'frac':
      return (
        <span key={key} className="katex-frac">
          <span className="katex-frac-num">
            {nodesToReact(node.num, false, `${key}-num`)}
          </span>
          <span className="katex-frac-den">
            {nodesToReact(node.den, false, `${key}-den`)}
          </span>
        </span>
      );
    case 'binom':
      return (
        <span key={key} className="katex-binom">
          <span className="katex-delim-paren">(</span>
          <span className="katex-binom-inner">
            <span className="katex-binom-top">
              {nodesToReact(node.top, false, `${key}-top`)}
            </span>
            <span className="katex-binom-bottom">
              {nodesToReact(node.bottom, false, `${key}-bot`)}
            </span>
          </span>
          <span className="katex-delim-paren">)</span>
        </span>
      );
    case 'sqrt':
      return (
        <span key={key} className="katex-sqrt">
          {node.index ? (
            <sup className="katex-sqrt-index">
              {nodesToReact(node.index, false, `${key}-idx`)}
            </sup>
          ) : null}
          <span className="katex-sqrt-rad" aria-hidden="true">
            √
          </span>
          <span className="katex-sqrt-body">
            {nodesToReact(node.body, displayMode, `${key}-body`)}
          </span>
        </span>
      );
    case 'accent':
      return (
        <span key={key} className={`katex-accent katex-accent-${node.accent}`}>
          {nodesToReact(node.body, displayMode, `${key}-acc`)}
        </span>
      );
    case 'scripted': {
      const useLimits = shouldUseLimits(node.base, node.forceLimits, displayMode);
      const baseEl = nodeToReact(node.base, displayMode, `${key}-base`);

      if (useLimits) {
        return (
          <span key={key} className="katex-mathop-limits">
            {node.sup ? (
              <span className="katex-mathop-sup">
                {nodesToReact(node.sup, false, `${key}-sup`)}
              </span>
            ) : null}
            <span className="katex-mathop-sym">{baseEl}</span>
            {node.sub ? (
              <span className="katex-mathop-sub">
                {nodesToReact(node.sub, false, `${key}-sub`)}
              </span>
            ) : null}
          </span>
        );
      }

      if (node.sub && node.sup) {
        return (
          <Fragment key={key}>
            {baseEl}
            <span className="katex-supsub">
              <span className="katex-sup">
                {nodesToReact(node.sup, false, `${key}-sup`)}
              </span>
              <span className="katex-sub">
                {nodesToReact(node.sub, false, `${key}-sub`)}
              </span>
            </span>
          </Fragment>
        );
      }

      if (node.sup) {
        return (
          <Fragment key={key}>
            {baseEl}
            <sup className="katex-sup">
              {nodesToReact(node.sup, false, `${key}-sup`)}
            </sup>
          </Fragment>
        );
      }

      return (
        <Fragment key={key}>
          {baseEl}
          <sub className="katex-sub">
            {nodesToReact(node.sub ?? [], false, `${key}-sub`)}
          </sub>
        </Fragment>
      );
    }
    case 'matrix': {
      const colCount = Math.max(
        1,
        ...node.rows.map((row) => row.length)
      );
      const [leftDelim, rightDelim] = getMatrixDelimiters(node.env);
      return (
        <span key={key} className={`katex-matrix-wrap is-${node.env}`}>
          {leftDelim ? (
            <span
              className={`katex-matrix-delim is-left is-${node.env}`}
              aria-hidden="true"
            >
              {leftDelim}
            </span>
          ) : null}
          <span
            className="katex-matrix"
            style={{ gridTemplateColumns: `repeat(${colCount}, auto)` }}
          >
            {node.rows.map((row, rIdx) =>
              row.map((cell, cIdx) => (
                <span key={`${key}-r${rIdx}-c${cIdx}`} className="katex-matrix-cell">
                  {nodesToReact(cell, false, `${key}-r${rIdx}-c${cIdx}`)}
                </span>
              ))
            )}
          </span>
          {rightDelim ? (
            <span
              className={`katex-matrix-delim is-right is-${node.env}`}
              aria-hidden="true"
            >
              {rightDelim}
            </span>
          ) : null}
        </span>
      );
    }
  }
}

/** Renders LaTeX math into self-contained HTML without network or CDN access. */
export function renderMathHtml(latex: string, displayMode = false): string {
  const normalized = (latex ?? '').trim();
  const ast = parseLatex(normalized);
  const innerHtml = nodesToHtml(ast, displayMode);
  const escapedAttr = escapeHtml(normalized);

  if (displayMode) {
    return `<div class="katex-display" data-latex="${escapedAttr}" role="math" aria-label="${escapedAttr}">${innerHtml}</div>`;
  }
  return `<span class="katex-math" data-latex="${escapedAttr}" role="math" aria-label="${escapedAttr}">${innerHtml}</span>`;
}

/** Renders LaTeX math into offline React elements with accessible math semantics. */
export function renderMathReact(latex: string, displayMode = false): ReactNode {
  const normalized = (latex ?? '').trim();
  const ast = parseLatex(normalized);
  const content = nodesToReact(ast, displayMode, displayMode ? 'kd' : 'ki');

  if (displayMode) {
    return (
      <div
        className="katex-display"
        data-latex={normalized}
        role="math"
        aria-label={normalized}
      >
        {content}
      </div>
    );
  }

  return (
    <span
      className="katex-math"
      data-latex={normalized}
      role="math"
      aria-label={normalized}
    >
      {content}
    </span>
  );
}

type MixedSegment =
  | { type: 'text'; text: string }
  | { type: 'math'; latex: string; displayMode: boolean };

function isLikelyInlineMathContent(inner: string): boolean {
  if (!inner || inner.includes('\n')) return false;
  const trimmed = inner.trim();
  if (!trimmed) return false;
  const hasLeadingOrTrailingSpace = inner !== trimmed;
  if (!hasLeadingOrTrailingSpace) {
    return true;
  }
  // Avoid treating currency pairs like "$50 and $100" as math when padded with spaces
  return /[\\^_{}=+\-*/()[\]<>|]/.test(trimmed);
}

function splitMixedMathSegments(text: string): MixedSegment[] {
  const segments: MixedSegment[] = [];
  let i = 0;
  let plainStart = 0;

  const pushPlain = (end: number) => {
    if (end > plainStart) {
      segments.push({ type: 'text', text: text.slice(plainStart, end) });
    }
  };

  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const nextCh = text[i + 1];
      // Display math \[ ... \]
      if (nextCh === '[') {
        const closeIdx = text.indexOf('\\]', i + 2);
        if (closeIdx !== -1) {
          pushPlain(i);
          segments.push({
            type: 'math',
            latex: text.slice(i + 2, closeIdx),
            displayMode: true,
          });
          i = closeIdx + 2;
          plainStart = i;
          continue;
        }
      }
      // Inline math \( ... \)
      if (nextCh === '(') {
        const closeIdx = text.indexOf('\\)', i + 2);
        if (closeIdx !== -1 && !text.slice(i + 2, closeIdx).includes('\n')) {
          pushPlain(i);
          segments.push({
            type: 'math',
            latex: text.slice(i + 2, closeIdx),
            displayMode: false,
          });
          i = closeIdx + 2;
          plainStart = i;
          continue;
        }
      }
      // Escaped literal character (e.g. \$)
      i += 2;
      continue;
    }

    if (text[i] === '$') {
      // Display math $$ ... $$
      if (text[i + 1] === '$') {
        const closeIdx = text.indexOf('$$', i + 2);
        if (closeIdx !== -1) {
          pushPlain(i);
          segments.push({
            type: 'math',
            latex: text.slice(i + 2, closeIdx),
            displayMode: true,
          });
          i = closeIdx + 2;
          plainStart = i;
          continue;
        }
        i += 2;
        continue;
      }

      // Single-dollar inline math $ ... $
      let j = i + 1;
      let closeIdx = -1;
      while (j < text.length && text[j] !== '\n') {
        if (text[j] === '\\' && j + 1 < text.length) {
          j += 2;
          continue;
        }
        if (text[j] === '$') {
          if (text[j + 1] === '$') {
            break;
          }
          closeIdx = j;
          break;
        }
        j += 1;
      }

      if (closeIdx !== -1) {
        const inner = text.slice(i + 1, closeIdx);
        if (isLikelyInlineMathContent(inner)) {
          pushPlain(i);
          segments.push({
            type: 'math',
            latex: inner,
            displayMode: false,
          });
          i = closeIdx + 1;
          plainStart = i;
          continue;
        }
      }
    }

    i += 1;
  }

  pushPlain(text.length);
  return segments;
}

function renderPlainWithCitations(
  text: string,
  keyPrefix: string,
  onCitationClick?: (citationIndex: number) => void
): ReactNode {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, idx) => {
    const match = /^\[(\d+)\]$/.exec(part);
    if (!match) {
      return <Fragment key={`${keyPrefix}-t-${idx}`}>{part}</Fragment>;
    }
    const citationNumber = Number(match[1]);
    return (
      <SwissCitationBadge
        key={`${keyPrefix}-c-${idx}-${citationNumber}`}
        index={citationNumber}
        onClick={
          onCitationClick ? () => onCitationClick(citationNumber) : undefined
        }
      />
    );
  });
}

/**
 * Renders prose containing inline/display LaTeX formulas ($...$, $$...$$, \(...\), \[...\])
 * together with clickable [N] source citation badges.
 */
export function renderTextWithMathAndCitations(
  text: string,
  onCitationClick?: (citationIndex: number) => void
): ReactNode {
  if (!text) return null;
  const segments = splitMixedMathSegments(text);
  return segments.map((seg, idx) => {
    if (seg.type === 'math') {
      return (
        <Fragment key={`math-${idx}`}>
          {renderMathReact(seg.latex, seg.displayMode)}
        </Fragment>
      );
    }
    return (
      <Fragment key={`seg-${idx}`}>
        {renderPlainWithCitations(seg.text, `seg-${idx}`, onCitationClick)}
      </Fragment>
    );
  });
}
