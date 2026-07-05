package com.example.Groupware_Chat.Controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.example.Groupware_Chat.DTO.ChatMessageDTO;
import com.example.Groupware_Chat.DTO.ChatMessageRequestDTO;
import com.example.Groupware_Chat.DTO.ChatRoomCreateRequestDTO;
import com.example.Groupware_Chat.DTO.ChatRoomDTO;
import com.example.Groupware_Chat.DTO.ChatRoomMemberDTO;
import com.example.Groupware_Chat.Mapper.ChatMapper;
import com.example.Groupware_Chat.Service.ChatDevBootstrapService;
import com.example.Groupware_Chat.Service.ChatService;

import jakarta.servlet.http.HttpSession;

@RestController
@RequestMapping("/api/chat")
public class ChatRestController {

    private final ChatService chatService;
    private final ChatMapper chatMapper;
    private final ChatDevBootstrapService chatDevBootstrapService;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatRestController(ChatService chatService, ChatMapper chatMapper,
                              ChatDevBootstrapService chatDevBootstrapService,
                              SimpMessagingTemplate messagingTemplate) {
        this.chatService = chatService;
        this.chatMapper = chatMapper;
        this.chatDevBootstrapService = chatDevBootstrapService;
        this.messagingTemplate = messagingTemplate;
    }

    @Value("${chat.dev-login.enabled:false}")
    private boolean devLoginEnabled;

    @Value("${chat.dev-login.create-demo-room:false}")
    private boolean createDemoRoom;

    private Integer currentEmployeeId(HttpSession session) {
        Object employeeId = session.getAttribute("EMPLOYEE_ID");
        if (employeeId == null) {
            employeeId = session.getAttribute("employeeId");
        }
        if (employeeId instanceof Number number) {
            return number.intValue();
        }
        if (employeeId instanceof String text && !text.isBlank()) {
            return Integer.valueOf(text);
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }

    @GetMapping("/rooms")
    public List<ChatRoomDTO> myRooms(HttpSession session) {
        return chatService.getMyRooms(currentEmployeeId(session));
    }

    @GetMapping("/employees")
    public List<Map<String, Object>> employees(HttpSession session) {
        Integer employeeId = currentEmployeeId(session);
        if (devLoginEnabled) {
            chatDevBootstrapService.ensureChatDemoEmployees();
        }
        return chatDevBootstrapService.findChatCandidates(employeeId);
    }

    @GetMapping("/me")
    public Map<String, Integer> me(HttpSession session) {
        return Map.of("employeeId", currentEmployeeId(session));
    }

    @PostMapping("/dev-login")
    public Map<String, Integer> devLogin(HttpSession session,
                                         @RequestParam(required = false) Integer employeeId) {
        if (!devLoginEnabled) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        chatDevBootstrapService.ensureChatDemoEmployees();

        Integer loginEmployeeId = employeeId;
        if (loginEmployeeId == null || !chatMapper.existsEmployee(loginEmployeeId)) {
            loginEmployeeId = chatMapper.selectFirstActiveEmployeeId();
        }
        if (loginEmployeeId == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "EMPLOYEE 테이블에 ACTIVE 직원 데이터가 없습니다.");
        }

        session.setAttribute("EMPLOYEE_ID", loginEmployeeId);
        session.setAttribute("employeeId", loginEmployeeId);

        if (createDemoRoom && chatService.getMyRooms(loginEmployeeId).isEmpty()) {
            Integer otherEmployeeId = chatMapper.selectOtherActiveEmployeeId(loginEmployeeId);
            if (otherEmployeeId != null) {
                ChatRoomCreateRequestDTO request = new ChatRoomCreateRequestDTO();
                request.setTargetEmployeeIds(List.of(otherEmployeeId));
                chatService.createOrGetRoom(loginEmployeeId, request);
            }
        }

        return Map.of("employeeId", loginEmployeeId);
    }

    @PostMapping("/rooms")
    public ChatRoomDTO createRoom(HttpSession session, @RequestBody ChatRoomCreateRequestDTO request) {
        Integer employeeId = currentEmployeeId(session);
        ChatRoomDTO room = chatService.createOrGetRoom(employeeId, request);
        notifyRoomMembers(room.getRoomId(), "room-created");
        return room;
    }

    @GetMapping("/rooms/{roomId}")
    public ChatRoomDTO room(HttpSession session, @PathVariable Integer roomId) {
        return chatService.getRoom(roomId, currentEmployeeId(session));
    }

    @GetMapping("/rooms/{roomId}/members")
    public List<ChatRoomMemberDTO> members(@PathVariable Integer roomId) {
        return chatService.getRoomMembers(roomId);
    }

    @GetMapping("/rooms/{roomId}/messages")
    public List<ChatMessageDTO> messages(HttpSession session,
                                          @PathVariable Integer roomId,
                                          @RequestParam(required = false) Integer beforeMessageId,
                                          @RequestParam(defaultValue = "30") int size) {
        return chatService.getMessages(roomId, currentEmployeeId(session), beforeMessageId, size);
    }

    @PostMapping("/rooms/{roomId}/read")
    public void markAsRead(HttpSession session, @PathVariable Integer roomId,
                            @RequestParam Integer lastMessageId) {
        Integer employeeId = currentEmployeeId(session);
        chatService.markAsRead(roomId, employeeId, lastMessageId);
        Object payload = Map.of("roomId", roomId, "employeeId", employeeId, "lastMessageId", lastMessageId);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/read", payload);
    }

    @PostMapping("/rooms/{roomId}/files")
    public ChatMessageDTO uploadFile(HttpSession session,
                                     @PathVariable Integer roomId,
                                     @RequestParam("file") MultipartFile file) throws IOException {
        Integer employeeId = currentEmployeeId(session);
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "업로드할 파일이 없습니다.");
        }

        Path uploadDir = Path.of("uploads", "chat").toAbsolutePath().normalize();
        Files.createDirectories(uploadDir);

        String originalName = file.getOriginalFilename() == null ? "file" : Path.of(file.getOriginalFilename()).getFileName().toString();
        String storedName = UUID.randomUUID() + "_" + originalName;
        Path savedPath = uploadDir.resolve(storedName).normalize();
        file.transferTo(savedPath);

        ChatMessageRequestDTO request = new ChatMessageRequestDTO();
        request.setMessageType("FILE");
        request.setContent(originalName);
        request.setFileName(originalName);
        request.setFilePath("/uploads/chat/" + storedName);
        request.setFileSize(file.getSize());

        ChatMessageDTO saved = chatService.sendMessage(roomId, employeeId, request);
        messagingTemplate.convertAndSend("/topic/room/" + roomId, saved);
        notifyRoomMembers(roomId, "file-uploaded");
        return saved;
    }

    private void notifyRoomMembers(Integer roomId, String eventType) {
        for (ChatRoomMemberDTO member : chatService.getRoomMembers(roomId)) {
            messagingTemplate.convertAndSendToUser(String.valueOf(member.getEmployeeId()), "/queue/chat-list",
                    Map.of("roomId", roomId, "eventType", eventType));
        }
    }
}
