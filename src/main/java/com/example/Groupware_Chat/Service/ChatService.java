package com.example.Groupware_Chat.Service;

import java.util.List;

import com.example.Groupware_Chat.DTO.ChatMessageDTO;
import com.example.Groupware_Chat.DTO.ChatMessageRequestDTO;
import com.example.Groupware_Chat.DTO.ChatRoomCreateRequestDTO;
import com.example.Groupware_Chat.DTO.ChatRoomDTO;
import com.example.Groupware_Chat.DTO.ChatRoomMemberDTO;

public interface ChatService {
    List<ChatRoomDTO> getMyRooms(Integer employeeId);
    ChatRoomDTO getRoom(Integer roomId, Integer employeeId);
    List<ChatRoomMemberDTO> getRoomMembers(Integer roomId);
    ChatRoomDTO createOrGetRoom(Integer myEmployeeId, ChatRoomCreateRequestDTO request);
    List<ChatMessageDTO> addRoomMembers(Integer roomId, Integer actorEmployeeId, ChatRoomCreateRequestDTO request);
    ChatRoomDTO renameRoom(Integer roomId, Integer employeeId, String roomName);
    List<ChatMessageDTO> getMessages(Integer roomId, Integer employeeId, Integer beforeMessageId, int size);
    ChatMessageDTO sendMessage(Integer roomId, Integer senderId, ChatMessageRequestDTO request);
    void markAsRead(Integer roomId, Integer employeeId, Integer lastMessageId);
}
