import { createContext } from "react";
import type { Workspace } from 'common/types';

export const AppContext = createContext<{
    workspaces: Workspace[],
    socket: WebSocket | null,
    setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>,
    activeSessionId: string | null,
    setActiveSessionId: (id: string | null) => void,
    activeWorkspaceId: string | null,
    setActiveWorkspaceId: (id: string | null) => void,
}>({
    workspaces: [],
    socket: null,
    setWorkspaces: () => {},
    activeSessionId: null,
    setActiveSessionId: () => {},
    activeWorkspaceId: null,
    setActiveWorkspaceId: () => {},
})