import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, DeleteSessionSchema, DeleteWorkspaceSchema, type IncomingMessageType, type OutgoingMessageType, type ToolCallPayload, type ToolResultPayload } from "common/types";
import { Session, SessionModel, WorkSpaceModel } from "db/client";
import mongoose from "mongoose";
import WebSocket from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, statSync } from "fs";
import { isAbsolute, relative } from "path";

// Cap tool output so large file reads don't bloat websocket messages / Mongo docs
const MAX_TOOL_OUTPUT_CHARS = 20_000;

function truncate(text: string): { text: string, truncated: boolean } {
    if (text.length <= MAX_TOOL_OUTPUT_CHARS) return { text, truncated: false };
    return { text: text.slice(0, MAX_TOOL_OUTPUT_CHARS), truncated: true };
}

// Tool result content is either a string or an array of content blocks
function toolResultToText(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : ""))
            .filter(Boolean)
            .join("\n");
    }
    return "";
}

// Cap long string fields (e.g. Write `content`, Edit `old_string`/`new_string`)
// so the stored/sent input stays bounded like tool output does
function truncateInput(input: Record<string, unknown>): { input: Record<string, unknown>, truncated: boolean } {
    let truncated = false;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === "string") {
            const t = truncate(value);
            truncated ||= t.truncated;
            out[key] = t.text;
        } else {
            out[key] = value;
        }
    }
    return { input: out, truncated };
}

function summarizeToolInput(name: string, input: Record<string, unknown>, cwd: string): string {
    const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
    const filePath = str("file_path") || str("notebook_path");
    if (filePath) {
        const rel = relative(cwd, filePath);
        const shown = rel && !rel.startsWith("..") ? rel : filePath;
        // Show partial reads as a line range, e.g. "src/App.tsx (lines 100–149)"
        const offset = typeof input.offset === "number" ? input.offset : undefined;
        const limit = typeof input.limit === "number" ? input.limit : undefined;
        if (name === "Read" && (offset !== undefined || limit !== undefined)) {
            const start = offset ?? 1;
            return limit !== undefined ? `${shown} (lines ${start}–${start + limit - 1})` : `${shown} (from line ${start})`;
        }
        return shown;
    }
    if (str("pattern")) return str("path") ? `${str("pattern")} in ${str("path")}` : str("pattern");
    if (str("command")) return str("command");
    if (str("url")) return str("url");
    if (str("query")) return str("query");
    if (str("description")) return str("description");
    return name;
}

export class User{
    private socket: WebSocket;
    public id: string;

    constructor(id: string, socket: WebSocket){
        this.socket = socket;
        this.id = id;
    }

    async sendMessage(payload: OutgoingMessageType){
        this.socket.send(JSON.stringify(payload));
    }

