const express = require("express");
const app = express();

server = app.listen(3001, function() {
  console.log("server is running on port 3001");
});

let messages = []; 
let usersIds = {}; // Map between user -> socket id
let idsUsers = {}; // Map between socket id -> user

let roomsData = {};

const io = require("socket.io")(server);

/**
 * Set or create room data, returns those data
 * @param {string} roomName 
 */
function setOrCreateRoomData(roomName) {
  if (typeof roomsData[roomName] === 'undefined') {
    roomsData[roomName] = [];
  }
  return roomsData[roomName];
}

function addMessageToRoom(roomName, object) {
  console.log("Adding ", object);
  console.log("To ", roomName);
  setOrCreateRoomData(roomName);
  roomsData[roomName].push(object);
  console.log("Room data");
  console.log(roomsData[roomName]);
}

/**
 * Creating a message object and returning it
 * @param {string} roomName 
 * @param {string} message 
 * @param {string} socketId 
 */
function createMessageObject(roomName, message, socketId) {
  const messageObject = {
    message,
    createdAt: new Date(),
    user: idsUsers[socketId]
  }
  return messageObject;
}


io.on("connection", function(socket) {
  socket.on("connected", (userId) => {
    console.log(`connected - ${userId} - ${socket.id}`);
    usersIds[userId] = socket.id;
    idsUsers[socket.id] = userId;
    io.emit("CONNECTED", usersIds);
  });

  // We need this to go off so we can update the ui
  socket.on("disconnect", function () {
    console.log("User ", idsUsers[socket.id], " disconnected!");
    delete usersIds[idsUsers[socket.id]];
    delete idsUsers[socket.id];
    io.emit("CONNECTED", usersIds);
   });

  socket.on("SEND_MESSAGE", function(data) {
    messages = [...messages, data];
    io.emit("MESSAGE", data);
  });

  /*
    We create a room with the name of user1|user2, then we add both of them into it.
    Then messages can be saved with that prefix for history and we can initialize private 
    chat in the UI with it.
  */
  socket.on("create_room", function (data) {
    console.log("create_room: ", data);
    const {
      user1,
      user2
    } = data;
    const room = `${user1}|${user2}`;
    console.log("creating room ", room);
    io.sockets.connected[usersIds[user2]].join(room);
    io.sockets.connected[usersIds[user1]].join(room);
    const clients = io.sockets.adapter.rooms[room].sockets;
    for (var client in clients) {
      console.log(client, 'connected to room');
    }
    
    const roomData = setOrCreateRoomData(room);
    // We send to the users of the room a notification that the room is created for them
    io.in(room).emit("ROOM_INIT", room);
    io.in(room).emit("ROOM_INIT_DATA", { data: roomData });
  });

  // Doesnt work.
  socket.on("send_message_to", function (data) {
    const {
      room,
      message
    } = data;
    const messageObject = createMessageObject(room, message, socket.id);
    addMessageToRoom(room, messageObject);
    io.in(room).emit("NEW_ROOM_MESSAGE", messageObject);
  });

  // Useless
  socket.on("subscribe", function(room) {
    console.log(socket.id, " joining room", room);
    socket.join(room);
    //socket.broadcast.to(socket.id).emit("MESSAGE", messages);
  });
});
