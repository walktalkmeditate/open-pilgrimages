const FENCE_LINE = /^(`{3,}|~{3,})/;
const INDENTED_LINE = /^(?: {4,}|\t)/;
const LIST_ITEM_LINE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/;

export interface ChecklistLine {
  /** 1-based, counted in the file as written, so a message can send a reader to it. */
  number: number;
  text: string;
}

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
 *
 * Each kept line carries its number in the unfiltered file, because a reader
 * sent to a line has to find it where it actually is.
 */
function keptChecklistLines(checklist: string): ChecklistLine[] {
  const kept: ChecklistLine[] = [];
  let fenceMarker: string | null = null;
  let inList = false;

  checklist.split("\n").forEach((line, index) => {
    const number = index + 1;
    const trimmed = line.trimStart();

    if (fenceMarker !== null) {
      if (trimmed.startsWith(fenceMarker)) fenceMarker = null;
      return;
    }

    const fenceOpen = FENCE_LINE.exec(trimmed);
    if (fenceOpen) {
      fenceMarker = fenceOpen[1];
      return;
    }

    if (trimmed.startsWith(">")) return;
    if (trimmed === "") {
      kept.push({ number, text: line });
      return;
    }

    const isListItem = LIST_ITEM_LINE.test(line);
    if (INDENTED_LINE.test(line) && !(inList && isListItem)) return;

    inList = isListItem;
    kept.push({ number, text: line });
  });

  return kept;
}

export function topLevelChecklistLines(checklist: string): string {
  return keptChecklistLines(checklist)
    .map((line) => line.text)
    .join("\n");
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

/**
 * Where every line matching `label` sits in the file. One entry is the honest
 * count: a stage is one day of one section, and its line is the record of one
 * reviewer having read it. Two lines for it cannot be written by anyone
 * describing the tree truthfully — the second either repeats a judgement
 * already recorded or contradicts it, and a reader has no way to tell which
 * of the two the gate will consult. The shape it comes in is an entry
 * appended beside a line left over from an earlier pass, which is how a
 * drafter ends up shipping a tick against prose it wrote itself.
 */
export function checklistEntryLines(
  entries: ChecklistLine[],
  box: string,
  label: string,
): number[] {
  return entries
    .filter((entry) => checklistEntry(entry.text, box, label))
    .map((entry) => entry.number);
}

export interface ReviewChecklist {
  file: string;
  lines: string;
  /** Prefixes every entry in a pilgrimage-level file, and nothing in a section's own. */
  qualifier: string;
  /** The same filtered view as `lines`, kept line by line so a collision can be located. */
  entries: ChecklistLine[];
}

/** Pure constructor: filters `content` through {@link topLevelChecklistLines} and labels it with the file it came from, without touching disk. */
export function buildReviewChecklist(file: string, content: string, qualifier: string): ReviewChecklist {
  const entries = keptChecklistLines(content);
  return { file, lines: entries.map((entry) => entry.text).join("\n"), qualifier, entries };
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
