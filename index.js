const express = require("express");
const app = express();

server = app.listen(3001, function() {
  console.log("server is running on port 3001");
});

let messages = []; 
let usersIds = {}; // Map between user -> socket id
let idsUsers = {}; // Map between socket id -> user

const io = require("socket.io")(server);

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
      //io.to(`${client}`).emit("ROOM_INIT", "room is created for you 2");
    }

    io.in(room).emit("ROOM_INIT", "room is created for you 2");
  });

  // Doesnt work.
  socket.on("send_message_to", function (data) {
    const {
      user1,
      user2,
      message
    } = data;
    const user1socketId = usersIds[user1];
    const user2socketId = usersIds[user2];
    console.log(`${user1socketId} -> ${user2socketId} -> ${message}`);
    //io.to()
  });

  // Useless
  socket.on("subscribe", function(room) {
    console.log(socket.id, " joining room", room);
    socket.join(room);
    //socket.broadcast.to(socket.id).emit("MESSAGE", messages);
  });
});
