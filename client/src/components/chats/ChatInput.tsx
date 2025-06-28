import { useAppContext } from "@/context/AppContext";
import { useChatRoom } from "@/context/ChatContext";
import { useSocket } from "@/context/SocketContext";
import { ChatMessage } from "@/types/chat";
import { SocketEvent } from "@/types/socket";
import { formatDate } from "@/utils/formateDate";
import { FormEvent, useRef, useState, useEffect } from "react";
import { LuSendHorizontal } from "react-icons/lu";
import { MdVideoCall, MdCallEnd } from "react-icons/md";
import { ZegoUIKitPrebuilt } from "@zegocloud/zego-uikit-prebuilt";
import { v4 as uuidV4 } from "uuid";
import toast from "react-hot-toast";

// ZegoCloud configuration - replace with your actual credentials
const APP_ID = 489003210;
const SERVER_SECRET = "6bd1c7e9ed1ab08fff4d5537f1d10171";

function ChatInput() {
  
  const { currentUser } = useAppContext();
  const { socket } = useSocket();
  const { setMessages } = useChatRoom();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [isInCall, setIsInCall] = useState(false);
  const [zpInstance, setZpInstance] = useState<any>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // 🔔 Listen for video call started event from others
  useEffect(() => {
    const handleCallStarted = (data: { username: string }) => {
      if (data.username !== currentUser.username) {
        toast(`${data.username} started a video call`, {
          icon: "📹",
        });
      }
    };

    socket.on("video-call-started", handleCallStarted);

    return () => {
      socket.off("video-call-started", handleCallStarted);
    };
  }, [socket, currentUser.username]);

  const handleSendMessage = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputVal = inputRef.current?.value.trim();

    if (inputVal && inputVal.length > 0) {
      const message: ChatMessage = {
        id: uuidV4(),
        message: inputVal,
        username: currentUser.username,
        timestamp: formatDate(new Date().toISOString()),
      };
      socket.emit(SocketEvent.SEND_MESSAGE, { message });
      setMessages((messages) => [...messages, message]);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // ✅ Start video call and emit notification
  const startVideoCall = async () => {
    if (!currentUser?.roomId || !currentUser?.username) {
      console.error("Missing required information for video call");
      return;
    }

    try {
      setIsInCall(true);

      // 🔔 Emit event to notify others
      socket.emit("video-call-started", {
        username: currentUser.username,
        roomId: currentUser.roomId,
      });

      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
        APP_ID,
        SERVER_SECRET,
        currentUser.roomId,
        Date.now().toString(),
        currentUser.username
      );

      const zp = ZegoUIKitPrebuilt.create(kitToken);
      setZpInstance(zp);

      await zp.joinRoom({
        container: videoContainerRef.current,
        scenario: {
          mode: ZegoUIKitPrebuilt.GroupCall,
        },
        showPreJoinView: false,
        showRoomTimer: true,
        onLeaveRoom: endVideoCall,
      });
    } catch (error) {
      console.error("Failed to start video call:", error);
      setIsInCall(false);
    }
  };

  const endVideoCall = () => {
    if (zpInstance) {
      zpInstance.destroy();
      setZpInstance(null);
    }
    setIsInCall(false);
    window.location.reload();
  };

  return (
    <div className="relative">
      {/* Video call container (shown only during call) */}
      {isInCall && (
        <div className="fixed bottom-20 right-4 z-50 h-64 w-80 rounded-lg bg-dark shadow-lg border border-gray-600">
          <div ref={videoContainerRef} className="h-full w-full rounded-lg" />
          <button
            onClick={endVideoCall}
            className="absolute -top-2 -right-2 rounded-full bg-red-500 p-2 hover:bg-red-600 transition-colors"
            title="End Call"
          >
            <MdCallEnd size={20} />
          </button>
        </div>
      )}

      {/* Chat input form */}
      <form
        onSubmit={handleSendMessage}
        className="flex justify-between rounded-md border border-primary"
      >
        <div className="flex items-center">
          <button
            type="button"
            onClick={isInCall ? endVideoCall : startVideoCall}
            className={`flex items-center justify-center rounded-l-md p-2 mr-1 ${
              isInCall
                ? "bg-red-500 hover:bg-red-600"
                : "bg-primary text-black hover:bg-primary-dark"
            } transition-colors`}
            title={isInCall ? "End Video Call" : "Start Video Call"}
          >
            {isInCall ? <MdCallEnd size={24} /> : <MdVideoCall size={24} />}
          </button>
        </div>

        <input
          type="text"
          className="w-full flex-grow rounded-md border-none bg-dark p-2 outline-none"
          placeholder="Enter a message..."
          ref={inputRef}
        />

        <button
          className="flex items-center justify-center rounded-r-md bg-primary p-2 text-black hover:bg-primary-dark transition-colors"
          type="submit"
        >
          <LuSendHorizontal size={24} />
        </button>
      </form>
    </div>
  );
}

export default ChatInput;
