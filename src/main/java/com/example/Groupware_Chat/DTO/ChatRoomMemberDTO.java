package com.example.Groupware_Chat.DTO;

import lombok.Data;

@Data
public class ChatRoomMemberDTO {
    private Integer roomId;
    private Integer employeeId;
    private String employeeName;
    private String deptName;
    private String positionName;
    private Integer lastReadMessageId;
    private boolean online;
}