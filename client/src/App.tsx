import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';

interface ChangeEvent extends React.ChangeEvent<HTMLInputElement> {
  target: HTMLInputElement;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);

  useEffect(() => {
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3000';
    const newSocket = io(wsUrl, {
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WebSocket server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket server');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('streamOffer', async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
      if (!peerConnection.current) {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        peerConnection.current = pc;

        pc.ontrack = (event) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };
      }

      const pc = peerConnection.current;
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('streamAnswer', {
        answer,
        to: data.from,
        roomId
      });
    });

    socket.on('streamAnswer', async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socket.on('iceCandidate', async (data: { candidate: RTCIceCandidateInit; from: string }) => {
      if (peerConnection.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    return () => {
      socket.off('streamOffer');
      socket.off('streamAnswer');
      socket.off('iceCandidate');
    };
  }, [socket, roomId]);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnection.current = pc;

      stream.getTracks().forEach((track: MediaStreamTrack) => {
        if (localStream.current) {
          pc.addTrack(track, localStream.current);
        }
      });

      setIsStreaming(true);
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const stopStream = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      localStream.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setIsStreaming(false);
  };

  const joinRoom = () => {
    if (socket && roomId) {
      socket.emit('joinRoom', roomId);
    }
  };

  const handleInputChange = (e: ChangeEvent) => {
    setRoomId(e.target.value);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>实时流媒体应用</h1>
        <p>连接状态: {isConnected ? '已连接' : '未连接'}</p>
      </header>
      
      <div className="controls">
        <input
          type="text"
          value={roomId}
          onChange={handleInputChange}
          placeholder="输入房间ID"
        />
        <button onClick={joinRoom}>加入房间</button>
        <button onClick={isStreaming ? stopStream : startStream}>
          {isStreaming ? '停止直播' : '开始直播'}
        </button>
      </div>

      <div className="video-container">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '400px', height: '300px' }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: '400px', height: '300px' }}
        />
      </div>
    </div>
  );
}

export default App; 