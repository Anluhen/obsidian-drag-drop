import { ChangeSet, countColumn, type ChangeSpec, type Text } from "@codemirror/state";

/** Inclusive range of 1-based line numbers. */
export interface LineRange {
	start: number;
	end: number;
}

interface Fence extends LineRange {
	closed: boolean;
}

const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})(\s|$)/;
const LIST_ITEM = /^\s*([-+*]|\d+[.)])(\s|$)/;
const CALLOUT = /^\s*>\s*\[![^\]]+\]/;
const QUOTE = /^\s*>/;

/** Last line of the YAML frontmatter, or 0 when the note has none. */
export function frontmatterEnd(doc: Text): number {
	if (doc.lines < 2 || doc.line(1).text !== "---") return 0;
	for (let i = 2; i <= doc.lines; i++) {
		if (doc.line(i).text.trimEnd() === "---") return i;
	}
	return 0;
}

function findFences(doc: Text, firstLine: number): Fence[] {
	const fences: Fence[] = [];
	for (let i = firstLine; i <= doc.lines; i++) {
		const open = FENCE_OPEN.exec(doc.line(i).text);
		if (!open) continue;

		const marker = open[1];
		const closing = new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`);
		let end = i + 1;
		while (end <= doc.lines && !closing.test(doc.line(end).text)) end++;

		// An unclosed fence runs to the end of the document.
		const closed = end <= doc.lines;
		fences.push({ start: i, end: closed ? end : doc.lines, closed });
		i = end;
	}
	return fences;
}

function indentation(text: string, tabSize: number): number {
	const leading = /^\s*/.exec(text)?.[0].length ?? 0;
	return countColumn(text, tabSize, leading);
}

function isBlank(text: string): boolean {
	return text.trim() === "";
}

/**
 * The lines that move together when the handle of `lineNumber` is dragged:
 * a whole code block, callout, heading section or list item with its children.
 */
export function resolveBlock(doc: Text, lineNumber: number, tabSize: number): LineRange {
	const single = { start: lineNumber, end: lineNumber };
	const fences = findFences(doc, frontmatterEnd(doc) + 1);

	const fence = fences.find(f => lineNumber >= f.start && lineNumber <= f.end);
	if (fence) {
		const isDelimiter = lineNumber === fence.start || lineNumber === fence.end;
		return fence.closed && isDelimiter ? { start: fence.start, end: fence.end } : single;
	}

	const text = doc.line(lineNumber).text;

	if (CALLOUT.test(text)) {
		const baseIndent = indentation(text, tabSize);
		let end = lineNumber;
		while (end < doc.lines) {
			const next = doc.line(end + 1).text;
			if (!QUOTE.test(next) || indentation(next, tabSize) < baseIndent) break;
			end++;
		}
		return { start: lineNumber, end };
	}

	const heading = HEADING.exec(text);
	if (heading) {
		const level = heading[1].length;
		let end = lineNumber;
		while (end < doc.lines) {
			const next = end + 1;
			const insideFence = fences.some(f => next >= f.start && next <= f.end);
			const nextHeading = insideFence ? null : HEADING.exec(doc.line(next).text);
			if (nextHeading && nextHeading[1].length <= level) break;
			end = next;
		}
		return { start: lineNumber, end };
	}

	if (LIST_ITEM.test(text)) {
		const baseIndent = indentation(text, tabSize);
		let end = lineNumber;
		let next = lineNumber + 1;
		for (; next <= doc.lines; next++) {
			const candidate = doc.line(next).text;
			if (isBlank(candidate)) continue;
			if (indentation(candidate, tabSize) <= baseIndent) break;
			end = next;
		}
		// Keep the blank lines that separate items of a loose list, but leave
		// behind the ones that separate the list from what follows it.
		if (next <= doc.lines && next > end + 1 && LIST_ITEM.test(doc.line(next).text)) {
			end = next - 1;
		}
		return { start: lineNumber, end };
	}

	return single;
}

/** Dropping below an empty last line keeps the note's trailing newline in place. */
export function normalizeTarget(doc: Text, target: number): number {
	const endsWithNewline = doc.lines > 1 && doc.line(doc.lines).length === 0;
	return target > doc.lines && endsWithNewline ? doc.lines : target;
}

/** Whether dropping `range` before line `target` (doc.lines + 1 = at the end) changes anything. */
export function isValidDropTarget(doc: Text, range: LineRange, target: number): boolean {
	if (target >= range.start && target <= range.end + 1) return false;
	return target > frontmatterEnd(doc);
}

/**
 * Changes that move `range` so it starts before line `target`, plus the
 * position of the moved block's first line in the new document.
 */
export function moveLines(
	doc: Text,
	lineBreak: string,
	range: LineRange,
	target: number,
): { changes: ChangeSpec[]; anchor: number } {
	const first = doc.line(range.start);
	const last = doc.line(range.end);
	const block = doc.sliceString(first.from, last.to);

	const deletion = range.end < doc.lines
		? { from: first.from, to: doc.line(range.end + 1).from }
		: { from: doc.line(range.start - 1).to, to: last.to };

	const atEnd = target > doc.lines;
	const insertAt = atEnd ? doc.length : doc.line(target).from;
	const insertion = { from: insertAt, insert: atEnd ? lineBreak + block : block + lineBreak };

	const changes = [insertion, deletion];
	const mapped = ChangeSet.of(changes, doc.length).mapPos(insertAt, -1);
	return { changes, anchor: atEnd ? mapped + lineBreak.length : mapped };
}
