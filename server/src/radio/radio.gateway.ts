import { SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RadioSessionDto } from '../common/types';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*' },
  namespace: 'radio',
})
export class RadioGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join')
  handleJoin(client: Socket, radioId: string): void {
    void client.join(radioId);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, radioId: string): void {
    void client.leave(radioId);
  }

  broadcastMetadata(radioId: string, metadata: Partial<RadioSessionDto>): void {
    this.server?.to(radioId).emit('metadataUpdate', metadata);
  }
}
