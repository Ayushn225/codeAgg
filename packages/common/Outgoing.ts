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

// Payload for an assistant tool call. Sent once when the tool starts
// (type "tool", no output yet) and again when the result arrives
// (type "tool-result"), matched by toolUseId.
export type ToolCallPayload = {
    type: "tool",
    toolUseId: string,
    name: string,
    // Short, human-readable description, e.g. the file path or glob pattern
    summary: string,
    input: Record<string, unknown>,
    output?: string,
    isError?: boolean,
    // True when output was cut off to keep messages small
    truncated?: boolean,
}

export type ToolResultPayload = {
    type: "tool-result",
    toolUseId: string,
    output: string,
    isError: boolean,
    truncated: boolean,
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

