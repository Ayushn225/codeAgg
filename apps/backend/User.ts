import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, type IncomingMessageType, type OutgoingMessageType } from "common/types";
import { SessionModel, WorkSpaceModel } from "db/client";
import mongoose from "mongoose";
import WebSocket from "ws";

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

            return {
                type: "message-added",
                payload: {
                    id: data.sessionId
                }
            }
        }

        throw new Error("Incorrect Schema");
    }
}