import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

// Lightweight, dependency-free Markdown renderer for chat messages.
// Supports: headings, paragraphs, bold/italic/strikethrough, inline code,
// fenced code blocks, (nested) ordered/unordered/task lists, blockquotes,
// GFM tables, links/autolinks and horizontal rules. Output is built from
// React elements (no dangerouslySetInnerHTML), so message text can't inject HTML.

type Align = "left" | "center" | "right";

type Block =
	| { kind: "heading"; level: number; text: string }
	| { kind: "code"; lang: string; text: string }
	| { kind: "hr" }
	| { kind: "quote"; children: Block[] }
	| { kind: "list"; ordered: boolean; start: number; items: Block[][] }
	| { kind: "table"; header: string[]; align: Align[]; rows: string[][] }
	| { kind: "para"; lines: string[] };

const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const leadingSpaces = (line: string) => line.match(/^\s*/)![0].length;
const isOrderedMarker = (marker: string) => /\d/.test(marker);

function isTableStart(lines: string[], i: number): boolean {
	const next = lines[i + 1];
	return (
		lines[i]!.includes("|") &&
		next !== undefined &&
		next.includes("|") &&
		next.includes("-") &&
		TABLE_SEP_RE.test(next)
	);
}

function isBlockStart(lines: string[], i: number): boolean {
	const line = lines[i]!;
	return (
		FENCE_RE.test(line) ||
		HEADING_RE.test(line) ||
		HR_RE.test(line) ||
		QUOTE_RE.test(line) ||
		LIST_RE.test(line) ||
		isTableStart(lines, i)
	);
}

function splitRow(line: string): string[] {
	let row = line.trim();
	if (row.startsWith("|")) row = row.slice(1);
	if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
	return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
	const first = LIST_RE.exec(lines[start]!)!;
	const baseIndent = first[1]!.length;
	const ordered = isOrderedMarker(first[2]!);
	const startNum = ordered ? parseInt(first[2]!, 10) : 1;

	const isSibling = (m: RegExpExecArray | null) =>
		m !== null &&
		m[1]!.length <= baseIndent + 1 &&
		isOrderedMarker(m[2]!) === ordered;

	const itemLines: string[][] = [];
	let current: string[] = [];
	let contentIndent = 0;
	let i = start;

	while (i < lines.length) {
		const line = lines[i]!;
		const m = LIST_RE.exec(line);

		if (isSibling(m)) {
			current = [m![3]!];
			itemLines.push(current);
			contentIndent = m![1]!.length + m![2]!.length + 1;
			i++;
			continue;
		}

		if (line.trim() === "") {
			// A blank line continues the list only if the next content belongs to it
			let j = i + 1;
			while (j < lines.length && lines[j]!.trim() === "") j++;
			if (j >= lines.length) break;
			const nextLine = lines[j]!;
			if (isSibling(LIST_RE.exec(nextLine)) || leadingSpaces(nextLine) >= contentIndent) {
				current.push("");
				i++;
				continue;
			}
			break;
		}

		const indent = leadingSpaces(line);
		if (indent >= contentIndent || indent > baseIndent) {
			// Indented content (including nested lists) belongs to the current item
			current.push(line.slice(Math.min(indent, contentIndent)));
			i++;
			continue;
		}

		// Lazy continuation of the item's paragraph
		if (!isBlockStart(lines, i)) {
			current.push(line.trim());
			i++;
			continue;
		}
		break;
	}

	return {
		block: { kind: "list", ordered, start: startNum, items: itemLines.map(parseBlocks) },
		next: i,
	};
}

