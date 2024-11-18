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
    console.log(`Client ${client.id} joining room ${roomId}`);
    
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    
    const roomClients = this.rooms.get(roomId);
    roomClients?.add(client.id);
    
    client.join(roomId);
    
    // 通知房间内其他人有新成员加入
    client.to(roomId).emit('userJoined', { userId: client.id });
    
    console.log(`Room ${roomId} now has members:`, Array.from(roomClients || []));
    return { success: true, roomId };
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string
  ) {
    console.log(`Client ${client.id} leaving room ${roomId}`);
    this.rooms.get(roomId)?.delete(client.id);
    client.leave(roomId);
    return { success: true };
  }

  @SubscribeMessage('streamOffer')
  handleStreamOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { offer: RTCSessionDescriptionInit; roomId: string }
  ) {
    console.log(`Received stream offer from ${client.id} for room ${data.roomId}`);
    
    // 获取房间内的所有其他客户端
    const roomClients = this.rooms.get(data.roomId);
    if (roomClients) {
      roomClients.forEach(clientId => {
        if (clientId !== client.id) {
          console.log(`Forwarding offer to client ${clientId}`);
          this.server.to(clientId).emit('streamOffer', {
            offer: data.offer,
            from: client.id
          });
        }
      });
    }
  }

  @SubscribeMessage('streamAnswer')
  handleStreamAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { answer: RTCSessionDescriptionInit; roomId: string; to: string }
  ) {
    console.log(`Received stream answer from ${client.id} to ${data.to}`);
    this.server.to(data.to).emit('streamAnswer', {
      answer: data.answer,
      from: client.id
    });
  }

  @SubscribeMessage('iceCandidate')
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { candidate: RTCIceCandidate; roomId: string; to: string }
  ) {
    console.log(`Received ICE candidate from ${client.id} to ${data.to}`);
    if (data.to === data.roomId) {
      // 如果目标是房间ID，则广播给房间内所有其他用户
      const roomClients = this.rooms.get(data.roomId);
      if (roomClients) {
        roomClients.forEach(clientId => {
          if (clientId !== client.id) {
            this.server.to(clientId).emit('iceCandidate', {
              candidate: data.candidate,
              from: client.id
            });
          }
        });
      }
    } else {
      // 否则发送给特定用户
      this.server.to(data.to).emit('iceCandidate', {
        candidate: data.candidate,
        from: client.id
      });
    }
  }
} 