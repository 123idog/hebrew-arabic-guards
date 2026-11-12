export type Script = 'hebrew' | 'arabic' | 'latin' | 'cjk' | 'none';

export interface ScriptCounts {
  hebrew: number;
  arabic: number;
  latin: number;
  cjk: number;
  dominant: Script;
}

export type ReplyIssue =
  | 'empty'
  | 'mojibake'
  | 'template_residue'
  | 'wrong_script'
  | 'latin_dominant'
  | 'prompt_leak';

export interface CheckReplyOptions {
  /** Expected script of the reply. Default 'hebrew'. */
  language?: 'hebrew' | 'arabic';
  /** Internal phrases that must never reach a customer. Matched loosely. */
  blocklist?: string[];
  /** Max allowed Latin letters per expected-script letter. Default 1. */
  maxLatinRatio?: number;
}

export interface CheckReplyResult {
  ok: boolean;
  reasons: ReplyIssue[];
  script: ScriptCounts;
}

export interface NameOptions {
  /** Default 4. */
  maxWords?: number;
  /** Default 40. */
  maxLength?: number;
}

export function detectScript(text: string): ScriptCounts;
export function normalize(text: string): string;
export function containsWord(
  text: string,
  word: string,
  options?: { prefixes?: 'hebrew' | 'arabic' | false }
): boolean;
export function findPromptLeaks(reply: string, phrases?: string[]): string[];
export function hasPromptLeak(reply: string, phrases?: string[]): boolean;
export function checkReply(reply: string, options?: CheckReplyOptions): CheckReplyResult;
export function isSafeToSend(reply: string, options?: CheckReplyOptions): boolean;
export function cleanName(name: string | null | undefined, options?: NameOptions): string | null;
export function pickName(candidates: Array<string | null | undefined>, options?: NameOptions): string | null;
