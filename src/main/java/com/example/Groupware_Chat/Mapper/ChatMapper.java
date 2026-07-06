package com.example.Groupware_Chat.Mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.example.Groupware_Chat.DTO.ChatMessageDTO;
import com.example.Groupware_Chat.DTO.ChatRoomDTO;
import com.example.Groupware_Chat.DTO.ChatRoomMemberDTO;


@Mapper
public interface ChatMapper {

    Integer selectFirstActiveEmployeeId();

    Integer selectOtherActiveEmployeeId(@Param("employeeId") Integer employeeId);

    boolean existsEmployee(@Param("employeeId") Integer employeeId);

    // ===== 채팅방 =====
    List<ChatRoomDTO> selectMyRooms(@Param("employeeId") Integer employeeId);

    ChatRoomDTO selectRoomById(@Param("roomId") Integer roomId, @Param("employeeId") Integer employeeId);

    /** 이미 존재하는 DM 방이 있는지 조회 (두 사람 조합) */
    Integer selectDmRoomId(@Param("empId1") Integer empId1, @Param("empId2") Integer empId2);

    int insertRoom(ChatRoomDTO chatRoom); // insert 후 roomId는 useGeneratedKeys로 채워짐

    void insertRoomMember(@Param("roomId") Integer roomId, @Param("employeeId") Integer employeeId);

    void updateRoomAsGroup(@Param("roomId") Integer roomId, @Param("roomName") String roomName);

    void updateRoomName(@Param("roomId") Integer roomId, @Param("roomName") String roomName);

    List<ChatRoomMemberDTO> selectRoomMembers(@Param("roomId") Integer roomId);

    void updateLastReadMessage(@Param("roomId") Integer roomId,
                                @Param("employeeId") Integer employeeId,
                                @Param("messageId") Integer messageId);

    boolean existsRoomMember(@Param("roomId") Integer roomId, @Param("employeeId") Integer employeeId);

    // ===== 메시지 =====
    int insertMessage(ChatMessageDTO chatMessage); // insert 후 messageId는 useGeneratedKeys로 채워짐

    ChatMessageDTO selectMessageById(@Param("messageId") Integer messageId);

    void insertAttachment(@Param("messageId") Integer messageId,
                           @Param("fileName") String fileName,
                           @Param("filePath") String filePath,
                           @Param("fileSize") Long fileSize);

    List<ChatMessageDTO> selectMessages(@Param("roomId") Integer roomId,
                                         @Param("beforeMessageId") Integer beforeMessageId,
                                         @Param("size") int size);

    Integer selectLastReadMessageIdOfOthers(@Param("roomId") Integer roomId, @Param("employeeId") Integer myEmployeeId);
}
