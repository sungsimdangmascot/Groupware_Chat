package com.example.Groupware_Chat.DTO;

import lombok.Data;

/** 타이핑 중 표시용 payload */
@Data
public class ChatTypingRequestDTO {
    private boolean typing;
}