function parseBlocks(lines: string[]): Block[] {
	const blocks: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!;
		if (line.trim() === "") {
			i++;
			continue;
		}

		const fence = FENCE_RE.exec(line);
		if (fence) {
			const indent = fence[1]!.length;
			const marker = fence[2]!;
			const close = new RegExp(`^\\s{0,3}\\${marker[0]}{${marker.length},}\\s*$`);
			const body: string[] = [];
			i++;
			while (i < lines.length && !close.test(lines[i]!)) {
				const l = lines[i]!;
				body.push(l.slice(Math.min(indent, leadingSpaces(l))));
				i++;
			}
			i++; // skip closing fence (or run past end if unclosed)
			blocks.push({ kind: "code", lang: fence[3] ?? "", text: body.join("\n") });
			continue;
		}

		const heading = HEADING_RE.exec(line);
		if (heading) {
			blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
			i++;
			continue;
		}

		if (HR_RE.test(line)) {
			blocks.push({ kind: "hr" });
			i++;
			continue;
		}

		if (QUOTE_RE.test(line)) {
			const inner: string[] = [];
			while (i < lines.length && lines[i]!.trim() !== "") {
				const q = QUOTE_RE.exec(lines[i]!);
				inner.push(q ? q[1]! : lines[i]!);
				i++;
			}
			blocks.push({ kind: "quote", children: parseBlocks(inner) });
			continue;
		}

		if (isTableStart(lines, i)) {
			const header = splitRow(line);
			const align: Align[] = splitRow(lines[i + 1]!).map((cell) =>
				cell.startsWith(":") && cell.endsWith(":")
					? "center"
					: cell.endsWith(":")
						? "right"
						: "left",
			);
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && lines[i]!.trim() !== "" && lines[i]!.includes("|")) {
				rows.push(splitRow(lines[i]!));
				i++;
			}
			blocks.push({ kind: "table", header, align, rows });
			continue;
		}

		if (LIST_RE.test(line)) {
			const { block, next } = parseList(lines, i);
			blocks.push(block);
			i = next;
			continue;
		}

		const para: string[] = [line.trim()];
		i++;
		while (i < lines.length && lines[i]!.trim() !== "" && !isBlockStart(lines, i)) {
			para.push(lines[i]!.trim());
			i++;
		}
		blocks.push({ kind: "para", lines: para });
	}

	return blocks;
}

// ---------- Inline ----------

const INLINE_RE = new RegExp(
	[
		/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.source, // 1,2: `code`
		/\*\*(?=\S)([\s\S]*?\S)\*\*/.source, // 3: **bold**
		/(?<!\w)__(?=\S)([\s\S]*?\S)__(?!\w)/.source, // 4: __bold__
		/~~(?=\S)([\s\S]*?\S)~~/.source, // 5: ~~strike~~
		/\*(?=[^\s*])([\s\S]*?[^\s*])\*/.source, // 6: *italic*
		/(?<!\w)_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/.source, // 7: _italic_
		/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/.source, // 8,9: [text](url)
		/(https?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]])/.source, // 10: bare URL
	].join("|"),
	"g",
);

function safeHref(url: string): string | undefined {
	return /^(https?:|mailto:|#)/i.test(url) ? url : undefined;
}

function Link({ href, children }: { href: string; children: ReactNode }) {
	const safe = safeHref(href);
	if (!safe) {
		// Relative/unsafe targets (e.g. a file path) render as styled text
		return <span className="text-blue-300">{children}</span>;
	}
	return (
		<a
			href={safe}
			target="_blank"
			rel="noopener noreferrer"
			className="text-blue-400 hover:underline"
		>
			{children}
		</a>
	);
}

function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
	const out: ReactNode[] = [];
	const re = new RegExp(INLINE_RE.source, "g");
	let last = 0;
	let m: RegExpExecArray | null;
	let n = 0;

	while ((m = re.exec(text)) !== null) {
		if (m.index > last) out.push(text.slice(last, m.index));
		const key = `${keyPrefix}-${n++}`;

		if (m[2] !== undefined) {
			out.push(
				<code
					key={key}
					className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-700/70 font-mono text-[0.85em] text-zinc-200"
				>
					{m[2].trim() || m[2]}
				</code>,
			);
		} else if (m[3] !== undefined || m[4] !== undefined) {
			out.push(
				<strong key={key} className="font-semibold text-zinc-50">
					{renderInline((m[3] ?? m[4])!, key)}
				</strong>,
			);
		} else if (m[5] !== undefined) {
			out.push(
				<del key={key} className="opacity-70">
					{renderInline(m[5], key)}
				</del>,
			);
		} else if (m[6] !== undefined || m[7] !== undefined) {
			out.push(<em key={key}>{renderInline((m[6] ?? m[7])!, key)}</em>);
		} else if (m[8] !== undefined) {
			out.push(
				<Link key={key} href={m[9]!}>
					{renderInline(m[8], key)}
				</Link>,
			);
		} else if (m[10] !== undefined) {
			out.push(
				<Link key={key} href={m[10]}>
					{m[10]}
				</Link>,
			);
		}
		last = re.lastIndex;
	}

	if (last < text.length) out.push(text.slice(last));
	return out;
}

function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
	return lines.flatMap((line, idx) => {
		const nodes = renderInline(line, `${keyPrefix}-${idx}`);
		return idx === 0 ? nodes : [<br key={`${keyPrefix}-br-${idx}`} />, ...nodes];
	});
}

// ---------- Blocks ----------

