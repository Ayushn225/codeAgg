import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { UserManager } from "./UserManager";

const DB_URI = process.env.DB_URI || "mongodb://127.0.0.1:27017/codeAgg";

mongoose.connect(DB_URI)
.then(()=>{
    const server = new WebSocketServer({
        port: 3000
    });

    server.on('connection', (ws)=>{
        console.log("server conneced")
        UserManager.getInstance().addUser(ws)
        console.log("user added")
    });
})
.catch(e=>{
    console.log(e);
});