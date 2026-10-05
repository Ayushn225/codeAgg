import { useContext, useEffect, useRef, useState } from "react";
import { AppContext } from "./context/AppContext";
import { useSocket } from "./hooks/useSocket";
import { Markdown } from "./components/Markdown";
import "./index.css";
import type {
	Workspace,
	Session,
	Message,
	ToolCallPayload,
	ToolResultPayload,
} from "common/types";
import {
	AlertCircle,
	ChevronDown,
	ChevronRight,
	FileText,
	Folder,
	Loader2,
	MessageSquare,
	Pencil,
	Plus,
	Search,
	Send,
	Terminal,
	Trash2,
	Wrench,
} from "lucide-react";

function toolIcon(name: string) {
	switch (name) {
		case "Read":
			return FileText;
		case "Edit":
		case "MultiEdit":
		case "Write":
		case "NotebookEdit":
			return Pencil;
		case "Glob":
		case "Grep":
			return Search;
		case "Bash":
			return Terminal;
		default:
			return Wrench;
	}
}

function CodeBlock({
	label,
	text,
	tone = "neutral",
}: {
	label?: string;
	text: string;
	tone?: "neutral" | "removed" | "added" | "error";
}) {
	const toneClass = {
		neutral: "bg-zinc-950 text-zinc-300 border-zinc-800",
		removed: "bg-red-950/30 text-red-200 border-red-900/50",
		added: "bg-green-950/30 text-green-200 border-green-900/50",
		error: "bg-red-950/30 text-red-300 border-red-900/50",
	}[tone];

	return (
		<div className="space-y-1">
			{label && (
				<div className="text-[10px] uppercase tracking-wider text-zinc-500">
					{label}
				</div>
			)}
			<pre
				className={`max-h-96 overflow-auto rounded border p-2 text-[11px] leading-relaxed font-mono whitespace-pre ${toneClass}`}
			>
				{text || "(empty)"}
			</pre>
		</div>
	);
}

