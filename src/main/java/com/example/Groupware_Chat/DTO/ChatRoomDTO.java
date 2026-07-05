package com.example.Groupware_Chat.DTO;


import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ChatRoomDTO {
    private Integer roomId;
    private String roomType;       // DM, GROUP
    private String roomName;       // GROUP 방 이름 (DM은 서비스단에서 상대방 이름으로 세팅)
    private LocalDateTime createdAt;

    // 목록 화면용 (Mapper 조인 결과)
    private String lastMessage;
    private LocalDateTime lastMessageTime;
    private Integer unreadCount;
    private Integer memberCount;

    // DM 방일 때 상대방 정보
    private Integer otherEmployeeId;
    private String otherEmployeeName;
    private String otherDeptName;
    private String otherPositionName;
    private boolean online;
}
