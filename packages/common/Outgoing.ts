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

export const AssistantMessageAdded = z.any();

export type AssistantMessageAddedType = z.infer<typeof AssistantMessageAdded>;

export const WorkspaceDeleted = z.object({
    id: z.string(),
})

export type WorkspaceDeletedType = z.infer<typeof WorkspaceDeleted>;

export const SessionDeleted = z.object({
    id: z.string(),
    workSpaceId: z.string().optional(),
})

export type SessionDeletedType = z.infer<typeof SessionDeleted>;

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
    type: "workspace-deleted",
    payload: WorkspaceDeletedType
} | {
    type: "session-deleted",
    payload: SessionDeletedType
} | {
    type: "init",
    workspaces: Workspace[]
}| {
    type: "assistant-message",
    payload: AssistantMessageAddedType, 
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

