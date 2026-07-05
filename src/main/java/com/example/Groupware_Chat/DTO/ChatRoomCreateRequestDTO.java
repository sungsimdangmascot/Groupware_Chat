package com.example.Groupware_Chat.DTO;

import java.util.List;

import lombok.Data;

@Data
public class ChatRoomCreateRequestDTO {
    private List<Integer> targetEmployeeIds;
    private String roomName;
}
