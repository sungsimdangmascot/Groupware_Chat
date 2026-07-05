package com.example.Groupware_Chat.Presence;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class PresenceEventListener {

    private final SimpMessagingTemplate messagingTemplate;
    // employeeId -> 접속중인 세션 개수 (다중 탭 대응)
    private final Map<String, Integer> onlineCount = new ConcurrentHashMap<>();

    @EventListener
    public void handleConnected(SessionConnectedEvent event) {
        String employeeId = event.getUser() != null ? event.getUser().getName() : null;
        if (employeeId == null) return;
        onlineCount.merge(employeeId, 1, Integer::sum);
        broadcast(employeeId, true);
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        String employeeId = event.getUser() != null ? event.getUser().getName() : null;
        if (employeeId == null) return;
        onlineCount.computeIfPresent(employeeId, (k, v) -> v > 1 ? v - 1 : null);
        if (!onlineCount.containsKey(employeeId)) {
            broadcast(employeeId, false);
        }
    }

    private void broadcast(String employeeId, boolean online) {
        Object payload = Map.of("employeeId", employeeId, "online", online);
        messagingTemplate.convertAndSend("/topic/presence", payload);
    }
}
