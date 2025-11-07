import socketIOClient from 'socket.io-client';


// export const WS = process.env.REACT_APP_API as string;
export const ws = socketIOClient(process.env.NEXT_PUBLIC_MMLIVE_API);


// ws.on('connect', () => {
//     console.log('Connected to signaling server with ID:', ws.id);
//     alert("connect")
//   });