import z from "zod"

export const CreateWorkspaceSchema = z.object({
    path: z.string(),
})

export type CreateWorkspaceSchemaType = z.infer<typeof CreateWorkspaceSchema>;

export const CreateSessionSchema = z.object({
    workSpaceId: z.string(),
})

export type CreateSessionSchemaType = z.infer<typeof CreateSessionSchema>;

export const AddMessageSchema = z.object({
    sessionId: z.string(),
    message: z.string(),
})

export type AddMessageSchemaType = z.infer<typeof AddMessageSchema>;

export const DeleteWorkspaceSchema = z.object({
    workSpaceId: z.string(),
})

export type DeleteWorkspaceSchemaType = z.infer<typeof DeleteWorkspaceSchema>;

export const DeleteSessionSchema = z.object({
    sessionId: z.string(),
})

export type DeleteSessionSchemaType = z.infer<typeof DeleteSessionSchema>;

export type IncomingMessageType = {
    type: "create-workspace",
    payload: CreateWorkspaceSchemaType
} | {
    type: "create-session",
    payload: CreateSessionSchemaType
} | {
    type: "add-message",
    payload: AddMessageSchemaType
} | {
    type: "delete-workspace",
    payload: DeleteWorkspaceSchemaType
} | {
    type: "delete-session",
    payload: DeleteSessionSchemaType
};