import { WebSocket } from "ws";
import { User } from "./User";
import { v4 as uuid } from "uuid";
import { SessionModel, WorkSpaceModel } from "db/client";
import type { Message, Session, Workspace } from "common/types";

export class UserManager {
	private users: User[];
	private static instance: UserManager;
	private constructor() {
		this.users = [];
	}

	static getInstance(): UserManager {
		if (UserManager.instance) {
			return UserManager.instance;
		}

		UserManager.instance = new UserManager();

		return UserManager.instance;
	}

	async addUser(ws: WebSocket) {
		const id = uuid();
		const user = new User(id, ws);

		this.users.push(user);

		const workspaces = await WorkSpaceModel.find();
		const sessions = await SessionModel.find();

		const response: Workspace[] = [];

		workspaces.forEach((w) => {
            const finalSession: Session[] = [];

            sessions.forEach((s) => {
                if (s.workspace?.toString() === w._id.toString()) {
                    const messages: Message[] = ((s as any).conversation || []) as Message[];
                    finalSession.push({
                        id: s._id.toString(),
                        messages
                    })
                }
            })

            response.push({
				id: w._id.toString(),
				name: w.name?.toString() || "",
				path: w.path?.toString() || "",
				sessions: finalSession,
			});
			
		});

		ws.send(
			JSON.stringify({
				type: "init",
				workspaces: response,
			}),
		);

		ws.on("message", async (msg) => {
			try {
				const parsedMessage = JSON.parse(msg.toString());
				const responsePayload = await user.handleIncomingMessage(parsedMessage);
				user.sendMessage(responsePayload);
			} catch (e) {
				console.log(msg.toString());
                console.log(e);
			}
		});

		ws.on("close", () => {
			this.users = this.users.filter((x) => x.id != id);
		});
	}
}
