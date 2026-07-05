package com.example.Groupware_Chat.DTO;

import lombok.Data;

@Data
public class ChatMessageRequestDTO {   // ← DTO 붙이기
    private String messageType;
    private String content;
    private String fileName;
    private String filePath;
    private Long fileSize;
}