function ToolCallAccordion({ tool }: { tool: ToolCallPayload }) {
	const [open, setOpen] = useState(false);
	const Icon = toolIcon(tool.name);
	const isRunning = tool.output === undefined;
	const input = tool.input ?? {};
	const str = (key: string) =>
		typeof input[key] === "string" ? (input[key] as string) : undefined;

	let details: React.ReactNode;
	if (tool.isError) {
		details = <CodeBlock label="Error" text={tool.output ?? ""} tone="error" />;
	} else if (tool.name === "Edit" && str("old_string") !== undefined) {
		details = (
			<>
				<CodeBlock label="Removed" text={str("old_string")!} tone="removed" />
				<CodeBlock label="Added" text={str("new_string") ?? ""} tone="added" />
			</>
		);
	} else if (tool.name === "Write" && str("content") !== undefined) {
		details = <CodeBlock label="Written content" text={str("content")!} />;
	} else {
		details = (
			<>
				{tool.name !== "Read" && (
					<CodeBlock label="Input" text={JSON.stringify(input, null, 2)} />
				)}
				{!isRunning && (
					<CodeBlock
						label={tool.name === "Read" ? "File content" : "Output"}
						text={tool.output ?? ""}
					/>
				)}
			</>
		);
	}

	return (
		<div className="flex justify-start">
			<div className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-800/50 transition-colors cursor-pointer"
				>
					{open ? (
						<ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
					) : (
						<ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
					)}
					<Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
					<span className="font-medium text-zinc-200 shrink-0">{tool.name}</span>
					<span
						className="font-mono text-zinc-400 truncate"
						title={tool.summary}
					>
						{tool.summary}
					</span>
					<span className="ml-auto shrink-0">
						{isRunning ? (
							<Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
						) : tool.isError ? (
							<AlertCircle className="w-3.5 h-3.5 text-red-400" />
						) : null}
					</span>
				</button>
				{open && (
					<div className="border-t border-zinc-800 p-3 space-y-2">
						{details}
						{isRunning && (
							<div className="text-[11px] text-zinc-500">Running…</div>
						)}
						{tool.truncated && (
							<div className="text-[11px] text-zinc-500">
								Content truncated to keep messages small.
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

const ACTIVE_SESSION_KEY = "activeSessionId";
const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";

function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStored(key: string, value: string | null) {
	try {
		if (value) localStorage.setItem(key, value);
		else localStorage.removeItem(key);
	} catch {
		// Storage unavailable (e.g. private mode) — selection just won't persist
	}
}

function Sidebar({
	expandedWorkspaces,
	toggleWorkspace,
	onCreateSession,
	onDeleteWorkspace,
	onDeleteSession,
}: {
	expandedWorkspaces: Record<string, boolean>;
	toggleWorkspace: (workspaceId: string) => void;
	onCreateSession: (workspaceId: string) => void;
	onDeleteWorkspace: (workspaceId: string) => void;
	onDeleteSession: (sessionId: string, workspaceId: string) => void;
}) {
	const {
		socket,
		workspaces,
		setWorkspaces,
		activeSessionId,
		setActiveSessionId,
		setActiveWorkspaceId,
	} = useContext(AppContext);
	const [path, setPath] = useState("");

	const handleWorkspaceSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!path.trim()) return;

		const currPath = path.trim();
		const name = currPath.split("/").filter(Boolean).pop() || currPath;

		setWorkspaces((w: Workspace[]) => [
			...w,
			{
				path: currPath,
				name,
				id: null,
				sessions: [],
			} as Workspace,
		]);

		socket?.send(
			JSON.stringify({
				type: "create-workspace",
				payload: {
					path: currPath,
				},
			}),
		);
		setPath("");
	};

	return (
		<aside className="w-80 h-full border-r border-zinc-800 bg-zinc-900/60 flex flex-col select-none">
			{/* App Header */}
			<div className="p-4 border-b border-zinc-800 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
						<Terminal className="w-4 h-4" />
					</div>
					<h1 className="font-semibold text-sm tracking-wide text-zinc-100">
						Code Aggregator
					</h1>
				</div>
			</div>

			{/* Create Workspace Form */}
			<div className="p-3 border-b border-zinc-800 bg-zinc-950/40">
				<form onSubmit={handleWorkspaceSubmit} className="space-y-2">
					<div className="text-xs font-medium text-zinc-400">Add Workspace</div>
					<div className="flex gap-1.5">
						<input
							type="text"
							placeholder="/path/to/project"
							value={path}
							onChange={(e) => setPath(e.target.value)}
							className="flex-1 bg-zinc-900 border border-zinc-700/70 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
						/>
						<button
							type="submit"
							className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
						>
							Add
						</button>
					</div>
				</form>
			</div>

			{/* Workspaces Accordion List */}
			<div className="flex-1 overflow-y-auto p-2 space-y-1">
				<div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
					Workspaces ({workspaces.length})
				</div>

				{workspaces.length === 0 ? (
					<div className="text-xs text-zinc-400 text-center py-8 px-4">
						No workspaces yet. Add a workspace directory above to begin.
					</div>
				) : (
					workspaces.map((workspace, index) => {
						const wsKey = workspace.id || `temp-${index}`;
						const isExpanded = expandedWorkspaces[wsKey] ?? true;
						const sessions = workspace.sessions || [];

						return (
							<div
								key={wsKey}
								className="rounded-md border border-zinc-800/80 bg-zinc-900/30 overflow-hidden"
							>
								{/* Accordion Header */}
								<div
									onClick={() => toggleWorkspace(wsKey)}
									className="group flex items-center justify-between p-2 hover:bg-zinc-800/50 cursor-pointer transition-colors"
								>
									<div className="flex items-center gap-2 min-w-0 flex-1">
										<button
											type="button"
											className="text-zinc-400 hover:text-zinc-200 p-0.5"
										>
											{isExpanded ? (
												<ChevronDown className="w-3.5 h-3.5" />
											) : (
												<ChevronRight className="w-3.5 h-3.5" />
											)}
										</button>
										<Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
										<div className="truncate">
											<div className="text-xs font-medium text-zinc-200 truncate">
												{workspace.name || workspace.path}
											</div>
											<div className="text-[10px] text-zinc-400 truncate">
												{workspace.path}
											</div>
										</div>
									</div>

									{/* Action Buttons */}
									<div className="flex items-center gap-1 shrink-0">
										<button
											type="button"
											title="New Session"
											disabled={!workspace.id}
											onClick={(e) => {
												e.stopPropagation();
												if (workspace.id) {
													onCreateSession(workspace.id);
												}
											}}
											className="ml-2 flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
										>
											<Plus className="w-3 h-3" />
											<span>Session</span>
										</button>
										<button
											type="button"
											title="Delete Workspace"
											disabled={!workspace.id}
											onClick={(e) => {
												e.stopPropagation();
												if (workspace.id) {
													onDeleteWorkspace(workspace.id);
												}
											}}
											className="flex items-center justify-center p-1.5 rounded bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
										>
											<Trash2 className="w-3 h-3" />
										</button>
									</div>
								</div>

								{/* Accordion Content: Sessions List */}
								{isExpanded && (
									<div className="border-t border-zinc-800/60 bg-zinc-950/40 p-1 pl-4 space-y-0.5">
										{sessions.length === 0 ? (
											<div className="text-[11px] text-zinc-400 py-2 px-2 flex items-center justify-between">
												<span>No sessions</span>
												{workspace.id && (
													<button
														type="button"
														onClick={() => onCreateSession(workspace.id!)}
														className="text-blue-400 hover:underline text-[11px]"
													>
														+ Create
													</button>
												)}
											</div>
										) : (
											sessions.map((session, sIdx) => {
												const isActive = activeSessionId === session.id;
												const sessionDisplay = `Session ${sIdx + 1} (${session.id ? session.id.slice(-4) : "new"})`;
												const msgCount = session.messages?.length || 0;

												return (
													<div
														key={session.id || sIdx}
														className={`group w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs transition-colors cursor-pointer ${
															isActive
																? "bg-blue-600/20 text-blue-300 border border-blue-500/30"
																: "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
														}`}
														onClick={() => {
															setActiveSessionId(session.id);
															setActiveWorkspaceId(workspace.id);
														}}
													>
														<div className="flex items-center gap-2 truncate">
															<MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
															<span className="truncate">{sessionDisplay}</span>
														</div>
														<div className="flex items-center gap-1.5 shrink-0">
															<span className="text-[10px] text-zinc-400">
																{msgCount} {msgCount === 1 ? "msg" : "msgs"}
															</span>
															{workspace.id && (
																<button
																	type="button"
																	title="Delete Session"
																	onClick={(e) => {
																		e.stopPropagation();
																		onDeleteSession(session.id, workspace.id!);
																	}}
																	className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-900/60 hover:text-red-300 transition-colors"
																>
																	<Trash2 className="w-3 h-3" />
																</button>
															)}
														</div>
													</div>
												);
											})
										)}
									</div>
								)}
							</div>
						);
					})
				)}
			</div>
		</aside>
	);
}

function ChatWindow() {
	const { socket, workspaces, setWorkspaces, activeSessionId } =
		useContext(AppContext);
	const [inputMessage, setInputMessage] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Grow the textarea with its content, up to a max height
	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	}, [inputMessage]);

	// Find the active workspace and session
	let activeWorkspace: Workspace | null = null;
	let activeSession: Session | null = null;

	for (const ws of workspaces) {
		const found = ws.sessions?.find((s) => s.id === activeSessionId);
		if (found) {
			activeWorkspace = ws;
			activeSession = found;
			break;
		}
	}

	const messages = activeSession?.messages || [];

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length]);

	const handleSendMessage = (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		if (!inputMessage.trim() || !activeSessionId) return;

		const text = inputMessage.trim();

		// Optimistically append user message to the active session in local state
		setWorkspaces((prevWorkspaces) =>
			prevWorkspaces.map((w) => {
				if (!w.sessions) return w;
				return {
					...w,
					sessions: w.sessions.map((s) => {
						if (s.id === activeSessionId) {
							return {
								...s,
								messages: [
									...(s.messages || []),
									{
										role: "user",
										payload: { message: text },
									},
								],
							};
						}
						return s;
					}),
				};
			}),
		);

		// Send WebSocket message to store in DB
		socket?.send(
			JSON.stringify({
				type: "add-message",
				payload: {
					sessionId: activeSessionId,
					message: text,
				},
			}),
		);

		setInputMessage("");
	};

	if (!activeSessionId || !activeSession) {
		return (
			<div className="flex-1 h-full flex flex-col items-center justify-center bg-zinc-950 p-6 text-center">
				<div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-3">
					<MessageSquare className="w-6 h-6" />
				</div>
				<h2 className="text-base font-medium text-zinc-300 mb-1">
					No active session selected
				</h2>
				<p className="text-xs text-zinc-400 max-w-sm">
					Select an existing session from the workspace accordion on the left, or
					click &quot;+ Session&quot; to start a new chat session.
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 h-full flex flex-col bg-zinc-950 overflow-hidden">
			{/* Chat Header */}
			<div className="px-6 py-3.5 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between">
				<div className="flex items-center gap-3 min-w-0">
					<div>
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium text-zinc-100 truncate">
								{activeWorkspace?.name || "Workspace"}
							</span>
							<span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-mono">
								Session: {activeSession.id}
							</span>
						</div>
						<div className="text-[11px] text-zinc-400 truncate">
							{activeWorkspace?.path}
						</div>
					</div>
				</div>
				<div className="text-xs text-zinc-400">
					{messages.length} {messages.length === 1 ? "message" : "messages"}
				</div>
			</div>

			{/* Chat Messages */}
			<div className="flex-1 overflow-y-auto p-6 space-y-4">
				{messages.length === 0 ? (
					<div className="h-full flex flex-col items-center justify-center text-center">
						<div className="w-10 h-10 rounded-full bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-2">
							<MessageSquare className="w-5 h-5" />
						</div>
						<div className="text-sm font-medium text-zinc-400">
							Session started
						</div>
						<div className="text-xs text-zinc-400 mt-1">
							Send a message below to begin this session.
						</div>
					</div>
				) : (
					messages.map((msg, index) => {
						const isUser = msg.role === "user";
						if (!isUser && msg.payload?.type === "tool") {
							return <ToolCallAccordion key={index} tool={msg.payload} />;
						}
						const content =
							typeof msg.payload === "string"
								? msg.payload
								: msg.payload?.message || JSON.stringify(msg.payload);
						const isToolCall = !isUser && content.startsWith("Tool: ");

						if (isToolCall) {
							return (
								<div key={index} className="flex justify-center">
									<div className="px-3 py-1 rounded-full text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800">
										{content}
									</div>
								</div>
							);
						}

						return (
							<div
								key={index}
								className={`flex ${isUser ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`max-w-2xl min-w-0 px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
										isUser
											? "bg-blue-600 text-white rounded-br-sm shadow-md"
											: "bg-zinc-800 text-zinc-100 rounded-bl-sm border border-zinc-700"
									}`}
								>
									<div className="text-[10px] opacity-75 mb-1 font-medium">
										{isUser ? "You" : "Assistant"}
									</div>
									{isUser ? (
										<div className="whitespace-pre-wrap break-words">{content}</div>
									) : (
										<Markdown text={content} />
									)}
								</div>
							</div>
						);
					})
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Chat Input */}
			<div className="p-4 border-t border-zinc-800 bg-zinc-900/40">
				<form onSubmit={handleSendMessage} className="flex gap-2 items-end">
					<textarea
						ref={inputRef}
						rows={1}
						value={inputMessage}
						onChange={(e) => setInputMessage(e.target.value)}
						onKeyDown={(e) => {
							// Enter sends, Shift+Enter inserts a newline.
							// Ignore Enter while an IME composition is in progress.
							if (
								e.key === "Enter" &&
								!e.shiftKey &&
								!e.nativeEvent.isComposing
							) {
								e.preventDefault();
								handleSendMessage();
							}
						}}
						placeholder="Type a message… (Shift+Enter for a new line)"
						className="flex-1 resize-none overflow-y-auto bg-zinc-900 border border-zinc-700/80 rounded-lg px-4 py-2.5 text-sm leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-[border-color,box-shadow]"
					/>
					<button
						type="submit"
						disabled={!inputMessage.trim()}
						className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors cursor-pointer"
					>
						<Send className="w-4 h-4" />
						<span>Send</span>
					</button>
				</form>
			</div>
		</div>
	);
}

export function App() {
	const { socket, loading } = useSocket();
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
		readStored(ACTIVE_SESSION_KEY),
	);
	const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
		() => readStored(ACTIVE_WORKSPACE_KEY),
	);

	// Persist the selection so a page reload returns to the same session
	useEffect(() => {
		writeStored(ACTIVE_SESSION_KEY, activeSessionId);
	}, [activeSessionId]);

	useEffect(() => {
		writeStored(ACTIVE_WORKSPACE_KEY, activeWorkspaceId);
	}, [activeWorkspaceId]);
	const [expandedWorkspaces, setExpandedWorkspaces] = useState<
		Record<string, boolean>
	>({});
	const pendingSessionWorkspaceRef = useRef<string | null>(null);

	const toggleWorkspace = (workspaceId: string) => {
		setExpandedWorkspaces((prev) => ({
			...prev,
			[workspaceId]: !prev[workspaceId],
		}));
	};

	const handleCreateSession = (workspaceId: string) => {
		if (!socket) return;
		pendingSessionWorkspaceRef.current = workspaceId;

		// Ensure the workspace accordion is open
		setExpandedWorkspaces((prev) => ({
			...prev,
			[workspaceId]: true,
		}));

		socket.send(
			JSON.stringify({
				type: "create-session",
				payload: {
					workSpaceId: workspaceId,
				},
			}),
		);
	};

	const handleDeleteWorkspace = (workspaceId: string) => {
		if (!socket) return;

		socket.send(
			JSON.stringify({
				type: "delete-workspace",
				payload: {
					workSpaceId: workspaceId,
				},
			}),
		);
	};

	const handleDeleteSession = (sessionId: string, workspaceId: string) => {
		if (!socket) return;

		socket.send(
			JSON.stringify({
				type: "delete-session",
				payload: {
					sessionId,
				},
			}),
		);
	};

	useEffect(() => {
		if (!loading && socket) {
			socket.onmessage = (event) => {
				try {
					const parsedData = JSON.parse(event.data);
					console.log("WebSocket received:", parsedData);

					if (parsedData.type === "init") {
						const wsList: Workspace[] = parsedData.workspaces || [];
						setWorkspaces(wsList);

						// Auto-expand all workspaces on initial load
						const initialExpanded: Record<string, boolean> = {};
						wsList.forEach((w) => {
							if (w.id) initialExpanded[w.id] = true;
						});
						setExpandedWorkspaces(initialExpanded);

						// Restore the previously selected session if it still exists,
						// otherwise fall back to the first available session
						const storedSessionId = readStored(ACTIVE_SESSION_KEY);
						const restoredWorkspace = storedSessionId
							? wsList.find((w) =>
									w.sessions?.some((s) => s.id === storedSessionId),
								)
							: undefined;

						if (restoredWorkspace) {
							setActiveWorkspaceId(restoredWorkspace.id);
							setActiveSessionId(storedSessionId);
						} else {
							setActiveWorkspaceId(null);
							setActiveSessionId(null);
							for (const w of wsList) {
								const firstSession = w.sessions?.[0];
								if (firstSession) {
									setActiveWorkspaceId(w.id);
									setActiveSessionId(firstSession.id);
									break;
								}
							}
						}
					}

					if (parsedData.type === "workspace-created") {
						setWorkspaces((prev) =>
							prev.map((w) => {
								if (w.id == null) {
									return {
										...w,
										...parsedData.payload,
										sessions: [],
									};
								}
								return w;
							}),
						);

						if (parsedData.payload?.id) {
							setExpandedWorkspaces((prev) => ({
								...prev,
								[parsedData.payload.id]: true,
							}));
						}
					}

					if (parsedData.type === "session-created") {
						const newSessionId: string = parsedData.payload?.id;
						const targetWorkspaceId: string | undefined =
							parsedData.payload?.workSpaceId ||
							pendingSessionWorkspaceRef.current ||
							undefined;

						if (newSessionId) {
							const newSession: Session = {
								id: newSessionId,
								messages: [],
							};

							setWorkspaces((prev) =>
								prev.map((w) => {
									if (
										targetWorkspaceId ? w.id === targetWorkspaceId : true
									) {
										const existing = w.sessions || [];
										// Avoid duplicate session
										if (existing.some((s) => s.id === newSessionId)) return w;
										return {
											...w,
											sessions: [...existing, newSession],
										};
									}
									return w;
								}),
							);

							setActiveSessionId(newSessionId);
							if (targetWorkspaceId) {
								setActiveWorkspaceId(targetWorkspaceId);
								setExpandedWorkspaces((prev) => ({
									...prev,
									[targetWorkspaceId]: true,
								}));
							}
						}
					}

					if (parsedData.type === "message-added") {
						// Message has been acknowledged and saved to DB
						console.log("Message persisted:", parsedData.payload);
					}

					if (parsedData.type === "workspace-deleted") {
						const deletedWorkspaceId: string = parsedData.payload?.id;

						setWorkspaces((prev) =>
							prev.filter((w) => w.id !== deletedWorkspaceId),
						);

						if (activeWorkspaceId === deletedWorkspaceId) {
							setActiveWorkspaceId(null);
							setActiveSessionId(null);
						}
					}

					if (parsedData.type === "session-deleted") {
						const deletedSessionId: string = parsedData.payload?.id;

						setWorkspaces((prev) =>
							prev.map((w) => ({
								...w,
								sessions: (w.sessions || []).filter(
									(s) => s.id !== deletedSessionId,
								),
							})),
						);

						if (activeSessionId === deletedSessionId) {
							setActiveSessionId(null);
						}
					}

					if (parsedData.type == "assistant-message"){
						const { sessionId, ...payload } = parsedData.payload;
						setWorkspaces((prev: Workspace[])=> prev.map(w =>({
							...w,
							sessions: (w.sessions ?? []).map(s => {
								if (s.id !== sessionId) return s;
								const messages = s.messages ?? [];

								// Tool output: merge into the matching tool call
								if (payload.type === "tool-result") {
									const result = payload as ToolResultPayload;
									return {
										...s,
										messages: messages.map((m) =>
											m.role === "assistant" &&
											m.payload?.type === "tool" &&
											m.payload.toolUseId === result.toolUseId
												? {
														...m,
														payload: {
															...m.payload,
															output: result.output,
															isError: result.isError,
															truncated:
																m.payload.truncated || result.truncated,
														},
													}
												: m,
										),
									};
								}

								return {
									...s,
									messages: [...messages, { role: "assistant", payload }],
								};
							})
						})));
					}
				} catch (err) {
					console.error("Error handling WebSocket message:", err);
				}
			};
		}
	}, [loading, socket, activeSessionId, activeWorkspaceId]);

	if (loading) {
		return (
			<div className="dark h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
				<div className="flex items-center gap-3">
					<div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
					<span className="text-sm">Connecting to server...</span>
				</div>
			</div>
		);
	}

	return (
		<AppContext.Provider
			value={{
				workspaces,
				socket,
				setWorkspaces,
				activeSessionId,
				setActiveSessionId,
				activeWorkspaceId,
				setActiveWorkspaceId,
			}}
		>
			<div className="dark h-screen w-screen flex bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
				<Sidebar
					expandedWorkspaces={expandedWorkspaces}
					toggleWorkspace={toggleWorkspace}
					onCreateSession={handleCreateSession}
					onDeleteWorkspace={handleDeleteWorkspace}
					onDeleteSession={handleDeleteSession}
				/>
				<ChatWindow />
			</div>
		</AppContext.Provider>
	);
}

export default App;
