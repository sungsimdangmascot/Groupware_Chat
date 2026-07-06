(function () {
  let myEmployeeId = '';
  let stomp = null;
  let currentRoomId = null;
  let typingTimeout = null;
  let roomSubscriptions = [];
  let fileInputEl = null;
  let allRooms = [];
  let activeRoomFilter = '전체';
  let roomSearchKeyword = '';
  let currentRoom = null;
  let currentRoomMembers = [];
  let inputComposing = false;
  let openingRoom = false;

  const roomListEl = document.querySelector('.chat-room-list');
  const messagesEl = document.querySelector('.chat-messages');
  const inputEl = document.querySelector('.chat-input-bar input[type=text]');
  const sendBtn = document.querySelector('.chat-send-btn');
  const threadWho = document.querySelector('.chat-thread-who');
  const roomSearchEl = document.querySelector('.chat-sidebar input[placeholder*="검색"]');
  const headerChatBadgeEl = document.querySelector('#headerChatBadge');

  window.ChatApp = { openRoom, getCurrentRoomId, getCurrentRoomMembers, getCurrentRoomName, refreshActiveRoom };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    if (location.protocol === 'file:') {
      showChatError('HTML 파일을 직접 열면 실시간 채팅이 동작하지 않습니다. http://localhost:8820/13_chat.html 로 접속해주세요.');
      return;
    }

    clearStaticDemo();
    bindEvents();

    const loggedIn = await ensureLogin();
    if (!loggedIn) return;

    await loadRoomList();
    connectSocket();
  }

  function bindEvents() {
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (roomListEl) {
      roomListEl.addEventListener('mousedown', event => {
        const item = event.target.closest('.chat-room-item');
        if (!item || !roomListEl.contains(item) || !item.dataset.roomId) return;
        event.preventDefault();
        openRoom(item.dataset.roomId, true);
      });
    }
    if (roomSearchEl) {
      roomSearchEl.addEventListener('input', () => {
        roomSearchKeyword = roomSearchEl.value.trim().toLowerCase();
        renderRoomList(allRooms);
      });
    }
    document.querySelectorAll('.chat-filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.chat-filter-tab').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        activeRoomFilter = tab.textContent.trim();
        renderRoomList(allRooms);
      });
    });
    const fileButton = document.querySelector('.chat-input-bar .icon-btn');
    if (fileButton) {
      fileButton.addEventListener('click', event => {
        event.preventDefault();
        ensureFileInput().click();
      });
    }
    if (!inputEl) return;

    inputEl.addEventListener('compositionstart', () => {
      inputComposing = true;
    });
    inputEl.addEventListener('compositionend', () => {
      inputComposing = false;
    });
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (inputComposing || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        sendMessage();
      }
    });
    inputEl.addEventListener('input', notifyTyping);
  }

  function clearStaticDemo() {
    if (roomListEl) roomListEl.innerHTML = '<div class="chat-system-message">채팅방을 불러오는 중입니다.</div>';
    if (messagesEl) messagesEl.innerHTML = '<div class="chat-system-message">메시지를 불러오는 중입니다.</div>';
  }

  async function ensureLogin() {
    try {
      const me = await apiJson('/api/chat/me');
      myEmployeeId = String(me.employeeId);
      return true;
    } catch (error) {
      try {
        const me = await apiJson('/api/chat/dev-login', { method: 'POST' });
        myEmployeeId = String(me.employeeId);
        return true;
      } catch (devLoginError) {
        showChatError('로그인 세션을 만들 수 없습니다. EMPLOYEE 테이블에 ACTIVE 직원 데이터가 있는지 확인해주세요.');
        return false;
      }
    }
  }

  async function loadRoomList() {
    try {
      const rooms = await apiJson('/api/chat/rooms');
      allRooms = rooms;
      updateHeaderUnread(rooms);
      renderRoomList(rooms);

      if (!rooms.length) {
        showChatError('채팅방이 없습니다. ACTIVE 직원이 2명 이상 있으면 개발용 로그인에서 DM 방을 자동 생성합니다.');
        return;
      }

      const requestedRoomId = new URLSearchParams(location.search).get('roomId');
      const firstRoomId = rooms[0].roomId;
      await openRoom(requestedRoomId || currentRoomId || firstRoomId, false);
    } catch (error) {
      showChatError('채팅방 목록을 불러오지 못했습니다. MySQL 실행, DB명 groupware, 비밀번호 설정을 확인해주세요.');
    }
  }

  function renderRoomList(rooms) {
    if (!roomListEl) return;
    roomListEl.innerHTML = '';

    const filteredRooms = rooms.filter(room => {
      if (activeRoomFilter === '개인' && room.roomType !== 'DM') return false;
      if (activeRoomFilter === '그룹' && room.roomType !== 'GROUP') return false;
      const name = (room.roomName || '').toLowerCase();
      const preview = (room.lastMessage || '').toLowerCase();
      return !roomSearchKeyword || name.includes(roomSearchKeyword) || preview.includes(roomSearchKeyword);
    });

    if (!filteredRooms.length) {
      roomListEl.innerHTML = '<div class="chat-system-message">표시할 대화방이 없습니다.</div>';
      return;
    }

    filteredRooms.forEach(room => {
      const item = document.createElement('div');
      item.className = 'chat-room-item' + (String(room.roomId) === String(currentRoomId) ? ' active' : '');
      item.dataset.roomId = room.roomId;
      item.dataset.roomType = room.roomType;
      item.dataset.otherEmployeeId = room.otherEmployeeId || '';

      const isGroup = room.roomType === 'GROUP';
      const displayName = room.roomName || (isGroup ? '그룹 대화' : '대화방');
      const avatarChar = displayName.charAt(0) || '?';
      const avatarClass = isGroup ? 'chat-room-avatar group' : 'chat-room-avatar';
      const onlineDot = !isGroup ? '<span class="chat-online-dot"></span>' : '';

      item.innerHTML = `
        <div class="${avatarClass}">${escapeHtml(avatarChar)}${onlineDot}</div>
        <div class="chat-room-info">
          <div class="chat-room-name-row">
            <span class="chat-room-name">${escapeHtml(displayName)}${room.memberCount > 2 ? ` (${room.memberCount})` : ''}</span>
            <span class="chat-room-time">${formatTime(room.lastMessageTime)}</span>
          </div>
          <div class="chat-room-preview-row">
            <span class="chat-room-preview">${escapeHtml(room.lastMessage || '새 대화를 시작해보세요.')}</span>
            ${room.unreadCount > 0 ? `<span class="chat-room-unread">${room.unreadCount}</span>` : ''}
          </div>
        </div>`;

      roomListEl.appendChild(item);
    });
  }

  function updateHeaderUnread(rooms) {
    if (!headerChatBadgeEl) return;
    const total = rooms.reduce((sum, room) => sum + Number(room.unreadCount || 0), 0);
    headerChatBadgeEl.textContent = total;
    headerChatBadgeEl.style.display = total > 0 ? 'flex' : 'none';
  }

  async function openRoom(roomId, subscribe) {
    if (!roomId) return;
    if (openingRoom && String(currentRoomId) === String(roomId)) return;
    openingRoom = true;
    currentRoomId = roomId;

    document.querySelectorAll('.chat-room-item').forEach(el => {
      el.classList.toggle('active', el.dataset.roomId === String(roomId));
    });

    try {
      const [room, messages, members] = await Promise.all([
        apiJson(`/api/chat/rooms/${roomId}`),
        apiJson(`/api/chat/rooms/${roomId}/messages?size=50`),
        apiJson(`/api/chat/rooms/${roomId}/members`)
      ]);

      currentRoom = room;
      currentRoomMembers = members;
      renderThreadHeader(room);
      renderMessages(messages);

      if (messages.length > 0) {
        markAsRead(roomId, messages[messages.length - 1].messageId);
      }
      if (subscribe && stomp && stomp.connected) {
        subscribeRoom(roomId);
      }
    } catch (error) {
      showChatError('채팅방 메시지를 불러오지 못했습니다.');
    } finally {
      openingRoom = false;
    }
  }

  function renderThreadHeader(room) {
    if (!threadWho || !room) return;
    const displayName = room.roomName || '대화방';
    const avatarChar = displayName.charAt(0) || '?';

    threadWho.innerHTML = `
      <div class="chat-room-avatar">${escapeHtml(avatarChar)}${room.roomType === 'DM' ? '<span class="chat-online-dot"></span>' : ''}</div>
      <div>
        <div style="font-weight:700;">${escapeHtml(displayName)}</div>
        <div class="chat-thread-status">${room.otherDeptName ? escapeHtml(room.otherDeptName) + ' · 접속 중' : '실시간 대화'}</div>
      </div>`;
  }

  function renderMessages(messages) {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';

    if (!messages.length) {
      messagesEl.innerHTML = '<div class="chat-system-message">아직 메시지가 없습니다.</div>';
      return;
    }

    let lastDate = null;
    messages.forEach(message => {
      const dateText = formatDate(message.sentAt);
      if (dateText && dateText !== lastDate) {
        appendDateDivider(dateText);
        lastDate = dateText;
      }
      appendMessage(message, message.mine);
    });
    scrollToBottom();
  }

  function connectSocket() {
    if (typeof SockJS === 'undefined' || typeof Stomp === 'undefined') {
      connectNativeStompFallback();
      return;
    }

    const socket = new SockJS('/ws-chat');
    stomp = Stomp.over(socket);
    stomp.debug = null;

    stomp.connect({}, () => {
      stomp.subscribe('/user/queue/chat-list', () => loadRoomList());
      stomp.subscribe('/topic/presence', frame => {
        const payload = parseJson(frame.body);
        if (payload) updateOnlineDot(payload.employeeId, payload.online);
      });
      if (currentRoomId) subscribeRoom(currentRoomId);
    }, error => {
      console.error(error);
      showChatError('WebSocket 연결에 실패했습니다. 서버를 재시작한 뒤 다시 접속해주세요.');
    });
  }

  function connectNativeStompFallback() {
    stomp = createStompClient('/ws-chat-native');

    stomp.onConnect = () => {
      stomp.subscribe('/user/queue/chat-list', () => loadRoomList());
      stomp.subscribe('/topic/presence', frame => {
        const payload = parseJson(frame.body);
        if (payload) updateOnlineDot(payload.employeeId, payload.online);
      });
      if (currentRoomId) subscribeRoom(currentRoomId);
    };

    stomp.onError = message => {
      console.error(message);
      showChatError('WebSocket 연결에 실패했습니다. 서버를 재시작한 뒤 다시 접속해주세요.');
    };

    stomp.connect();
  }

  function subscribeRoom(roomId) {
    roomSubscriptions.forEach(subscription => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    });
    roomSubscriptions = [];

    roomSubscriptions.push(stomp.subscribe(`/topic/room/${roomId}`, frame => {
      const message = parseJson(frame.body);
      if (!message) return;

      removeEmptyMessage();
      if (message.messageType === 'SYSTEM') {
        refreshRoomMembers();
      }
      appendMessage(message, String(message.senderId) === myEmployeeId);
      scrollToBottom();

      if (String(message.senderId) !== myEmployeeId) {
        markAsRead(roomId, message.messageId);
      }
    }));

    roomSubscriptions.push(stomp.subscribe(`/topic/room/${roomId}/typing`, frame => {
      const payload = parseJson(frame.body);
      if (!payload || String(payload.employeeId) === myEmployeeId) return;
      showTypingIndicator(payload.typing);
    }));

    roomSubscriptions.push(stomp.subscribe(`/topic/room/${roomId}/read`, frame => {
      const payload = parseJson(frame.body);
      if (!payload) return;
      if (payload.members) {
        currentRoomMembers = payload.members;
      }
      if (String(payload.employeeId) !== myEmployeeId || payload.members) {
        updateReadMarks();
      }
    }));

    roomSubscriptions.push(stomp.subscribe(`/topic/room/${roomId}/room`, frame => {
      const room = parseJson(frame.body);
      if (!room) return;
      currentRoom = room;
      renderThreadHeader(room);
      loadRoomList();
    }));
  }

  function sendMessage() {
    if (inputComposing) return;
    const text = inputEl ? inputEl.value.trim() : '';
    if (!text || !currentRoomId) return;

    if (!stomp || !stomp.connected) {
      showChatError('아직 WebSocket이 연결되지 않았습니다. 잠시 후 다시 보내주세요.');
      return;
    }

    sendStompJson(`/app/chat/${currentRoomId}/send`, {
      messageType: 'TEXT',
      content: text
    });
    inputEl.value = '';
  }

  function notifyTyping() {
    if (!currentRoomId || !stomp || !stomp.connected) return;
    sendStompJson(`/app/chat/${currentRoomId}/typing`, { typing: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (stomp && stomp.connected) {
        sendStompJson(`/app/chat/${currentRoomId}/typing`, { typing: false });
      }
    }, 1200);
  }

  function sendStompJson(destination, body) {
    if (stomp.send.length >= 3) {
      stomp.send(destination, {}, JSON.stringify(body));
      return;
    }
    stomp.send(destination, body);
  }

  function ensureFileInput() {
    if (fileInputEl) return fileInputEl;
    fileInputEl = document.createElement('input');
    fileInputEl.type = 'file';
    fileInputEl.style.display = 'none';
    fileInputEl.addEventListener('change', uploadSelectedFile);
    document.body.appendChild(fileInputEl);
    return fileInputEl;
  }

  async function uploadSelectedFile() {
    if (!currentRoomId || !fileInputEl.files || !fileInputEl.files[0]) return;
    const formData = new FormData();
    formData.append('file', fileInputEl.files[0]);
    fileInputEl.value = '';

    try {
      const response = await fetch(`/api/chat/rooms/${currentRoomId}/files`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('파일 업로드 실패');
    } catch (error) {
      alert('파일을 전송하지 못했습니다.');
    }
  }

  function appendMessage(message, isMine) {
    if (!messagesEl) return;

    if (message.messageType === 'SYSTEM') {
      const system = document.createElement('div');
      system.className = 'chat-system-message';
      system.textContent = `— ${message.content || ''} —`;
      messagesEl.appendChild(system);
      return;
    }

    const row = document.createElement('div');
    row.className = 'chat-row ' + (isMine ? 'out' : 'in');
    if (message.messageId) row.dataset.messageId = message.messageId;
    if (message.sentAt) row.dataset.sentAt = message.sentAt;

    const senderName = message.senderName || (isMine ? '나' : '상대');
    const avatarChar = senderName.charAt(0) || '?';
    const bubbleContent = message.messageType === 'FILE'
      ? `<a class="chat-bubble-file" href="${escapeHtml(message.filePath || '#')}" download>
           <i class="fa-solid fa-file-arrow-down" style="color:var(--color-primary);"></i>
           <div><div style="font-weight:600;">${escapeHtml(message.fileName || '파일')}</div>
           <div style="color:var(--text-muted); font-size:0.75rem;">${formatFileSize(message.fileSize)}</div></div></a>`
      : `<div class="chat-bubble">${escapeHtml(message.content || '')}</div>`;

    if (isMine) {
      const readLabel = getReadLabel(message);
      row.innerHTML = `
        <div class="chat-room-avatar">${escapeHtml(avatarChar)}</div>
        <div class="chat-bubble-col">
          <div class="chat-bubble-meta">
            <div class="chat-bubble-state">
              <span class="chat-bubble-read${readLabel === '읽음' ? '' : ' unread'}" style="${readLabel ? '' : 'display:none;'}">${escapeHtml(readLabel)}</span>
              <span class="chat-bubble-time">${formatClock(message.sentAt)}</span>
            </div>
            ${bubbleContent}
          </div>
        </div>`;
    } else {
      row.innerHTML = `
        <div class="chat-room-avatar">${escapeHtml(avatarChar)}</div>
        <div class="chat-bubble-col">
          <span class="chat-sender-name">${escapeHtml(senderName)} ${escapeHtml(message.senderPositionName || '')}</span>
          <div class="chat-bubble-meta">
            ${bubbleContent}
            <span class="chat-bubble-time">${formatClock(message.sentAt)}</span>
          </div>
        </div>`;
    }
    messagesEl.appendChild(row);
  }

  function createStompClient(endpoint) {
    let socket = null;
    let connected = false;
    let nextSubscriptionId = 1;
    const callbacks = new Map();
    const groups = new Map();

    const client = {
      get connected() {
        return connected;
      },
      onConnect: null,
      onError: null,
      connect() {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        socket = new WebSocket(`${protocol}://${location.host}${endpoint}`);

        socket.onopen = () => {
          socket.send('CONNECT\naccept-version:1.2\nheart-beat:0,0\n\n\0');
        };
        socket.onmessage = event => {
          parseFrames(String(event.data)).forEach(handleFrame);
        };
        socket.onerror = () => {
          if (client.onError) client.onError('WebSocket 오류가 발생했습니다.');
        };
        socket.onclose = () => {
          connected = false;
        };
      },
      subscribe(destination, callback, groupName) {
        const id = `sub-${nextSubscriptionId++}`;
        callbacks.set(id, callback);
        if (groupName) {
          const ids = groups.get(groupName) || [];
          ids.push(id);
          groups.set(groupName, ids);
        }
        socket.send(`SUBSCRIBE\nid:${id}\ndestination:${destination}\n\n\0`);
        return {
          unsubscribe() {
            callbacks.delete(id);
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(`UNSUBSCRIBE\nid:${id}\n\n\0`);
            }
          }
        };
      },
      unsubscribeGroup(groupName) {
        const ids = groups.get(groupName) || [];
        ids.forEach(id => {
          callbacks.delete(id);
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(`UNSUBSCRIBE\nid:${id}\n\n\0`);
          }
        });
        groups.delete(groupName);
      },
      send(destination, body) {
        const payload = JSON.stringify(body);
        socket.send(`SEND\ndestination:${destination}\ncontent-type:application/json;charset=UTF-8\ncontent-length:${new TextEncoder().encode(payload).length}\n\n${payload}\0`);
      }
    };

    function handleFrame(frame) {
      if (frame.command === 'CONNECTED') {
        connected = true;
        if (client.onConnect) client.onConnect();
        return;
      }
      if (frame.command === 'MESSAGE') {
        const subscriptionId = frame.headers.subscription;
        const callback = callbacks.get(subscriptionId);
        if (callback) callback(frame);
        return;
      }
      if (frame.command === 'ERROR' && client.onError) {
        client.onError(frame.body || 'STOMP 오류가 발생했습니다.');
      }
    }

    return client;
  }

  function parseFrames(raw) {
    return raw.split('\0')
      .map(text => text.trim())
      .filter(Boolean)
      .map(parseFrame);
  }

  function parseFrame(text) {
    const separator = text.indexOf('\n\n');
    const headerText = separator >= 0 ? text.slice(0, separator) : text;
    const body = separator >= 0 ? text.slice(separator + 2) : '';
    const lines = headerText.split('\n');
    const command = lines.shift();
    const headers = {};

    lines.forEach(line => {
      const index = line.indexOf(':');
      if (index > -1) {
        headers[line.slice(0, index)] = line.slice(index + 1);
      }
    });

    return { command, headers, body };
  }

  async function apiJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`${url} 요청 실패`);
    }
    return response.json();
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error('JSON 파싱 실패', error);
      return null;
    }
  }

  function markAsRead(roomId, lastMessageId) {
    if (!lastMessageId) return;
    fetch(`/api/chat/rooms/${roomId}/read?lastMessageId=${lastMessageId}`, { method: 'POST' })
      .catch(error => console.warn('읽음 상태 갱신 요청 실패', error));
  }

  function updateReadMarks() {
    document.querySelectorAll('.chat-row.out').forEach(row => {
      const messageId = Number(row.dataset.messageId || 0);
      const read = row.querySelector('.chat-bubble-read');
      if (!messageId || !read) return;
      const label = getReadLabel({
        messageId,
        senderId: Number(myEmployeeId),
        sentAt: row.dataset.sentAt
      });
      read.textContent = label;
      read.style.display = label ? '' : 'none';
      read.classList.toggle('unread', label !== '읽음' && label !== '');
    });
  }

  async function refreshRoomMembers() {
    if (!currentRoomId) return;
    try {
      const [room, members] = await Promise.all([
        apiJson(`/api/chat/rooms/${currentRoomId}`),
        apiJson(`/api/chat/rooms/${currentRoomId}/members`)
      ]);
      currentRoom = room;
      currentRoomMembers = members;
      renderThreadHeader(room);
      updateReadMarks();
    } catch (error) {
      console.error(error);
    }
  }

  function getReadLabel(message) {
    const unreadCount = getUnreadCount(message);
    if (currentRoom && currentRoom.roomType === 'GROUP') {
      return unreadCount === 0 ? '' : String(unreadCount);
    }
    if (unreadCount === 0) return '읽음';
    return '안읽음';
  }

  function getUnreadCount(message) {
    if (!currentRoomMembers.length) {
      return message.read ? 0 : 1;
    }

    const messageId = Number(message.messageId || 0);
    const sentAt = message.sentAt ? new Date(message.sentAt) : null;
    return currentRoomMembers.filter(member => {
      if (String(member.employeeId) === myEmployeeId) return false;
      if (message.senderId && String(member.employeeId) === String(message.senderId)) return false;
      if (sentAt && member.joinedAt && new Date(member.joinedAt) > sentAt) return false;
      return !member.lastReadMessageId || Number(member.lastReadMessageId) < messageId;
    }).length;
  }

  function updateOnlineDot(employeeId, online) {
    document.querySelectorAll(`.chat-room-item[data-other-employee-id="${employeeId}"] .chat-online-dot`)
      .forEach(dot => { dot.style.display = online ? '' : 'none'; });
  }

  function showTypingIndicator(isTyping) {
    if (!messagesEl) return;
    let el = messagesEl.querySelector('.chat-typing-row');
    if (isTyping) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'chat-row in chat-typing-row';
        el.innerHTML = `<div class="chat-room-avatar"></div>
          <div class="chat-bubble-col"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
        messagesEl.appendChild(el);
        scrollToBottom();
      }
    } else if (el) {
      el.remove();
    }
  }

  function appendDateDivider(dateText) {
    const div = document.createElement('div');
    div.className = 'chat-date-divider';
    div.innerHTML = `<span>${escapeHtml(dateText)}</span>`;
    messagesEl.appendChild(div);
  }

  function removeEmptyMessage() {
    const onlyMessage = messagesEl && messagesEl.querySelector('.chat-system-message');
    if (onlyMessage && messagesEl.children.length === 1) {
      messagesEl.innerHTML = '';
    }
  }

  function showChatError(message) {
    if (messagesEl) {
      messagesEl.innerHTML = `<div class="chat-system-message">${escapeHtml(message)}</div>`;
    }
  }

  function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function formatClock(value) {
    if (!value) return '';
    const date = new Date(value);
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours < 12 ? '오전' : '오후'} ${hours % 12 === 0 ? 12 : hours % 12}:${minutes}`;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${days[date.getDay()]}요일`;
  }

  function formatTime(value) {
    return value ? formatClock(value) : '';
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  }

  function getCurrentRoomId() {
    return currentRoomId;
  }

  function getCurrentRoomMembers() {
    return currentRoomMembers;
  }

  function getCurrentRoomName() {
    return currentRoom ? currentRoom.roomName || '대화방' : '대화방';
  }

  async function refreshActiveRoom() {
    if (currentRoomId) {
      await openRoom(currentRoomId, true);
      await loadRoomList();
    }
  }
  window.ChatApp = { openRoom, getCurrentRoomId, getCurrentRoomMembers, getCurrentRoomName, refreshActiveRoom };
})();

document.addEventListener('DOMContentLoaded', () => {
  const modalOverlay = document.querySelector('#modalOverlay');
  const modal = document.querySelector('#modal-new-chat');
  const renameModal = document.querySelector('#modal-rename-room');
  const newChatButton = document.querySelector('#modal-new-chat .btn-primary');
  const renameInput = document.querySelector('#roomNameInput');
  const renameSaveButton = document.querySelector('#modal-rename-room .room-name-save-btn');
  if (!modalOverlay || !modal || !newChatButton) return;

  const titleEl = modal.querySelector('.modal-header h3');
  const helpEl = modal.querySelector('.chat-modal-help') || modal.querySelector('.modal-body p');
  const sidebarNewChatLink = document.querySelector('.chat-sidebar-header a[title="새 대화 시작"]');
  const closeButtons = modalOverlay.querySelectorAll('.modal-close-btn, .modal-cancel-btn, .modal-header .icon-btn, .modal-footer .btn-secondary');
  let modalEmployees = [];
  let selectedDept = '전체보기';
  let modalMode = 'new';
  let currentMemberIds = new Set();

  bindDepartmentFilter();

  if (modalOverlay.classList.contains('active')) {
    openNewChat();
  }

  if (sidebarNewChatLink) {
    sidebarNewChatLink.addEventListener('click', event => {
      if (!modal) return;
      event.preventDefault();
      openNewChat();
    });
  }

  document.addEventListener('click', event => {
    const addButton = event.target.closest('.chat-add-member-btn');
    if (addButton) {
      event.preventDefault();
      openAddMember();
      return;
    }

    const who = event.target.closest('.chat-thread-who');
    if (who) {
      event.preventDefault();
      openRenameRoom();
    }
  });

  closeButtons.forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      closeModal();
    });
  });

  newChatButton.addEventListener('click', e => {
    e.preventDefault();
    const checked = [...document.querySelectorAll('#modal-new-chat tbody input[type=checkbox]:checked:not(:disabled)')];
    const targetEmployeeIds = checked
      .map(cb => cb.closest('tr'))
      .filter(row => row && row.dataset.employeeId)
      .map(row => Number(row.dataset.employeeId));

    if (targetEmployeeIds.length === 0) {
      alert(modalMode === 'add' ? '추가할 멤버를 선택해주세요.' : '대화 상대를 선택해주세요.');
      return;
    }

    const roomId = window.ChatApp && window.ChatApp.getCurrentRoomId
      ? window.ChatApp.getCurrentRoomId()
      : null;
    const url = modalMode === 'add' ? `/api/chat/rooms/${roomId}/members` : '/api/chat/rooms';

    if (modalMode === 'add' && !roomId) {
      alert('먼저 대화방을 선택해주세요.');
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEmployeeIds })
    })
      .then(res => {
        if (!res.ok) throw new Error(modalMode === 'add' ? '멤버 추가 실패' : '채팅방 생성 실패');
        return res.json();
      })
      .then(result => {
        if (modalMode === 'add') {
          closeModal();
          if (window.ChatApp && window.ChatApp.refreshActiveRoom) {
            window.ChatApp.refreshActiveRoom();
          }
          return;
        }
        window.location.href = `13_chat.html?roomId=${result.roomId}`;
      })
      .catch(() => alert(modalMode === 'add'
        ? '멤버를 추가하지 못했습니다. 이미 참여 중인지 확인해주세요.'
        : '채팅방을 만들지 못했습니다. DB 연결과 로그인 세션을 확인해주세요.'));
  });

  if (renameSaveButton) {
    renameSaveButton.addEventListener('click', saveRoomName);
  }

  if (renameInput) {
    renameInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveRoomName();
      }
    });
  }

  function openNewChat() {
    modalMode = 'new';
    currentMemberIds = new Set();
    selectedDept = '전체보기';
    setModalText('새 대화 시작', '부서를 클릭해 직원 목록을 필터링하고, 1명을 선택하면 1:1 대화, 2명 이상을 선택하면 그룹 대화가 시작됩니다.', '대화 시작');
    openModal();
  }

  function openAddMember() {
    modalMode = 'add';
    const members = window.ChatApp && window.ChatApp.getCurrentRoomMembers
      ? window.ChatApp.getCurrentRoomMembers()
      : [];
    currentMemberIds = new Set(members.map(member => String(member.employeeId)));
    selectedDept = '전체보기';
    setModalText('멤버 추가', '부서를 클릭해 직원 목록을 필터링하고, 기존 참여자는 참여중으로 표시됩니다.', '추가');
    openModal();
  }

  function openModal() {
    if (renameModal) renameModal.style.display = 'none';
    document.querySelectorAll('#modal-new-chat .org-node').forEach(node => {
      node.classList.toggle('active', node.textContent.trim() === '전체보기');
    });
    modal.style.display = 'block';
    modalOverlay.classList.add('active');
    loadNewChatMembers();
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    modal.style.display = 'none';
    if (renameModal) renameModal.style.display = 'none';
  }

  function openRenameRoom() {
    if (!renameModal || !renameInput) return;
    const roomId = getSelectedRoomId();
    if (!roomId) {
      alert('먼저 대화방을 선택해주세요.');
      return;
    }

    modal.style.display = 'none';
    renameModal.style.display = 'block';
    renameInput.value = window.ChatApp && window.ChatApp.getCurrentRoomName
      ? window.ChatApp.getCurrentRoomName()
      : getHeaderRoomName();
    modalOverlay.classList.add('active');
    renameInput.focus();
    renameInput.select();
  }

  function saveRoomName() {
    if (!renameInput) return;
    const roomId = getSelectedRoomId();
    const roomName = renameInput.value.trim();
    if (!roomId) {
      alert('먼저 대화방을 선택해주세요.');
      return;
    }
    if (!roomName) {
      alert('대화방 이름을 입력해주세요.');
      return;
    }

    fetch(`/api/chat/rooms/${roomId}/name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName })
    })
      .then(res => {
        if (!res.ok) throw new Error('대화방 이름 변경 실패');
        return res.json();
      })
      .then(() => {
        closeModal();
        if (window.ChatApp && window.ChatApp.refreshActiveRoom) {
          window.ChatApp.refreshActiveRoom();
        }
      })
      .catch(() => alert('대화방 이름을 변경하지 못했습니다.'));
  }

  function getSelectedRoomId() {
    if (window.ChatApp && window.ChatApp.getCurrentRoomId && window.ChatApp.getCurrentRoomId()) {
      return window.ChatApp.getCurrentRoomId();
    }
    return document.querySelector('.chat-room-item.active')?.dataset.roomId || null;
  }

  function getHeaderRoomName() {
    return document.querySelector('.chat-thread-who [style*="font-weight"]')?.textContent.trim() || '';
  }

  function setModalText(title, help, primaryText) {
    if (titleEl) titleEl.textContent = title;
    if (helpEl) helpEl.textContent = help;
    newChatButton.textContent = primaryText;
  }

  async function loadNewChatMembers() {
    const tbody = document.querySelector('#modal-new-chat tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">직원 목록을 불러오는 중입니다.</td></tr>';

    try {
      let response = await fetch('/api/chat/employees');
      if (response.status === 401) {
        await fetch('/api/chat/dev-login', { method: 'POST' });
        response = await fetch('/api/chat/employees');
      }
      if (!response.ok) throw new Error('직원 목록 조회 실패');

      modalEmployees = await response.json();
      renderModalEmployees();
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">직원 목록을 불러오지 못했습니다.</td></tr>';
    }
  }

  function bindDepartmentFilter() {
    document.querySelectorAll('#modal-new-chat .org-node').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        document.querySelectorAll('#modal-new-chat .org-node').forEach(el => el.classList.remove('active'));
        node.classList.add('active');
        selectedDept = node.textContent.trim();
        renderModalEmployees();
      });
    });
  }

  function renderModalEmployees() {
    const tbody = document.querySelector('#modal-new-chat tbody');
    if (!tbody) return;

    const employees = selectedDept === '전체보기'
      ? modalEmployees
      : modalEmployees.filter(employee => (employee.deptName || '-') === selectedDept);

    if (!employees.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">선택 가능한 직원이 없습니다.</td></tr>';
        return;
      }

    tbody.innerHTML = employees.map(employee => `
      <tr data-employee-id="${employee.employeeId}" class="${isCurrentMember(employee) ? 'is-current-member' : ''}">
        <td style="text-align:center;"><input type="checkbox" ${isCurrentMember(employee) ? 'checked disabled' : ''}></td>
        <td><strong>${escapeModalHtml(employee.employeeName)}</strong></td>
        <td>${escapeModalHtml(employee.deptName || '-')}</td>
        <td><span class="badge badge-primary">${escapeModalHtml(employee.positionName || '-')}</span></td>
        <td>${isCurrentMember(employee) ? '<span class="badge badge-muted">참여중</span>' : '<span class="badge badge-success">접속 가능</span>'}</td>
      </tr>
    `).join('');
  }

  function isCurrentMember(employee) {
    return modalMode === 'add' && currentMemberIds.has(String(employee.employeeId));
  }

  function escapeModalHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  window.ChatModal = { openNewChat, openAddMember };
});
