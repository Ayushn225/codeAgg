import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, DeleteSessionSchema, DeleteWorkspaceSchema, type IncomingMessageType, type OutgoingMessageType } from "common/types";
import { Session, SessionModel, WorkSpaceModel } from "db/client";
import mongoose from "mongoose";
import WebSocket from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, statSync } from "fs";
import { isAbsolute } from "path";

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
                        } else if ("name" in block) {
                            console.log(`Tool: ${block.name}`); // Tool being called
                        }
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