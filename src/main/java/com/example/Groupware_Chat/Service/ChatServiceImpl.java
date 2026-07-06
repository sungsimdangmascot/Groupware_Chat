package com.example.Groupware_Chat.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.example.Groupware_Chat.DTO.ChatMessageDTO;
import com.example.Groupware_Chat.DTO.ChatMessageRequestDTO;
import com.example.Groupware_Chat.DTO.ChatRoomCreateRequestDTO;
import com.example.Groupware_Chat.DTO.ChatRoomDTO;
import com.example.Groupware_Chat.DTO.ChatRoomMemberDTO;
import com.example.Groupware_Chat.Mapper.ChatMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ChatServiceImpl implements ChatService {

    private final ChatMapper chatMapper;

    @Override
    public List<ChatRoomDTO> getMyRooms(Integer employeeId) {
        List<ChatRoomDTO> rooms = chatMapper.selectMyRooms(employeeId);
        rooms.forEach(this::applyDisplayName);
        return rooms;
    }

    @Override
    public ChatRoomDTO getRoom(Integer roomId, Integer employeeId) {
        ChatRoomDTO room = chatMapper.selectRoomById(roomId, employeeId);
        if (room != null) applyDisplayName(room);
        return room;
    }

    @Override
    public List<ChatRoomMemberDTO> getRoomMembers(Integer roomId) {
        return chatMapper.selectRoomMembers(roomId);
    }

    @Override
    @Transactional
    public ChatRoomDTO createOrGetRoom(Integer myEmployeeId, ChatRoomCreateRequestDTO request) {
        Set<Integer> targetSet = new LinkedHashSet<>(
                request.getTargetEmployeeIds() != null ? request.getTargetEmployeeIds() : Collections.emptyList());
        targetSet.remove(myEmployeeId);
        List<Integer> targets = new ArrayList<>(targetSet);
        if (targets.isEmpty()) {
            throw new IllegalArgumentException("대화 상대를 선택해주세요.");
        }

        // DM 방 - 기존 방이 있으면 재사용
        if (targets.size() == 1) {
            Integer otherId = targets.get(0);
            Integer existingRoomId = chatMapper.selectDmRoomId(myEmployeeId, otherId);
            if (existingRoomId != null) {
                return getRoom(existingRoomId, myEmployeeId);
            }
            ChatRoomDTO room = new ChatRoomDTO();
            room.setRoomType("DM");
            chatMapper.insertRoom(room);
            chatMapper.insertRoomMember(room.getRoomId(), myEmployeeId);
            chatMapper.insertRoomMember(room.getRoomId(), otherId);
            return getRoom(room.getRoomId(), myEmployeeId);
        }

        // GROUP 방 생성
        ChatRoomDTO room = new ChatRoomDTO();
        room.setRoomType("GROUP");
        room.setRoomName(StringUtils.hasText(request.getRoomName()) ? request.getRoomName() : "새 그룹 대화");
        chatMapper.insertRoom(room);
        chatMapper.insertRoomMember(room.getRoomId(), myEmployeeId);
        for (Integer employeeId : targets) {
            chatMapper.insertRoomMember(room.getRoomId(), employeeId);
        }
        return getRoom(room.getRoomId(), myEmployeeId);
    }

    @Override
    @Transactional
    public List<ChatMessageDTO> addRoomMembers(Integer roomId, Integer actorEmployeeId, ChatRoomCreateRequestDTO request) {
        if (!chatMapper.existsRoomMember(roomId, actorEmployeeId)) {
            throw new IllegalStateException("해당 대화방 접근 권한이 없습니다.");
        }

        Set<Integer> targetSet = new LinkedHashSet<>(
                request.getTargetEmployeeIds() != null ? request.getTargetEmployeeIds() : Collections.emptyList());
        targetSet.remove(actorEmployeeId);
        if (targetSet.isEmpty()) {
            throw new IllegalArgumentException("추가할 멤버를 선택해주세요.");
        }

        List<ChatRoomMemberDTO> currentMembers = chatMapper.selectRoomMembers(roomId);
        Set<Integer> currentMemberIds = new LinkedHashSet<>();
        for (ChatRoomMemberDTO member : currentMembers) {
            currentMemberIds.add(member.getEmployeeId());
        }

        List<ChatMessageDTO> systemMessages = new ArrayList<>();
        for (Integer employeeId : targetSet) {
            if (currentMemberIds.contains(employeeId)) {
                continue;
            }
            if (!chatMapper.existsEmployee(employeeId)) {
                continue;
            }

            chatMapper.insertRoomMember(roomId, employeeId);
            currentMemberIds.add(employeeId);

            ChatRoomMemberDTO addedMember = findMember(roomId, employeeId);
            ChatMessageDTO systemMessage = new ChatMessageDTO();
            systemMessage.setRoomId(roomId);
            systemMessage.setSenderId(null);
            systemMessage.setMessageType("SYSTEM");
            systemMessage.setContent(addedMember.getEmployeeName() + "님이 들어오셨습니다.");
            chatMapper.insertMessage(systemMessage);
            systemMessages.add(chatMapper.selectMessageById(systemMessage.getMessageId()));
        }

        if (systemMessages.isEmpty()) {
            throw new IllegalArgumentException("이미 참여 중인 멤버입니다.");
        }

        List<ChatRoomMemberDTO> updatedMembers = chatMapper.selectRoomMembers(roomId);
        chatMapper.updateRoomAsGroup(roomId, buildGroupRoomName(updatedMembers));
        return systemMessages;
    }

    @Override
    @Transactional
    public ChatRoomDTO renameRoom(Integer roomId, Integer employeeId, String roomName) {
        if (!chatMapper.existsRoomMember(roomId, employeeId)) {
            throw new IllegalStateException("해당 대화방 접근 권한이 없습니다.");
        }
        if (!StringUtils.hasText(roomName)) {
            throw new IllegalArgumentException("대화방 이름을 입력해주세요.");
        }

        chatMapper.updateRoomName(roomId, roomName.trim());
        return getRoom(roomId, employeeId);
    }

    @Override
    public List<ChatMessageDTO> getMessages(Integer roomId, Integer employeeId, Integer beforeMessageId, int size) {
        if (!chatMapper.existsRoomMember(roomId, employeeId)) {
            throw new IllegalStateException("해당 대화방 접근 권한이 없습니다.");
        }
        List<ChatMessageDTO> messages = chatMapper.selectMessages(roomId, beforeMessageId, size);
        Collections.reverse(messages); // 오래된 순으로 정렬해서 반환

        Integer othersLastRead = chatMapper.selectLastReadMessageIdOfOthers(roomId, employeeId);
        for (ChatMessageDTO m : messages) {
            m.setMine(m.getSenderId() != null && m.getSenderId().equals(employeeId));
            m.setRead(othersLastRead != null && m.getMessageId() <= othersLastRead);
        }
        return messages;
    }

    @Override
    @Transactional
    public ChatMessageDTO sendMessage(Integer roomId, Integer senderId, ChatMessageRequestDTO request) {
        if (!chatMapper.existsRoomMember(roomId, senderId)) {
            throw new IllegalStateException("해당 대화방 접근 권한이 없습니다.");
        }

        ChatMessageDTO message = new ChatMessageDTO();
        message.setRoomId(roomId);
        message.setSenderId(senderId);
        message.setMessageType(StringUtils.hasText(request.getMessageType()) ? request.getMessageType() : "TEXT");
        message.setContent(request.getContent());
        chatMapper.insertMessage(message);

        if ("FILE".equals(message.getMessageType())) {
            chatMapper.insertAttachment(message.getMessageId(),
                    request.getFileName(), request.getFilePath(), request.getFileSize());
            message.setFileName(request.getFileName());
            message.setFilePath(request.getFilePath());
            message.setFileSize(request.getFileSize());
        }

        // 보낸 사람 기준으로는 자기 메시지까지 읽은 것으로 처리
        chatMapper.updateLastReadMessage(roomId, senderId, message.getMessageId());
        ChatMessageDTO saved = chatMapper.selectMessageById(message.getMessageId());
        saved.setMine(true);
        return saved;
    }

    @Override
    @Transactional
    public void markAsRead(Integer roomId, Integer employeeId, Integer lastMessageId) {
        if (!chatMapper.existsRoomMember(roomId, employeeId)) {
            throw new IllegalStateException("해당 대화방 접근 권한이 없습니다.");
        }
        chatMapper.updateLastReadMessage(roomId, employeeId, lastMessageId);
    }

    /** ROOM_NAME이 있으면 공통 이름으로 쓰고, 없을 때만 방 타입별 fallback 이름을 만든다. */
    private void applyDisplayName(ChatRoomDTO room) {
        if (StringUtils.hasText(room.getRoomName())) {
            return;
        }
        if ("DM".equals(room.getRoomType()) && room.getOtherEmployeeName() != null) {
            room.setRoomName(room.getOtherEmployeeName()
                + (room.getOtherPositionName() != null ? " " + room.getOtherPositionName() : ""));
            return;
        }
        if ("GROUP".equals(room.getRoomType())) {
            room.setRoomName(buildGroupRoomName(chatMapper.selectRoomMembers(room.getRoomId())));
        }
    }

    private ChatRoomMemberDTO findMember(Integer roomId, Integer employeeId) {
        return chatMapper.selectRoomMembers(roomId).stream()
                .filter(member -> member.getEmployeeId().equals(employeeId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("추가된 멤버를 찾을 수 없습니다."));
    }

    private String buildGroupRoomName(List<ChatRoomMemberDTO> members) {
        return members.stream()
                .map(ChatRoomMemberDTO::getEmployeeName)
                .filter(StringUtils::hasText)
                .limit(4)
                .reduce((left, right) -> left + ", " + right)
                .orElse("그룹 대화");
    }
}
