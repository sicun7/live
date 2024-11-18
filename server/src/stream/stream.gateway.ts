import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface StreamData {
  stream: any;
  roomId?: string;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true
  }
})
export class StreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private rooms = new Map<string, Set<string>>();

  handleConnection(@ConnectedSocket() client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    // 清理房间
    this.rooms.forEach((clients, roomId) => {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    });
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string
  ) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)?.add(client.id);
    client.join(roomId);
    return { success: true, roomId };
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string
  ) {
    this.rooms.get(roomId)?.delete(client.id);
    client.leave(roomId);
    return { success: true };
  }

  @SubscribeMessage('streamOffer')
  handleStreamOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { offer: RTCSessionDescriptionInit; roomId: string }
  ) {
    client.to(data.roomId).emit('streamOffer', {
      offer: data.offer,
      from: client.id
    });
  }

  @SubscribeMessage('streamAnswer')
  handleStreamAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { answer: RTCSessionDescriptionInit; roomId: string; to: string }
  ) {
    client.to(data.to).emit('streamAnswer', {
      answer: data.answer,
      from: client.id
    });
  }

  @SubscribeMessage('iceCandidate')
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { candidate: RTCIceCandidate; roomId: string; to: string }
  ) {
    client.to(data.to).emit('iceCandidate', {
      candidate: data.candidate,
      from: client.id
    });
  }
} 