import { Socket } from 'socket.io';
import Elearning from '../db/models/Elearning';
import { v4 as uuidV4} from 'uuid';

const rooms : Record<string, Record<string,IUser>> = {}
const chats: Record<string, IMessage[]>={}

interface IUser {
    peerId:string;
    userName:string;
    role:string;
    mute:boolean;
}

interface IRoomParams {
    roomId:string,
    peerId:string
}

interface IJoinRoomParams extends IRoomParams {
    userName:string;
    role:string;
    mute:boolean;
}

interface IMessage {
    content: string;
    author?: string;
    timestamp: number;
}

interface IMute {
    roomId:string;
    peerId: string;
    mute: boolean;
}

export const roomHandler = (socket: Socket) =>{
    const createRoom = () => {
        const roomId = uuidV4();
        rooms[roomId] = {};
        socket.emit("room-created", { roomId })
        console.log("user created the room")
    }
    const joinRoom = ({roomId, peerId, userName, role, mute }: IJoinRoomParams ) => {
        // if(!rooms[roomId]) rooms[roomId]={};
        // if(!chats[roomId]) chats[roomId]=[];
        socket.emit("get-messages", chats[roomId])
        console.log("user joined the room",roomId,peerId, userName, role)
        // rooms[roomId].push(peerId)
        if (!rooms[roomId]) {
            rooms[roomId] = {};
        }
        rooms[roomId][peerId]={ peerId , userName, role, mute };
        socket.join(roomId)
        socket.to(roomId).emit("user-joined", {peerId, userName, role,mute})
        socket.emit("get-users",{
            roomId,
            participants: rooms[roomId],
        })

        socket.on("disconnect",()=>{
            console.log("user left the room", peerId, userName)
            leaveRoom({roomId,peerId})
        })
    }

    const leaveRoom = ({roomId,peerId}:IRoomParams) => {
        // rooms[roomId] = rooms[roomId].filter((id)=>id !== peerId)
        delete rooms[roomId][peerId]
        socket.to(roomId).emit("user-disconnected",peerId)
    }

    const startSharing = ({peerId,roomId}:IRoomParams)=>{
        socket.to(roomId).emit("user-started-sharing",peerId);
    }

    const stopSharing = ({roomId}:IRoomParams) => {
        socket.to(roomId).emit("user-stopped-sharing");
    }

    const addMessage = (roomId:string, message:IMessage) =>{
        if(chats[roomId]){
            chats[roomId].push(message)
        }else{
            chats[roomId] = [message]
        }
        socket.to(roomId).emit("add-message",message)
    }

    const changeName = ({ peerId, userName, roomId }:{ peerId:string, userName: string, roomId:string }) => {
        if(rooms[roomId] && rooms[roomId][peerId])
        rooms[roomId][peerId].userName = userName
        socket.to(roomId).emit("name-changed",{peerId,userName})
    }

    // const reconnectRoom = ({roomId, peerId, userName }: IJoinRoomParams )=>{
    //     socket.join(roomId)
    //     socket.to(roomId).emit("user-reconnected", {peerId, userName})
    // }

    const getElearning = async () => {
        // const roomId = uuidV4();
        // rooms[roomId] = {};
        try {
            const allData = await Elearning.findAll({
                where: {
                    deleted_at : null
                },
                raw:true
            })
            socket.emit("data-fetched", { allData })
        } catch (error) {
            console.log(error)
            // can emit error here
        }

    }

    const closeClass = async ({ roomId, peerId }: IRoomParams) =>{
        Object.keys(rooms[roomId]).forEach((id) => {
            delete rooms[roomId][id];
        });

        // update to database close the class
        try {
            await Elearning.update({ status: 'close' }, { where: { meetingId: roomId, deleted_at: null } });
        } catch (error) {
            console.log(error)
            // can emit error here
        }

        socket.to(roomId).emit("user-disconnected", peerId);
        socket.to(roomId).emit("refresh-room");
        socket.emit('refresh-room')
    }

    const checkRoomId = async ({ roomId }: IRoomParams)=>{
        try {
            const findClass = await Elearning.findOne({ where: { meetingId:roomId,deleted_at : null },raw:true })
            if(findClass){
                socket.emit("room-checked",{classData:findClass,status:true})
            }else{
                socket.emit("room-checked",{classData:'not found',status:false})
            }
        } catch (error) {
            console.log(error)
            // can emit error here
        }
    }

    const muteSelected = async ({ roomId,peerId,mute }: IMute)=>{
        try {
            if(rooms[roomId] && rooms[roomId][peerId])
            rooms[roomId][peerId].mute = mute
            socket.emit("mute-changed",{peerId,mute})
        } catch (error) {
            console.log(error)
            // can emit error here
        }
    }

    const muteAllStudent = async ({ roomId,mute}: IMute)=>{
        try {
            if(rooms[roomId]){
                for (const peerId in rooms[roomId]) {
                        if(peerId){
                            rooms[roomId][peerId].mute = mute
                        }
                    }
                socket.emit("all-student-muted",{mute});
            }
        } catch (error) {
            console.log(error)
            // can emit error here
        }
    }

    const refreshStudent = async ({ selectedRoomId,selectedPeerId }: {selectedRoomId:string,selectedPeerId:string})=>{
        try {
            if(rooms[selectedRoomId]){
                for (const peerId in rooms[selectedRoomId]) {
                        if(peerId) socket.to(selectedRoomId).emit("refresh-student-stream",{selectedPeerId});
                    }
            }
        } catch (error) {
            console.log(error)
            // can emit error here
        }
    }

    socket.on("create-room", createRoom)
    socket.on("join-room", joinRoom)
    socket.on("start-sharing",startSharing)
    socket.on("stop-sharing",stopSharing)
    socket.on("send-message",addMessage)
    socket.on("change-name",changeName)
    socket.on("exit-room",leaveRoom)
    socket.on("close-class",closeClass)
    socket.on("check-room-id",checkRoomId)
    // socket.on("reconnect-room",reconnectRoom)
    socket.on("get-elearning",getElearning)
    socket.on("mute-selected",muteSelected)
    socket.on("mute-all-student",muteAllStudent)
    socket.on("refresh-student",refreshStudent)
}