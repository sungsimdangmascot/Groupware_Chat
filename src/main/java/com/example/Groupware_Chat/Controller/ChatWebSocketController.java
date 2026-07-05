package com.example.Groupware_Chat.Controller;

import java.security.Principal;
import java.util.Map;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.example.Groupware_Chat.DTO.ChatMessageDTO;
import com.example.Groupware_Chat.DTO.ChatMessageRequestDTO;
import com.example.Groupware_Chat.DTO.ChatRoomMemberDTO;
import com.example.Groupware_Chat.DTO.ChatTypingRequestDTO;
import com.example.Groupware_Chat.Service.ChatService;

import lombok.RequiredArgsConstructor;

@Controller
@RequiredArgsConstructor
public class ChatWebSocketController {

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    /** 클라이언트가 /app/chat/{roomId}/send 로 발행 -> /topic/room/{roomId} 로 브로드캐스트 */
    @MessageMapping("/chat/{roomId}/send")
    public void sendMessage(@DestinationVariable Integer roomId,
                             ChatMessageRequestDTO request,
                             Principal principal) {
        Integer senderId = Integer.valueOf(principal.getName());
        ChatMessageDTO saved = chatService.sendMessage(roomId, senderId, request);

        messagingTemplate.convertAndSend("/topic/room/" + roomId, saved);

        for (ChatRoomMemberDTO member : chatService.getRoomMembers(roomId)) {
            messagingTemplate.convertAndSendToUser(
                    String.valueOf(member.getEmployeeId()), "/queue/chat-list",
                    Map.of("roomId", roomId, "lastMessage", messagePreview(saved), "senderId", senderId)
            );
        }
    }

    @MessageMapping("/chat/{roomId}/typing")
    public void typing(@DestinationVariable Integer roomId,
                        ChatTypingRequestDTO request,
                        Principal principal) {
        Object payload = Map.of("employeeId", principal.getName(), "typing", request.isTyping());
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/typing", payload);
    }

    private String messagePreview(ChatMessageDTO m) {
        if ("FILE".equals(m.getMessageType())) return "[파일] " + m.getFileName();
        return m.getContent();
    }
}
