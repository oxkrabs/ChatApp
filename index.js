const express = require("express");
const app = express();

const USER_IDS_SOCKET_IDS = "userIds";
const SOCKET_IDS_USER_IDS = "idsUser";

const redis = require("redis");
const redisClient = redis.createClient({
  host: "127.0.0.1",
  port: "6379"
});

redisClient.on("connect", function() {
  console.log("REDIS CONNECTED");
  server = app.listen(3001, function() {
    console.log("server is running on port 3001");
  });

  let usersIds = {}; // Map between user -> socket id
  let idsUsers = {}; // Map between socket id -> user

  const io = require("socket.io")(server);

  /**
   * Set or create room data, returns those data
   * @param {string} roomName
   */
  function setOrCreateRoomData(roomName, cb) {
    console.log("Setting ", roomName);
    redisClient.hgetall("roomData", function(err, results) {
      if (err) {
        console.log("ERROR:", err);
      } else {
        if (results && typeof results[roomName] !== "undefined") {
          console.log(
            " - setOrCreateRoomData - Room found, returning the data"
          );
          if (cb) {
            cb(JSON.parse(results[roomName]));
          }
          return JSON.parse(results[roomName]);
        } else {
          console.log(
            " - setOrCreateRoomData - Room NOT found, creating ",
            roomName
          );
          redisClient.hset("roomData", roomName, JSON.stringify([]), () => {
            console.log("Room written in reddis");
            if (cb) {
              cb([]);
            }
            return [];
          });
        }
      }
    });
  }

  function addMessageToRoom(roomName, object) {
    console.log("Adding ", object);
    console.log("To ", roomName);
    setOrCreateRoomData(roomName, () => {
      redisClient.hgetall("roomData", function(err, result) {
        if (err) {
        } else {
          if (result && typeof result[roomName] !== "undefined") {
            const existingMessages = JSON.parse(result[roomName]);
            redisClient.hset(
              "roomData",
              roomName,
              JSON.stringify([...existingMessages, object])
            );
          }
        }
      });
    });
  }

  /**
   * Creating a message object and returning it
   * @param {string} message
   * @param {string} socketId
   * @param {string} documentId
   */
  function createMessageObject(message, socketId, documentId = "") {
    const messageObject = {
      message,
      createdAt: new Date(),
      user: idsUsers[socketId],
      documentId
    };
    return messageObject;
  }

  /**
   * Find the rooms that the user is in, and then return them
   * @param {string} user
   */
  function findUserRooms(user, cb) {
    redisClient.hgetall("roomData", function(err, results) {
      if (err) {
        console.log("- findUserRooms - ERROR");
      } else {
        if (typeof results === "undefined" || results === null) {
          cb([]);
          return;
        }
        const x = Object.keys(results).reduce((v, n) => {
          let temp = [...v];
          if (n.includes(user)) {
            const objectToSend = {
              [n]: {
                messages: JSON.parse(results[n]),
                subject: "test subject",
                roomId: n
              }
            };
            temp = [...temp, objectToSend];
          }
          return temp;
        }, []);
        console.log("- findUserRooms -");
        console.log(x);
        cb(x);
      }
    });
  }

  io.on("connection", function(socket) {
    socket.on("connected", userId => {
      console.log(`connected - ${userId} - ${socket.id}`);
      redisClient.hset(USER_IDS_SOCKET_IDS, userId, socket.id);
      redisClient.hset(SOCKET_IDS_USER_IDS, socket.id, userId);
      usersIds[userId] = socket.id;
      idsUsers[socket.id] = userId;

      // need to check the history and see what rooms this guy belong to
      // and push him in again.
      findUserRooms(userId, rooms => {
        rooms.forEach(room => {
          io.sockets.connected[usersIds[userId]].join(room);
          console.log("Added ", userId, " into room ", room);
        });
        io.emit("USER_ROOMS", rooms);
      });

      io.emit("CONNECTED", usersIds);
    });

    // We need this to go off so we can update the ui
    socket.on("disconnect", function() {
      console.log("User ", idsUsers[socket.id], " disconnected!");
      // redisClient.hdel(USER_IDS_SOCKET_IDS, idsUsers[socket.id]);
      // redisClient.hdel(SOCKET_IDS_USER_IDS, socket.id);
      delete usersIds[idsUsers[socket.id]];
      delete idsUsers[socket.id];
      io.emit("CONNECTED", usersIds);
    });

    /*
    We create a room with the name of user1|user2, then we add both of them into it.
    Then messages can be saved with that prefix for history and we can initialize private
    chat in the UI with it.
  */
    socket.on("create_room", function(data) {
      console.log("create_room: ", data);
      const { user1, user2 } = data;
      const room = `${user1}|${user2}`;
      console.log("creating room ", room);
      // Check if user is online first
      if (usersIds[user2]) {
        io.sockets.connected[usersIds[user2]].join(room);
      } else {
        console.log(user2, " is not online");
      }
      if (usersIds[user1]) {
        io.sockets.connected[usersIds[user1]].join(room);
      } else {
        console.log(user1, " is not online");
      }
      // ----
      const clients = io.sockets.adapter.rooms[room].sockets;
      for (var client in clients) {
        console.log(client, "connected to room");
      }

      const roomData = setOrCreateRoomData(room);
      // We send to the users of the room a notification that the room is created for them
      io.in(room).emit("ROOM_INIT", room); // Combine both
      io.in(room).emit("ROOM_INIT_DATA", { data: roomData });
    });

    // Doesnt work.
    socket.on("send_message_to", function(data) {
      const { room, message, documentId } = data;
      const messageObject = createMessageObject(message, socket.id, documentId);
      addMessageToRoom(room, messageObject);
      io.in(room).emit("NEW_ROOM_MESSAGE", {
        messageObject,
        room
      });
    });

    // Useless
    socket.on("subscribe", function(room) {
      console.log(socket.id, " joining room", room);
      socket.join(room);
    });
  });
});
