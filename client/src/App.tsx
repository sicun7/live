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
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStream = useRef<MediaStream | null>(null);

  useEffect(() => {
    const wsUrl = process.env.REACT_APP_WS_URL || `ws://${window.location.hostname}:3000`;
    console.log('Connecting to WebSocket server:', wsUrl);
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
      if (isBroadcaster && localStream.current) {
        try {
          const pc = createPeerConnection();
          peerConnections.current.set(userId, pc);

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('streamOffer', {
            offer,
            roomId,
            to: userId
          });
        } catch (error) {
          console.error('Error creating offer for new user:', error);
        }
      }
    });

    socket.on('streamOffer', async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
      console.log('Received stream offer from:', data.from);
      try {
        const pc = new RTCPeerConnection({
          iceServers: [ {
            urls: "turn:124.222.71.173:3478",
            username: "admin",
            credential: "123456",
          },]
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
          console.log('Received remote track:', event.streams[0]);
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        peerConnections.current.set(data.from, pc);

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
      console.log('Received stream answer from:', data.from);
      try {
        const pc = peerConnections.current.get(data.from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log('Remote answer set successfully');
        }
      } catch (error) {
        console.error('Error setting remote description:', error);
      }
    });

    socket.on('iceCandidate', async (data: { candidate: RTCIceCandidateInit; from: string }) => {
      console.log('Received ICE candidate from:', data.from);
      try {
        const pc = peerConnections.current.get(data.from);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('ICE candidate added successfully');
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });

    socket.on('userDisconnected', ({ userId }) => {
      console.log('User disconnected:', userId);
      const pc = peerConnections.current.get(userId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(userId);
      }
    });

    return () => {
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      
      socket.off('userJoined');
      socket.off('streamOffer');
      socket.off('streamAnswer');
      socket.off('iceCandidate');
      socket.off('userDisconnected');
    };
  }, [socket, roomId, isBroadcaster]);

  const createPeerConnection = () => {
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

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!);
      });
    }

    return pc;
  };

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

      setIsStreaming(true);
      setIsBroadcaster(true);

    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      
      localStream.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);
      setIsStreaming(true);
      setIsBroadcaster(true);

    } catch (error) {
      console.error('Error accessing screen share:', error);
    }
  };

  const stopScreenShare = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    
    setIsScreenSharing(false);
    setIsStreaming(false);
    setIsBroadcaster(false);
  };

  const stopStream = () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      
      setIsStreaming(false);
      setIsBroadcaster(false);
    }
  };

  const joinRoom = async () => {
    if (socket && roomId) {
      socket.emit('joinRoom', roomId, async (response: { success: boolean }) => {
        if (response.success) {
          console.log('Successfully joined room:', roomId);
          if (isBroadcaster && peerConnections.current.get(roomId) && localStream.current) {
            try {
              const offer = await peerConnections.current.get(roomId)!.createOffer();
              await peerConnections.current.get(roomId)!.setLocalDescription(offer);
              socket.emit('streamOffer', {
                offer,
                roomId
              });
            } catch (error) {
              console.error('Error creating offer after joining room:', error);
            }
          }
        }
      });
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
        <p>当前模式: {isScreenSharing ? '屏幕共享' : '摄像头直播'}</p>
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
          {isStreaming ? '停止直播' : '开始摄像头直播'}
        </button>
        <button 
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          disabled={isStreaming && !isScreenSharing}
        >
          {isScreenSharing ? '停止屏幕共享' : '开始屏幕共享'}
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