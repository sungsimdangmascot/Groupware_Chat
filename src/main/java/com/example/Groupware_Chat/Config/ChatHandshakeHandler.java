package com.example.Groupware_Chat.Config;

import org.springframework.http.server.ServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import java.security.Principal;
import java.util.Map;

public class ChatHandshakeHandler extends DefaultHandshakeHandler {
    @Override
    protected Principal determineUser(ServerHttpRequest request, WebSocketHandler wsHandler,
                                       Map<String, Object> attributes) {
        Object employeeId = attributes.get("EMPLOYEE_ID");
        if (employeeId == null) {
            employeeId = attributes.get("employeeId");
        }
        if (employeeId == null) {
            throw new IllegalStateException("로그인 세션이 없습니다.");
        }
        String principalName = String.valueOf(employeeId);
        return () -> principalName; // Principal.getName() = employeeId 문자열
    }
}
