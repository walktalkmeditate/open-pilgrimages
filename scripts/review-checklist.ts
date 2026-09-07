const FENCE_LINE = /^(`{3,}|~{3,})/;
const INDENTED_LINE = /^(?: {4,}|\t)/;
const LIST_ITEM_LINE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/;

/**
 * Per spec section 6, the checklist quotes each stage's drafted text
 * verbatim, so a line shaped like "- [x] stage N" can appear inside that
 * quoted prose without anyone having reviewed anything. Every read below uses
 * this filtered view instead of the raw file, so a quote buried in a fence,
 * blockquote, or indented aside can never masquerade as a real entry.
 *
 * An indented line is dropped as code only where markdown would render it as
 * code. Four spaces under a list item is a nested entry, which is how a
 * checklist that groups its stages under their section is written — dropping
 * those hid real entries, and a hidden entry reads as no entry at all.
 */
export function topLevelChecklistLines(checklist: string): string {
  const kept: string[] = [];
  let fenceMarker: string | null = null;
  let inList = false;

  for (const line of checklist.split("\n")) {
    const trimmed = line.trimStart();

    if (fenceMarker !== null) {
      if (trimmed.startsWith(fenceMarker)) fenceMarker = null;
      continue;
    }

    const fenceOpen = FENCE_LINE.exec(trimmed);
    if (fenceOpen) {
      fenceMarker = fenceOpen[1];
      continue;
    }

    if (trimmed.startsWith(">")) continue;
    if (trimmed === "") {
      kept.push(line);
      continue;
    }

    const isListItem = LIST_ITEM_LINE.test(line);
    if (INDENTED_LINE.test(line) && !(inList && isListItem)) continue;

    inList = isListItem;
    kept.push(line);
  }

  return kept.join("\n");
}

/** Every bullet GitHub renders as a task list, including the ordered forms. */
const BULLET = String.raw`(?:[-*+]|\d+[.)])`;
export const ANY_BOX = " xX";
export const TICKED_BOX = "xX";

/**
 * One builder for every read, so "listed" and "ticked" cannot come to disagree
 * about what an entry for a stage looks like — and one that accepts what a
 * reviewer's editor and GitHub both accept, since a line that renders as a
 * ticked box and does not match here is a review the gate cannot see.
 */
export function checklistEntry(lines: string, box: string, label: string): boolean {
  return new RegExp(`^[ \\t]*${BULLET}[ \\t]+\\[[${box}]\\][ \\t]+${label}\\b`, "m").test(lines);
}

export interface ReviewChecklist {
  file: string;
  lines: string;
  /** Prefixes every entry in a pilgrimage-level file, and nothing in a section's own. */
  qualifier: string;
}

/** Pure constructor: filters `content` through {@link topLevelChecklistLines} and labels it with the file it came from, without touching disk. */
export function buildReviewChecklist(file: string, content: string, qualifier: string): ReviewChecklist {
  return { file, lines: topLevelChecklistLines(content), qualifier };
}

export function mentionsAnyStage(checklist: ReviewChecklist, indices: number[]): boolean {
  return indices.some((index) =>
    checklistEntry(checklist.lines, ANY_BOX, `${checklist.qualifier}stage ${index}`),
  );
}

export function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Spec section 6 names the checklist for the pilgrimage, or for the section
 * where a PR's content work is scoped to one — so both have to be looked for,
 * or the anti-strip half of the gate never fires for a whole-pilgrimage PR.
 * The file that reviews these stages is the one that names them: a section
 * file kept for notes must not shadow the pilgrimage file doing the reviewing.
 *
 * Which file it is decides the form of its lines. Four sections of one
 * pilgrimage each have a stage 0, so in a shared file every entry names its
 * section ("- [x] kumano-kodo-kohechi stage 0") and only that form counts:
 * a bare "stage 0" there would clear all four at once. This selection is the
 * part both `validate` (reading files off disk) and `check-drafted-diff`
 * (handed file contents already read at two refs) need identically, so it
 * takes already-built checklists rather than reading anything itself.
 */
export function selectReviewChecklist(
  section: ReviewChecklist | undefined,
  pilgrimage: ReviewChecklist | undefined,
  indices: number[],
): ReviewChecklist | undefined {
  if (section && mentionsAnyStage(section, indices)) return section;
  if (pilgrimage && mentionsAnyStage(pilgrimage, indices)) return pilgrimage;
  return section ?? pilgrimage;
}
