import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useWebSocketAdapter(new IoAdapter(app));
  
  app.enableCors({
    origin: true,
    credentials: true
  });

  await app.listen(3000);
  console.log(`Server running on port 3000`);
}
bootstrap(); 