    async handleIncomingMessage(msg: IncomingMessageType): Promise<OutgoingMessageType>{
        if(msg.type === "create-workspace"){
            // console.log(msg);
            // console.log(msg.payload);
            const {success, data } = CreateWorkspaceSchema.safeParse(msg.payload);

            if(!success){
                throw new Error("Incorrect Schema")
            }
            
            const name: string = data.path.split("/").pop()!
            const path: string = data.path!
            if(!isAbsolute(path) || !existsSync(path) || !statSync(path).isDirectory()){
                throw new Error("workspace path must be an existing absolute directory: " + path);
            }
            const workspace = await WorkSpaceModel.create({
                path,
                name
            })

            return {
                type: "workspace-created",
                payload: {
                    id: workspace.id,
                    path: path,
                    name: name
                }
            }
        }

        if(msg.type === "create-session"){
            const {success, data } = CreateSessionSchema.safeParse(msg.payload);

            if(!success){
                throw new Error("Incorrect Schema")
            }

            const session = await SessionModel.create({
                workspace: new mongoose.Types.ObjectId(data.workSpaceId),
                conversation: []
            })

            return { 
                type: "session-created", 
                payload: { 
                    id: session._id.toString(),
                    workSpaceId: data.workSpaceId,
                } 
            }
        }

        if(msg.type === "add-message"){
            const {success, data } = AddMessageSchema.safeParse(msg.payload);

            if(!success){
                throw new Error("Incorrect Schema")
            }

            const session = await SessionModel.findById(new mongoose.Types.ObjectId(data.sessionId));
            const workspace = await WorkSpaceModel.findOne({
                _id: session?.workspace,
            });
            if(!workspace){
                throw new Error("workspace doesn't exist in session " + data.sessionId);
            }

            if(!session){
                throw new Error("session doesn't exist " + data.sessionId);
            }

            if(!workspace.path || !existsSync(workspace.path)){
                throw new Error("workspace directory not found on disk: " + workspace.path);
            }


            await SessionModel.updateOne({   
                _id: new mongoose.Types.ObjectId(data.sessionId)
            }, {
                $push: {
                    conversation: {
                        role: "user",
                        payload: {
                            message: data.message
                        }
                    }
                }
            })
            
            //agentic loop
            for await (const message of query({
                prompt: msg.payload.message,
                options: {
                    cwd: workspace.path!,
                    allowedTools: ["Read", "Edit", "Glob"], // Auto-approve these tools
                    resume: session.anthropicSessionId? session.anthropicSessionId: undefined,
                    permissionMode: "acceptEdits" // Auto-approve file edits
                }
            })) {
                // Print human-readable output
                if (message.type === "assistant" && message.message?.content) {
                    for (const block of message.message.content) {
                        if ("text" in block) {
                            console.log(block.text); // Claude's reasoning
                        } else if (block.type === "tool_use") {
                            const rawInput = (block.input ?? {}) as Record<string, unknown>;
                            const { input, truncated: inputTruncated } = truncateInput(rawInput);
                            const toolPayload: ToolCallPayload = {
                                type: "tool",
                                toolUseId: block.id,
                                name: block.name,
                                summary: summarizeToolInput(block.name, rawInput, workspace.path),
                                input,
                                ...(inputTruncated ? { truncated: true } : {}),
                            };
                            console.log(`Tool: ${block.name} ${toolPayload.summary}`);

                            this.sendMessage({
                                type: "assistant-message",
                                payload: { ...toolPayload, sessionId: data.sessionId },
                            });

                            await SessionModel.updateOne({
                                _id: new mongoose.Types.ObjectId(data.sessionId)
                            }, {
                                $push: {
                                    conversation: {
                                        role: "assistant",
                                        payload: toolPayload,
                                    }
                                }
                            });
                        }
                    }
                } else if (message.type === "user" && Array.isArray(message.message?.content)) {
                    // Tool results come back to the model as "user" messages
                    for (const block of message.message.content) {
                        if (typeof block !== "object" || block.type !== "tool_result") continue;

                        const { text, truncated } = truncate(toolResultToText(block.content));
                        const resultPayload: ToolResultPayload = {
                            type: "tool-result",
                            toolUseId: block.tool_use_id,
                            output: text,
                            isError: Boolean(block.is_error),
                            truncated,
                        };

                        this.sendMessage({
                            type: "assistant-message",
                            payload: { ...resultPayload, sessionId: data.sessionId },
                        });

                        // Attach the output to the stored tool call
                        await SessionModel.updateOne({
                            _id: new mongoose.Types.ObjectId(data.sessionId),
                            "conversation.payload.toolUseId": block.tool_use_id,
                        }, {
                            $set: {
                                "conversation.$.payload.output": resultPayload.output,
                                "conversation.$.payload.isError": resultPayload.isError,
                                // Only set when true so a truncated input flag isn't cleared
                                ...(resultPayload.truncated ? { "conversation.$.payload.truncated": true } : {}),
                            }
                        });
                    }
                } else if (message.type === "result") {
                    console.log(`Done: ${message.subtype}`); // Final result
                    if(!session.anthropicSessionId){
                        session.anthropicSessionId = message.session_id;
                        await session.save();
                    }
                    if(message.subtype === "success"){
                        console.log(message.result);
                        this.sendMessage({
                            type: "assistant-message",
                            payload: {
                                type: "result",
                                message: message.result,
                                sessionId: msg.payload.sessionId,
                            }
                        })

                        await SessionModel.updateOne({   
                            _id: new mongoose.Types.ObjectId(data.sessionId)
                        }, {
                            $push: {
                                conversation: {
                                    role: "assistant",
                                    payload: {
                                        type: "result",
                                        message: message.result
                                    }
                                }
                            }
                        })
                    }
                }
            }

            return {
                type: "message-added",
                payload: {
                    id: data.sessionId
                }
            }
        }

        if(msg.type === "delete-workspace"){
            const {success, data } = DeleteWorkspaceSchema.safeParse(msg.payload);

            if(!success){
                throw new Error("Incorrect Schema")
            }

            const workspaceId = new mongoose.Types.ObjectId(data.workSpaceId);

            await SessionModel.deleteMany({ workspace: workspaceId });
            await WorkSpaceModel.deleteOne({ _id: workspaceId });

            return {
                type: "workspace-deleted",
                payload: {
                    id: data.workSpaceId,
                }
            }
        }

        if(msg.type === "delete-session"){
            const {success, data } = DeleteSessionSchema.safeParse(msg.payload);

            if(!success){
                throw new Error("Incorrect Schema")
            }

            const session = await SessionModel.findOneAndDelete({
                _id: new mongoose.Types.ObjectId(data.sessionId)
            });

            return {
                type: "session-deleted",
                payload: {
                    id: data.sessionId,
                    workSpaceId: session?.workspace?.toString(),
                }
            }
        }

        throw new Error("Incorrect Schema");
    }
}