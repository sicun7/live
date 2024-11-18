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
  const [isBroadcaster, setIsBroadcaster] = useState(false);
  
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

    socket.on('userJoined', async ({ userId }) => {
      console.log('New user joined:', userId);
      if (isBroadcaster && peerConnection.current && localStream.current) {
        try {
          const offer = await peerConnection.current.createOffer();
          await peerConnection.current.setLocalDescription(offer);
          socket.emit('streamOffer', {
            offer,
            roomId
          });
        } catch (error) {
          console.error('Error creating offer for new user:', error);
        }
      }
    });

    socket.on('streamOffer', async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
      console.log('Received stream offer:', data);
      try {
        if (peerConnection.current) {
          peerConnection.current.close();
        }
        
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit('iceCandidate', {
              candidate: event.candidate,
              roomId,
              to: data.from
            });
          }
        };

        pc.ontrack = (event) => {
          console.log('Received remote track:', event);
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        peerConnection.current = pc;

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('streamAnswer', {
          answer,
          to: data.from,
          roomId
        });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    socket.on('streamAnswer', async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
      console.log('Received stream answer:', data);
      try {
        if (peerConnection.current) {
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
        }
      } catch (error) {
        console.error('Error setting remote description:', error);
      }
    });

    socket.on('iceCandidate', async (data: { candidate: RTCIceCandidateInit; from: string }) => {
      console.log('Received ICE candidate:', data);
      try {
        if (peerConnection.current) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });

    return () => {
      socket.off('userJoined');
      socket.off('streamOffer');
      socket.off('streamAnswer');
      socket.off('iceCandidate');
    };
  }, [socket, roomId, isBroadcaster]);

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

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('iceCandidate', {
            candidate: event.candidate,
            roomId,
            to: roomId
          });
        }
      };

      stream.getTracks().forEach(track => {
        if (localStream.current) {
          pc.addTrack(track, localStream.current);
        }
      });

      peerConnection.current = pc;
      setIsStreaming(true);
      setIsBroadcaster(true);

      if (roomId && socket) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('streamOffer', {
          offer,
          roomId
        });
      }
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

  const joinRoom = async () => {
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
        <p>角色: {isBroadcaster ? '主播' : '观众'}</p>
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