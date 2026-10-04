import z from "zod";

export const WorkSpaceCreated = z.object({
    id: z.string(),
    name: z.string(),
    path: z.string()
})

export type WorkSpaceCreatedType = z.infer<typeof WorkSpaceCreated>;

export const SessionCreated = z.object({
    id: z.string(),
    workSpaceId: z.string().optional(),
})

export type SessionCreatedType = z.infer<typeof SessionCreated>;

export const MessageAdded = z.object({
    id: z.string(),
})

export type MessageAddedType = z.infer<typeof MessageAdded>;

export type OutgoingMessageType = {
    type: "workspace-created",
    payload: WorkSpaceCreatedType
} | {
    type: "session-created",
    payload: SessionCreatedType
} | {
    type: "message-added",
    payload: MessageAddedType
} | {
    type: "init",
    workspaces: Workspace[]
};

export type Workspace = {
    id: string | null,
    name: string,
    path: string,
    sessions: Session[]
}

export type Message = {
    role: "user",
    payload: {
        message: string
    } 
} | {
    role: "assistant",
    payload: any
} 

export type Session = {
    id: string,
    messages: Message[]
}

