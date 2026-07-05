package com.example.Groupware_Chat.DTO;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ChatMessageDTO {
    private Integer messageId;
    private Integer roomId;
    private Integer senderId;
    private String senderName;       // 조인 결과
    private String senderPositionName; // 조인 결과

    private String messageType;      // TEXT, FILE, SYSTEM
    private String content;

    // CHAT_ATTACHMENT 조인 결과 (FILE 타입일 때만 값 있음)
    private String fileName;
    private String filePath;
    private Long fileSize;

    private LocalDateTime sentAt;
    private boolean mine;   // 서비스단에서 로그인 emp 기준 계산
    private boolean read;   // 상대방이 읽었는지 여부 (DM 기준)
}
