import express from 'express';
import cors from 'cors';
import User from './models/User.js';
import Message from './models/Message.js';
import dotenv from 'dotenv';
import UserRouter from './routes/userRoutes.js';
import http from 'http';
import connect from './connection.js';
import { getLastMessagesFromRoom, sortRoomMessagesByDate } from './utils.js';
import { Server } from 'socket.io';

const app = express();

dotenv.config();

const rooms = ['general', 'tech', 'finance', 'crypto'];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  cors({
    origin: '*',
  })
);

app.use('/api/users', UserRouter);

// connect to the database
connect();

const server = http.createServer(app);

const port = process.env.PORT || 3000;

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// socket connection

io.on('connection', (socket) => {
  socket.on('new-user', async () => {
    const members = await User.find();
    io.emit('new-user', members);
  });

  socket.on('join-room', async (newRoom, previousRoom) => {
    socket.join(newRoom);
    socket.leave(previousRoom);
    let roomMessages = await getLastMessagesFromRoom(newRoom);
    roomMessages = sortRoomMessagesByDate(roomMessages);
    socket.emit('room-messages', roomMessages);
  });

  socket.on('message-room', async (room, content, sender, time, date) => {
    const newMessage = await Message.create({
      content,
      from: sender,
      time,
      date,
      to: room,
    });
    await newMessage.save();
    let roomMessages = await getLastMessagesFromRoom(room);
    roomMessages = sortRoomMessagesByDate(roomMessages);
    // sending message to room
    io.to(room).emit('room-messages', roomMessages);
    socket.broadcast.emit('notifications', room);
  });

  app.delete('/api/users/logout', async (req, res) => {
    try {
      const { _id, newMessages } = req.body;
      const user = await User.findById(_id);
      user.status = 'offline';
      user.newMessages = newMessages;
      await user.save();
      const members = await User.find();
      socket.broadcast.emit('new-user', members);
      res.status(200).send();
    } catch (e) {
      console.log(e);
      res.status(400).send();
    }
  });
});

app.get('/api/rooms', (req, res) => {
  res.json(rooms);
});

server.listen(port, () => {
  console.log('server is listening to port', port);
});