function CodeFence({ lang, text }: { lang: string; text: string }) {
	const [copied, setCopied] = useState(false);

	const copy = () => {
		navigator.clipboard?.writeText(text).then(
			() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			},
			() => {},
		);
	};

	return (
		<div className="rounded-md border border-zinc-700/70 bg-zinc-950 overflow-hidden">
			<div className="flex items-center justify-between px-3 py-1 border-b border-zinc-800 bg-zinc-900/70">
				<span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
					{lang || "code"}
				</span>
				<button
					type="button"
					onClick={copy}
					title="Copy code"
					className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
				>
					{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			<pre className="overflow-x-auto p-3 text-xs leading-relaxed font-mono text-zinc-200 whitespace-pre">
				<code>{text}</code>
			</pre>
		</div>
	);
}

const HEADING_CLASS: Record<number, string> = {
	1: "text-lg font-semibold",
	2: "text-base font-semibold",
	3: "text-sm font-semibold",
	4: "text-sm font-medium",
	5: "text-sm font-medium",
	6: "text-sm font-medium text-zinc-300",
};

const ALIGN_CLASS: Record<Align, string> = {
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

function renderListItem(item: Block[], key: string): ReactNode {
	// GFM task list: "[ ] todo" / "[x] done"
	const firstBlock = item[0];
	let checked: boolean | null = null;
	let blocks = item;
	if (firstBlock?.kind === "para") {
		const task = /^\[([ xX])\]\s+/.exec(firstBlock.lines[0]!);
		if (task) {
			checked = task[1] !== " ";
			blocks = [
				{
					...firstBlock,
					lines: [firstBlock.lines[0]!.slice(task[0].length), ...firstBlock.lines.slice(1)],
				},
				...item.slice(1),
			];
		}
	}

	return (
		<li key={key} className={checked !== null ? "list-none -ml-5 flex gap-2" : undefined}>
			{checked !== null && (
				<input
					type="checkbox"
					checked={checked}
					readOnly
					className="mt-1 accent-blue-500 shrink-0"
				/>
			)}
			<div className="space-y-1.5 min-w-0">{renderBlocks(blocks, key)}</div>
		</li>
	);
}

function renderBlocks(blocks: Block[], keyPrefix = "b"): ReactNode[] {
	return blocks.map((block, idx) => {
		const key = `${keyPrefix}-${idx}`;
		switch (block.kind) {
			case "heading": {
				const Tag = `h${block.level}` as "h1";
				return (
					<Tag key={key} className={`${HEADING_CLASS[block.level]} text-zinc-50 mt-1`}>
						{renderInline(block.text, key)}
					</Tag>
				);
			}
			case "code":
				return <CodeFence key={key} lang={block.lang} text={block.text} />;
			case "hr":
				return <hr key={key} className="border-zinc-700" />;
			case "quote":
				return (
					<blockquote
						key={key}
						className="border-l-2 border-zinc-600 pl-3 text-zinc-400 space-y-2"
					>
						{renderBlocks(block.children, key)}
					</blockquote>
				);
			case "list": {
				const items = block.items.map((item, i) => renderListItem(item, `${key}-${i}`));
				return block.ordered ? (
					<ol key={key} start={block.start} className="list-decimal pl-5 space-y-1 marker:text-zinc-500">
						{items}
					</ol>
				) : (
					<ul key={key} className="list-disc pl-5 space-y-1 marker:text-zinc-500">
						{items}
					</ul>
				);
			}
			case "table":
				return (
					<div key={key} className="overflow-x-auto">
						<table className="text-xs border-collapse">
							<thead>
								<tr>
									{block.header.map((cell, c) => (
										<th
											key={c}
											className={`border border-zinc-700 bg-zinc-900 px-2 py-1 font-semibold ${ALIGN_CLASS[block.align[c] ?? "left"]}`}
										>
											{renderInline(cell, `${key}-h${c}`)}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{block.rows.map((row, r) => (
									<tr key={r}>
										{block.header.map((_, c) => (
											<td
												key={c}
												className={`border border-zinc-700 px-2 py-1 align-top ${ALIGN_CLASS[block.align[c] ?? "left"]}`}
											>
												{renderInline(row[c] ?? "", `${key}-${r}-${c}`)}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				);
			case "para":
				return (
					<p key={key} className="leading-relaxed">
						{renderLines(block.lines, key)}
					</p>
				);
		}
	});
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
	const blocks = useMemo(() => parseBlocks(text.replace(/\r\n?/g, "\n").split("\n")), [text]);
	return <div className={`space-y-2.5 break-words min-w-0 ${className}`}>{renderBlocks(blocks)}</div>;
}

export default Markdown;
