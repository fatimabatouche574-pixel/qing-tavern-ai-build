(() => {
  'use strict';

  const DB_NAME = 'QingTavernAI';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const STATE_KEY = 'state';

  const THEMES = [
    { id: 'mint', label: '薄荷晨雾', css: '', colors: ['#dff7ef', '#65bfa7', '#f4bdc8'] },
    { id: 'sakura', label: '樱花晴昼', css: 'theme-sakura', colors: ['#fff6f7', '#f3a3b3', '#9bd8d3'] },
    { id: 'night', label: '夜航星河', css: 'theme-night', colors: ['#101522', '#8ca7ff', '#d9a8ff'] },
    { id: 'paper', label: '奶油纸页', css: 'theme-paper', colors: ['#fbf3e6', '#c89d69', '#8eb6a7'] },
    { id: 'celadon', label: '青瓷雨巷', css: 'theme-celadon', colors: ['#eef7f9', '#78b7c7', '#b9d0a2'] }
  ];

  const DEFAULT_BODY_TEMPLATE = `{
  "model": "{{model}}",
  "messages": {{messagesJson}},
  "temperature": {{temperature}},
  "max_tokens": {{maxTokens}}
}`;

  const DEFAULT_STATE = () => ({
    version: 1,
    settings: {
      theme: 'mint',
      userName: 'User',
      contextLimit: 24,
      globalSystemPrompt: 'You are an immersive roleplay assistant. Stay in character, respect the character card, maintain continuity, and write vivid but concise replies.',
      activeApiProfileId: 'api-openai-compatible',
      apiProfiles: [
        {
          id: 'api-openai-compatible',
          name: 'OpenAI 兼容接口',
          type: 'openai',
          endpoint: 'https://api.openai.com/v1/chat/completions',
          apiKey: '',
          model: 'your-model-name',
          headers: '',
          temperature: 0.85,
          maxTokens: 800,
          bodyTemplate: DEFAULT_BODY_TEMPLATE,
          responsePath: 'choices.0.message.content'
        }
      ]
    },
    ui: {
      activeCharacterId: null,
      activeChatId: null
    },
    characters: [],
    chats: [],
    messages: []
  });

  let state = DEFAULT_STATE();
  let db = null;
  let saveTimer = null;
  let currentManualImport = null;
  let busy = false;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const els = {
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebarToggle'),
    characterList: $('#characterList'),
    topbarCharacter: $('#topbarCharacter'),
    chatPane: $('#chatPane'),
    emptyState: $('#emptyState'),
    emptyImportBtn: $('#emptyImportBtn'),
    chatWorkspace: $('#chatWorkspace'),
    chatStrip: $('#chatStrip'),
    messagesScroll: $('#messagesScroll'),
    suggestionBar: $('#suggestionBar'),
    composer: $('#composer'),
    userInput: $('#userInput'),
    sendBtn: $('#sendBtn'),
    suggestBtn: $('#suggestBtn'),
    continueBtn: $('#continueBtn'),
    forkHereBtn: $('#forkHereBtn'),
    newCharacterBtn: $('#newCharacterBtn'),
    importCardBtn: $('#importCardBtn'),
    cardImportInput: $('#cardImportInput'),
    newChatBtn: $('#newChatBtn'),
    editCharacterBtn: $('#editCharacterBtn'),
    settingsBtn: $('#settingsBtn'),
    characterModal: $('#characterModal'),
    chatModal: $('#chatModal'),
    settingsModal: $('#settingsModal'),
    manualImportModal: $('#manualImportModal'),
    characterModalTitle: $('#characterModalTitle'),
    charName: $('#charName'),
    charTags: $('#charTags'),
    charDescription: $('#charDescription'),
    charPersonality: $('#charPersonality'),
    charScenario: $('#charScenario'),
    charFirstMessage: $('#charFirstMessage'),
    charExample: $('#charExample'),
    charSystemPrompt: $('#charSystemPrompt'),
    avatarBtn: $('#avatarBtn'),
    backgroundBtn: $('#backgroundBtn'),
    exportCharacterBtn: $('#exportCharacterBtn'),
    avatarInput: $('#avatarInput'),
    backgroundInput: $('#backgroundInput'),
    saveCharacterBtn: $('#saveCharacterBtn'),
    newChatTitle: $('#newChatTitle'),
    createChatBtn: $('#createChatBtn'),
    themeGrid: $('#themeGrid'),
    apiProfileSelect: $('#apiProfileSelect'),
    apiName: $('#apiName'),
    apiType: $('#apiType'),
    apiModel: $('#apiModel'),
    apiEndpoint: $('#apiEndpoint'),
    apiKey: $('#apiKey'),
    apiHeaders: $('#apiHeaders'),
    apiTemperature: $('#apiTemperature'),
    apiMaxTokens: $('#apiMaxTokens'),
    apiBodyTemplate: $('#apiBodyTemplate'),
    apiResponsePath: $('#apiResponsePath'),
    newApiProfileBtn: $('#newApiProfileBtn'),
    deleteApiProfileBtn: $('#deleteApiProfileBtn'),
    testApiBtn: $('#testApiBtn'),
    saveApiBtn: $('#saveApiBtn'),
    userName: $('#userName'),
    contextLimit: $('#contextLimit'),
    globalSystemPrompt: $('#globalSystemPrompt'),
    saveGeneralSettingsBtn: $('#saveGeneralSettingsBtn'),
    exportAllBtn: $('#exportAllBtn'),
    importAllBtn: $('#importAllBtn'),
    importAllInput: $('#importAllInput'),
    manualName: $('#manualName'),
    manualDescription: $('#manualDescription'),
    manualRaw: $('#manualRaw'),
    saveManualImportBtn: $('#saveManualImportBtn')
  };

  function uid(prefix = 'id') {
    const c = globalThis.crypto;
    if (c && c.randomUUID) return `${prefix}-${c.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeJsonParse(text, fallback = null) {
    try { return JSON.parse(text); } catch (_) { return fallback; }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function shortText(value, length = 70) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= length) return text;
    return `${text.slice(0, length - 1)}…`;
  }

  function initials(name) {
    const clean = String(name || '青').trim();
    return clean.slice(0, 2).toUpperCase();
  }

  function toast(message, type = 'info') {
    const node = document.createElement('div');
    node.className = `toast ${type === 'error' ? 'error' : ''}`;
    node.textContent = message;
    $('#toastHost').appendChild(node);
    setTimeout(() => node.remove(), 5200);
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.hidden = false;
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.hidden = true;
  }

  async function openDb() {
    if (!('indexedDB' in window)) return null;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbGet(key) {
    if (!db) {
      const raw = localStorage.getItem(`qt:${key}`);
      return raw ? JSON.parse(raw) : undefined;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbSet(key, value) {
    if (!db) {
      localStorage.setItem(`qt:${key}`, JSON.stringify(value));
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(), 220);
  }

  async function saveState() {
    state.version = 1;
    await dbSet(STATE_KEY, state);
  }

  async function loadState() {
    try {
      db = await openDb();
      const stored = await dbGet(STATE_KEY);
      if (stored && typeof stored === 'object') state = migrateState(stored);
      else state = createSeedState();
    } catch (error) {
      console.error(error);
      const raw = localStorage.getItem('qt:state');
      state = raw ? migrateState(JSON.parse(raw)) : createSeedState();
    }
  }

  function migrateState(input) {
    const base = DEFAULT_STATE();
    const merged = {
      ...base,
      ...input,
      settings: { ...base.settings, ...(input.settings || {}) },
      ui: { ...base.ui, ...(input.ui || {}) },
      characters: Array.isArray(input.characters) ? input.characters : [],
      chats: Array.isArray(input.chats) ? input.chats : [],
      messages: Array.isArray(input.messages) ? input.messages : []
    };
    if (!Array.isArray(merged.settings.apiProfiles) || merged.settings.apiProfiles.length === 0) {
      merged.settings.apiProfiles = base.settings.apiProfiles;
      merged.settings.activeApiProfileId = base.settings.activeApiProfileId;
    }
    return merged;
  }

  function createSeedState() {
    const s = DEFAULT_STATE();
    const character = normalizeCard({
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: '青樽看板娘',
        description: '一家本地 AI 酒馆的温柔看板娘，擅长陪用户测试角色卡、分支剧情与多 API 接口。',
        personality: '清新、细腻、会主动推进对话，但不会抢走用户的选择权。',
        scenario: '你刚走进一间雨后薄荷香的虚拟酒馆，吧台上亮着一盏柔和的小灯。',
        first_mes: '欢迎来到青樽。你可以先导入一张角色卡，或者让我陪你测试这个本地酒馆。',
        mes_example: '<START>\n{{user}}: 这里能做什么？\n{{char}}: 可以创建角色、导入卡片、分支剧情，也可以接入你自己的模型 API。',
        system_prompt: 'Speak as the character. Keep replies atmospheric, helpful, and concise.'
      }
    }, '青樽看板娘');
    s.characters.push(character);
    const chat = createChat(character.id, '默认测试线');
    s.chats.push(chat);
    const first = createMessage(chat.id, null, 'assistant', character.firstMessage || '欢迎。');
    s.messages.push(first);
    chat.activeLeafId = first.id;
    s.ui.activeCharacterId = character.id;
    s.ui.activeChatId = chat.id;
    return s;
  }

  function getTheme(id = state.settings.theme) {
    return THEMES.find((theme) => theme.id === id) || THEMES[0];
  }

  function applyTheme() {
    document.body.className = '';
    const theme = getTheme();
    if (theme.css) document.body.classList.add(theme.css);
  }

  function getActiveCharacter() {
    return state.characters.find((character) => character.id === state.ui.activeCharacterId) || null;
  }

  function getActiveChat() {
    return state.chats.find((chat) => chat.id === state.ui.activeChatId) || null;
  }

  function getChatsForCharacter(characterId) {
    return state.chats
      .filter((chat) => chat.characterId === characterId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function getMessagesForChat(chatId, includeDeleted = false) {
    return state.messages
      .filter((message) => message.chatId === chatId && (includeDeleted || !message.deleted))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function getMessage(id) {
    return state.messages.find((message) => message.id === id) || null;
  }

  function getChildren(chatId, parentId, includeDeleted = false) {
    return state.messages
      .filter((message) => message.chatId === chatId && message.parentId === parentId && (includeDeleted || !message.deleted))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function getActivePath(chat = getActiveChat()) {
    if (!chat || !chat.activeLeafId) return [];
    const byId = new Map(getMessagesForChat(chat.id, true).map((message) => [message.id, message]));
    const path = [];
    let cursor = byId.get(chat.activeLeafId);
    const guard = new Set();
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      if (!cursor.deleted) path.push(cursor);
      cursor = byId.get(cursor.parentId);
    }
    return path.reverse();
  }

  function deepestLeafFrom(chatId, startId) {
    let cursor = getMessage(startId);
    if (!cursor || cursor.deleted) return null;
    while (true) {
      const children = getChildren(chatId, cursor.id).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
      if (!children.length) return cursor.id;
      cursor = children[0];
    }
  }

  function normalizeCard(raw, fallbackName = '未命名角色') {
    const source = raw && typeof raw === 'object' ? raw : {};
    const data = source.data && typeof source.data === 'object' ? source.data : source;
    const name = data.name || source.name || data.char_name || data.title || fallbackName;
    const description = data.description || data.char_persona || data.persona || data.definition || data.short_description || '';
    const personality = data.personality || data.personality_summary || data.traits || '';
    const scenario = data.scenario || data.world_scenario || data.context || '';
    const firstMessage = data.first_mes || data.first_message || data.greeting || data.initial_message || data.firstMessage || '';
    const exampleDialogue = data.mes_example || data.example_dialogue || data.example_dialogues || data.dialogue_examples || '';
    const systemPrompt = data.system_prompt || data.systemPrompt || data.system || source.system_prompt || '';
    const creatorNotes = data.creator_notes || data.creatorcomment || source.creator_notes || '';
    const tags = Array.isArray(data.tags) ? data.tags : String(data.tags || '').split(',').map((x) => x.trim()).filter(Boolean);

    return {
      id: uid('char'),
      name: String(name || fallbackName).trim() || fallbackName,
      description: String(description || ''),
      personality: String(personality || ''),
      scenario: String(scenario || ''),
      firstMessage: String(firstMessage || ''),
      exampleDialogue: Array.isArray(exampleDialogue) ? exampleDialogue.join('\n') : String(exampleDialogue || ''),
      systemPrompt: String(systemPrompt || ''),
      creatorNotes: String(creatorNotes || ''),
      tags,
      avatarDataUrl: data.avatar || data.image || source.avatar || '',
      backgroundDataUrl: data.background || data.backgroundDataUrl || '',
      rawCard: source,
      cardFormat: source.spec || source.type || 'unknown',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function createChat(characterId, title = '') {
    const stamp = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return {
      id: uid('chat'),
      characterId,
      title: title || `聊天 ${stamp}`,
      activeLeafId: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function createMessage(chatId, parentId, role, content, meta = {}) {
    return {
      id: uid('msg'),
      chatId,
      parentId,
      role,
      content: String(content || ''),
      meta,
      deleted: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function render() {
    applyTheme();
    renderCharacters();
    renderTopbar();
    renderChatStrip();
    renderMessages();
    renderThemeGrid();
    renderSettingsFields();
    syncKeyboardInsets();
  }

  function renderCharacters() {
    if (!state.characters.length) {
      els.characterList.innerHTML = '<div class="hint">暂无角色。你可以新建角色，或导入 Tavern / SillyTavern 角色卡。</div>';
      return;
    }
    els.characterList.innerHTML = state.characters.map((character) => {
      const chats = getChatsForCharacter(character.id);
      const avatar = character.avatarDataUrl
        ? `<img src="${character.avatarDataUrl}" class="avatar" alt="" />`
        : `<div class="avatar">${escapeHtml(initials(character.name))}</div>`;
      return `<article class="character-item ${character.id === state.ui.activeCharacterId ? 'active' : ''}" data-character-id="${character.id}">
        ${avatar}
        <div>
          <h3>${escapeHtml(character.name)}</h3>
          <p>${escapeHtml(chats.length)} 条聊天 · ${escapeHtml(shortText(character.description || character.personality || '未填写描述'))}</p>
        </div>
        <button class="icon-button" data-action="quick-new-chat" data-character-id="${character.id}" title="新聊天">＋</button>
      </article>`;
    }).join('');
  }

  function renderTopbar() {
    const character = getActiveCharacter();
    const chat = getActiveChat();
    if (!character) {
      els.topbarCharacter.innerHTML = '<div class="topbar-title">青樽 AI</div><div class="topbar-subtitle">本地角色酒馆</div>';
      els.editCharacterBtn.disabled = true;
      els.newChatBtn.disabled = true;
      els.composer.hidden = true;
      els.emptyState.hidden = false;
      els.chatWorkspace.hidden = true;
      document.documentElement.style.setProperty('--chat-bg-image', 'none');
      return;
    }
    els.editCharacterBtn.disabled = false;
    els.newChatBtn.disabled = false;
    els.topbarCharacter.innerHTML = `<div class="topbar-title">${escapeHtml(character.name)}</div><div class="topbar-subtitle">${escapeHtml(chat ? chat.title : '未选择聊天记录')}</div>`;
    els.composer.hidden = !chat;
    els.emptyState.hidden = !!chat;
    els.chatWorkspace.hidden = !chat;
    const bg = character.backgroundDataUrl ? `url("${character.backgroundDataUrl}")` : 'none';
    document.documentElement.style.setProperty('--chat-bg-image', bg);
  }

  function renderChatStrip() {
    const character = getActiveCharacter();
    if (!character) {
      els.chatStrip.innerHTML = '';
      return;
    }
    const chats = getChatsForCharacter(character.id);
    if (!chats.length) {
      els.chatStrip.innerHTML = '<span class="hint">还没有聊天记录。</span>';
      return;
    }
    els.chatStrip.innerHTML = chats.map((chat) => `<button class="chat-pill ${chat.id === state.ui.activeChatId ? 'active' : ''}" data-chat-id="${chat.id}">${escapeHtml(chat.title)}</button>`).join('');
  }

  function renderMessages() {
    const chat = getActiveChat();
    const character = getActiveCharacter();
    els.suggestionBar.hidden = true;
    els.suggestionBar.innerHTML = '';
    if (!chat || !character) {
      els.messagesScroll.innerHTML = '';
      return;
    }
    const path = getActivePath(chat);
    if (!path.length) {
      els.messagesScroll.innerHTML = `<div class="empty-state"><div class="empty-illustration">☾</div><h2>${escapeHtml(character.name)} 正在等待开场</h2><p>点击“继续”让角色先说话，或直接输入你的第一句。</p></div>`;
      return;
    }
    const items = ['<div class="dayline">当前分支 · 可在消息下方切换兄弟分支</div>'];
    for (const message of path) {
      items.push(renderMessage(message, character, chat));
    }
    els.messagesScroll.innerHTML = items.join('');
    requestAnimationFrame(() => {
      els.messagesScroll.scrollTop = els.messagesScroll.scrollHeight;
    });
  }

  function renderMessage(message, character, chat) {
    const isUser = message.role === 'user';
    const avatar = isUser
      ? `<div class="avatar">${escapeHtml(initials(state.settings.userName || '我'))}</div>`
      : (character.avatarDataUrl ? `<img src="${character.avatarDataUrl}" class="avatar" alt="" />` : `<div class="avatar">${escapeHtml(initials(character.name))}</div>`);
    const siblings = getChildren(chat.id, message.parentId);
    const branchSwitcher = siblings.length > 1
      ? `<div class="branch-switcher">${siblings.map((sibling, index) => `<button class="${sibling.id === message.id ? 'active-branch' : ''}" data-action="switch-branch" data-message-id="${sibling.id}">分支 ${index + 1}</button>`).join('')}</div>`
      : '';
    const branchCount = getChildren(chat.id, message.id).length;
    return `<article class="message ${isUser ? 'user' : 'assistant'}" data-message-id="${message.id}">
      ${avatar}
      <div class="bubble-wrap">
        <div class="bubble">${escapeHtml(message.content)}</div>
        ${branchSwitcher}
        <div class="message-tools">
          <button data-action="edit-message" data-message-id="${message.id}">直接编辑</button>
          <button data-action="fork-edit-message" data-message-id="${message.id}">编辑为新分支</button>
          <button data-action="fork-from-message" data-message-id="${message.id}">从此继续</button>
          <button data-action="delete-message" data-message-id="${message.id}" class="danger">删除</button>
          ${branchCount ? `<span class="hint">下游 ${branchCount} 分支</span>` : ''}
        </div>
      </div>
    </article>`;
  }

  function renderThemeGrid() {
    if (!els.themeGrid) return;
    els.themeGrid.innerHTML = THEMES.map((theme) => `
      <button class="theme-card ${theme.id === state.settings.theme ? 'active' : ''}" data-theme-id="${theme.id}">
        <span class="theme-preview" style="background: linear-gradient(135deg, ${theme.colors.join(',')})"></span>
        <strong>${escapeHtml(theme.label)}</strong>
        <span class="hint">一键切换</span>
      </button>
    `).join('');
  }

  function getActiveApiProfile() {
    return state.settings.apiProfiles.find((profile) => profile.id === state.settings.activeApiProfileId) || state.settings.apiProfiles[0];
  }

  function renderSettingsFields() {
    if (!els.apiProfileSelect) return;
    const active = getActiveApiProfile();
    els.apiProfileSelect.innerHTML = state.settings.apiProfiles.map((profile) => `<option value="${profile.id}" ${profile.id === active.id ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`).join('');
    els.apiName.value = active.name || '';
    els.apiType.value = active.type || 'openai';
    els.apiModel.value = active.model || '';
    els.apiEndpoint.value = active.endpoint || '';
    els.apiKey.value = active.apiKey || '';
    els.apiHeaders.value = active.headers || '';
    els.apiTemperature.value = Number.isFinite(Number(active.temperature)) ? active.temperature : 0.85;
    els.apiMaxTokens.value = Number.isFinite(Number(active.maxTokens)) ? active.maxTokens : 800;
    els.apiBodyTemplate.value = active.bodyTemplate || DEFAULT_BODY_TEMPLATE;
    els.apiResponsePath.value = active.responsePath || 'choices.0.message.content';
    els.userName.value = state.settings.userName || '';
    els.contextLimit.value = state.settings.contextLimit || 24;
    els.globalSystemPrompt.value = state.settings.globalSystemPrompt || '';
  }

  function setBusy(nextBusy, label = '') {
    busy = nextBusy;
    els.sendBtn.disabled = nextBusy;
    els.suggestBtn.disabled = nextBusy;
    els.continueBtn.disabled = nextBusy;
    els.testApiBtn.disabled = nextBusy;
    if (label) toast(label);
  }

  function selectCharacter(characterId) {
    const character = state.characters.find((item) => item.id === characterId);
    if (!character) return;
    state.ui.activeCharacterId = character.id;
    const chats = getChatsForCharacter(character.id);
    if (!chats.find((chat) => chat.id === state.ui.activeChatId)) {
      state.ui.activeChatId = chats[0]?.id || null;
    }
    els.sidebar.classList.remove('open');
    scheduleSave();
    render();
  }

  function selectChat(chatId) {
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return;
    state.ui.activeChatId = chat.id;
    state.ui.activeCharacterId = chat.characterId;
    chat.updatedAt = nowIso();
    scheduleSave();
    render();
  }

  function fillCharacterModal(character = null) {
    const target = character || normalizeCard({}, '新角色');
    els.characterModal.dataset.editingId = character ? character.id : '';
    els.characterModalTitle.textContent = character ? '编辑角色卡' : '新建角色卡';
    els.charName.value = target.name || '';
    els.charTags.value = (target.tags || []).join(', ');
    els.charDescription.value = target.description || '';
    els.charPersonality.value = target.personality || '';
    els.charScenario.value = target.scenario || '';
    els.charFirstMessage.value = target.firstMessage || '';
    els.charExample.value = target.exampleDialogue || '';
    els.charSystemPrompt.value = target.systemPrompt || '';
    openModal('characterModal');
  }

  function saveCharacterFromModal() {
    const editingId = els.characterModal.dataset.editingId;
    let character = editingId ? state.characters.find((item) => item.id === editingId) : null;
    const isNew = !character;
    if (!character) character = normalizeCard({}, '新角色');
    character.name = els.charName.value.trim() || '未命名角色';
    character.tags = els.charTags.value.split(',').map((tag) => tag.trim()).filter(Boolean);
    character.description = els.charDescription.value;
    character.personality = els.charPersonality.value;
    character.scenario = els.charScenario.value;
    character.firstMessage = els.charFirstMessage.value;
    character.exampleDialogue = els.charExample.value;
    character.systemPrompt = els.charSystemPrompt.value;
    character.updatedAt = nowIso();
    if (isNew) {
      state.characters.push(character);
      const chat = createChat(character.id, '初始聊天');
      state.chats.push(chat);
      if (character.firstMessage) {
        const first = createMessage(chat.id, null, 'assistant', character.firstMessage);
        state.messages.push(first);
        chat.activeLeafId = first.id;
      }
      state.ui.activeCharacterId = character.id;
      state.ui.activeChatId = chat.id;
    }
    closeModal('characterModal');
    scheduleSave();
    render();
    toast('角色卡已保存');
  }

  async function setCharacterAsset(kind, file) {
    const character = getActiveCharacter();
    if (!character || !file) return;
    const dataUrl = await fileToDataUrl(file);
    if (kind === 'avatar') character.avatarDataUrl = dataUrl;
    if (kind === 'background') character.backgroundDataUrl = dataUrl;
    character.updatedAt = nowIso();
    scheduleSave();
    render();
    toast(kind === 'avatar' ? '头像已更新' : '聊天背景已更新');
  }

  function createNewChatForCharacter(characterId, title = '') {
    const character = state.characters.find((item) => item.id === characterId);
    if (!character) return null;
    const chat = createChat(character.id, title || `${character.name} · 新线`);
    state.chats.push(chat);
    if (character.firstMessage) {
      const first = createMessage(chat.id, null, 'assistant', character.firstMessage);
      state.messages.push(first);
      chat.activeLeafId = first.id;
    }
    state.ui.activeCharacterId = character.id;
    state.ui.activeChatId = chat.id;
    scheduleSave();
    render();
    return chat;
  }

  function updateChatTimestamp(chat = getActiveChat()) {
    if (chat) chat.updatedAt = nowIso();
  }

  async function sendUserMessage() {
    if (busy) return;
    const chat = getActiveChat();
    if (!chat) return toast('请先选择或创建聊天记录', 'error');
    const content = els.userInput.value.trim();
    if (!content) return;
    const parentId = chat.activeLeafId || null;
    const userMessage = createMessage(chat.id, parentId, 'user', content);
    state.messages.push(userMessage);
    chat.activeLeafId = userMessage.id;
    updateChatTimestamp(chat);
    els.userInput.value = '';
    autoresizeInput();
    scheduleSave();
    render();
    await generateAssistantReply('reply');
  }

  async function generateAssistantReply(mode = 'reply') {
    if (busy) return;
    const chat = getActiveChat();
    if (!chat) return;
    const character = getActiveCharacter();
    if (!character) return;
    const profile = getActiveApiProfile();
    if (!profile?.endpoint) return toast('请先在设置里填写 API Endpoint', 'error');
    try {
      setBusy(true, mode === 'continue' ? '正在继续推进剧情……' : '正在生成角色回复……');
      const context = buildApiMessages({ mode });
      const content = await callTextApi(context, profile);
      const assistantMessage = createMessage(chat.id, chat.activeLeafId || null, 'assistant', content, { apiProfileId: profile.id, mode });
      state.messages.push(assistantMessage);
      chat.activeLeafId = assistantMessage.id;
      updateChatTimestamp(chat);
      scheduleSave();
      render();
    } catch (error) {
      console.error(error);
      toast(error.message || String(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function generateSuggestions() {
    if (busy) return;
    const chat = getActiveChat();
    if (!chat) return;
    const profile = getActiveApiProfile();
    if (!profile?.endpoint) return toast('请先在设置里填写 API Endpoint', 'error');
    try {
      setBusy(true, '正在生成三条推荐回复……');
      const messages = buildApiMessages({ mode: 'suggest' });
      messages.push({
        role: 'user',
        content: '请站在玩家/用户视角，基于当前剧情提供三条可直接发送的中文回复。只返回 JSON 数组，数组内必须是 3 个字符串，不要解释。'
      });
      const raw = await callTextApi(messages, profile);
      const suggestions = parseSuggestions(raw);
      if (!suggestions.length) throw new Error('模型没有返回可解析的三条回复。');
      renderSuggestions(suggestions);
    } catch (error) {
      console.error(error);
      toast(error.message || String(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function renderSuggestions(suggestions) {
    els.suggestionBar.hidden = false;
    els.suggestionBar.innerHTML = suggestions.map((text) => `<button class="suggestion-chip" data-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('');
    els.suggestionBar.scrollIntoView({ block: 'nearest' });
  }

  function parseSuggestions(raw) {
    const direct = safeJsonParse(raw, null);
    if (Array.isArray(direct)) return direct.map(String).slice(0, 3);
    const match = String(raw).match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = safeJsonParse(match[0], null);
      if (Array.isArray(parsed)) return parsed.map(String).slice(0, 3);
    }
    return String(raw)
      .split(/\n+/)
      .map((line) => line.replace(/^[-*\d.、\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  function buildCharacterSystemPrompt(character) {
    const lines = [];
    if (state.settings.globalSystemPrompt) lines.push(state.settings.globalSystemPrompt);
    lines.push(`You are roleplaying as {{char}}. {{char}} = ${character.name}. The user/player is {{user}} = ${state.settings.userName || 'User'}.`);
    if (character.systemPrompt) lines.push(`Character system prompt:\n${character.systemPrompt}`);
    if (character.description) lines.push(`Description:\n${character.description}`);
    if (character.personality) lines.push(`Personality:\n${character.personality}`);
    if (character.scenario) lines.push(`Scenario:\n${character.scenario}`);
    if (character.exampleDialogue) lines.push(`Example dialogue:\n${character.exampleDialogue}`);
    lines.push('Continue the scene naturally. Do not speak for the user unless asked. Keep continuity with the selected branch only.');
    return replaceMacros(lines.join('\n\n'), character);
  }

  function buildApiMessages({ mode = 'reply' } = {}) {
    const chat = getActiveChat();
    const character = getActiveCharacter();
    const path = getActivePath(chat);
    const max = Math.max(4, Number(state.settings.contextLimit || 24));
    const trimmedPath = path.slice(-max);
    const messages = [{ role: 'system', content: buildCharacterSystemPrompt(character) }];
    for (const message of trimmedPath) {
      messages.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: replaceMacros(message.content, character) });
    }
    if (mode === 'continue') {
      messages.push({
        role: 'user',
        content: '请不等待玩家输入，沿着当前分支自然继续推进剧情。不要重复上一条消息，不要总结，不要跳出角色。'
      });
    }
    return messages;
  }

  function replaceMacros(text, character = getActiveCharacter()) {
    return String(text || '')
      .replaceAll('{{char}}', character?.name || 'Character')
      .replaceAll('{{user}}', state.settings.userName || 'User')
      .replaceAll('<START>', '');
  }

  async function callTextApi(messages, profile) {
    const req = buildHttpRequest(messages, profile);
    const response = await httpRequest(req);
    if (!response.ok) {
      throw new Error(`API 请求失败：HTTP ${response.status}\n${shortText(response.text, 600)}`);
    }
    const json = safeJsonParse(response.text, null);
    if (!json) return response.text.trim();
    const value = getByPath(json, profile.responsePath || 'choices.0.message.content')
      ?? getByPath(json, 'choices.0.message.content')
      ?? getByPath(json, 'choices.0.text')
      ?? getByPath(json, 'message.content')
      ?? getByPath(json, 'content')
      ?? getByPath(json, 'response')
      ?? getByPath(json, 'output_text');
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
    if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
    if (!value) throw new Error(`无法从响应中提取文本。请检查响应路径：${profile.responsePath || '(未设置)'}`);
    return String(value).trim();
  }

  function buildHttpRequest(messages, profile) {
    const headers = { 'Content-Type': 'application/json' };
    if (profile.apiKey) headers.Authorization = `Bearer ${profile.apiKey}`;
    const extra = safeJsonParse(profile.headers || '{}', {});
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) Object.assign(headers, extra);

    let body;
    if ((profile.type || 'openai') === 'custom') {
      body = renderTemplate(profile.bodyTemplate || DEFAULT_BODY_TEMPLATE, {
        model: profile.model || '',
        messages,
        temperature: Number(profile.temperature ?? 0.85),
        maxTokens: Number(profile.maxTokens ?? 800),
        prompt: messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n')
      });
    } else {
      body = JSON.stringify({
        model: profile.model || 'your-model-name',
        messages,
        temperature: Number(profile.temperature ?? 0.85),
        max_tokens: Number(profile.maxTokens ?? 800)
      });
    }
    return { method: 'POST', url: profile.endpoint, headers, body };
  }

  function renderTemplate(template, vars) {
    const replacements = {
      model: JSON.stringify(vars.model).slice(1, -1),
      messagesJson: JSON.stringify(vars.messages),
      promptJson: JSON.stringify(vars.prompt),
      prompt: JSON.stringify(vars.prompt).slice(1, -1),
      temperature: String(vars.temperature),
      maxTokens: String(vars.maxTokens)
    };
    return String(template || '').replace(/{{\s*(model|messagesJson|promptJson|prompt|temperature|maxTokens)\s*}}/g, (_, key) => replacements[key] ?? '');
  }

  function getByPath(object, path) {
    if (!path) return undefined;
    return String(path).split('.').reduce((acc, part) => {
      if (acc == null) return undefined;
      const key = /^\d+$/.test(part) ? Number(part) : part;
      return acc[key];
    }, object);
  }

  async function httpRequest(req) {
    if (window.QingTavernNative && typeof window.QingTavernNative.request === 'function') {
      return nativeHttpRequest(req);
    }
    const response = await fetch(req.url, {
      method: req.method || 'POST',
      headers: req.headers || {},
      body: req.body || undefined
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  }

  function nativeHttpRequest(req) {
    return new Promise((resolve, reject) => {
      const callbackId = uid('native-cb');
      window.__nativeHttpCallbacks = window.__nativeHttpCallbacks || {};
      window.__nativeHttpCallbacks[callbackId] = (payload) => {
        delete window.__nativeHttpCallbacks[callbackId];
        const result = typeof payload === 'string' ? safeJsonParse(payload, null) : payload;
        if (!result) return reject(new Error('NativeBridge 返回了无效响应'));
        resolve(result);
      };
      try {
        window.QingTavernNative.request(JSON.stringify(req), callbackId);
      } catch (error) {
        delete window.__nativeHttpCallbacks[callbackId];
        reject(error);
      }
      setTimeout(() => {
        if (window.__nativeHttpCallbacks?.[callbackId]) {
          delete window.__nativeHttpCallbacks[callbackId];
          reject(new Error('NativeBridge 请求超时'));
        }
      }, 120000);
    });
  }

  window.__nativeHttpCallback = (callbackId, payload) => {
    const callback = window.__nativeHttpCallbacks?.[callbackId];
    if (callback) callback(payload);
  };

  async function handleImportFiles(files) {
    const list = [...files];
    if (!list.length) return;
    let imported = 0;
    for (const file of list) {
      try {
        const result = await characterFromFile(file);
        if (result.manual) {
          currentManualImport = result;
          els.manualName.value = result.name || file.name.replace(/\.[^.]+$/, '');
          els.manualDescription.value = result.description || '';
          els.manualRaw.value = result.rawText || '';
          openModal('manualImportModal');
          continue;
        }
        addImportedCharacter(result.character);
        imported += 1;
      } catch (error) {
        console.error(error);
        toast(`${file.name} 导入失败：${error.message || error}`, 'error');
      }
    }
    if (imported) {
      scheduleSave();
      render();
      toast(`已导入 ${imported} 张角色卡`);
    }
    els.cardImportInput.value = '';
  }

  function addImportedCharacter(character) {
    state.characters.push(character);
    const chat = createChat(character.id, '导入初始线');
    state.chats.push(chat);
    if (character.firstMessage) {
      const first = createMessage(chat.id, null, 'assistant', character.firstMessage);
      state.messages.push(first);
      chat.activeLeafId = first.id;
    }
    state.ui.activeCharacterId = character.id;
    state.ui.activeChatId = chat.id;
  }

  async function characterFromFile(file) {
    const name = file.name.replace(/\.[^.]+$/, '') || '导入角色';
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'zip' || ext === 'charx') {
      const entries = await unzipCardEntries(await file.arrayBuffer());
      const preferred = entries.find((entry) => /\.(json|png|yaml|yml|txt|md)$/i.test(entry.name));
      if (!preferred) throw new Error('压缩包内未找到可识别的角色卡文件');
      const virtualFile = new File([preferred.blob], preferred.name, { type: preferred.type || '' });
      return characterFromFile(virtualFile);
    }

    if (file.type === 'image/png' || ext === 'png') {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = parsePngCharacterCard(arrayBuffer);
      const avatarDataUrl = await fileToDataUrl(file);
      if (parsed) {
        const character = normalizeCard(parsed, name);
        character.avatarDataUrl = character.avatarDataUrl || avatarDataUrl;
        character.cardFormat = parsed.spec || 'png-chara';
        return { character };
      }
      const character = normalizeCard({ name, description: 'PNG 未检测到内嵌角色卡数据，已作为头像导入。' }, name);
      character.avatarDataUrl = avatarDataUrl;
      return { character };
    }

    if (file.type.startsWith('image/') || ext === 'webp') {
      const avatarDataUrl = await fileToDataUrl(file);
      const character = normalizeCard({ name, description: '图片未检测到可解析的角色卡元数据，已作为头像导入。' }, name);
      character.avatarDataUrl = avatarDataUrl;
      return { character };
    }

    const text = await file.text();
    if (ext === 'json' || looksLikeJson(text)) {
      const raw = safeJsonParse(text, null);
      if (!raw) throw new Error('JSON 无法解析');
      return { character: normalizeCard(raw, name) };
    }

    if (ext === 'yaml' || ext === 'yml') {
      const raw = parseLooseYaml(text);
      return { character: normalizeCard(raw, name) };
    }

    if (ext === 'txt' || ext === 'md') {
      return {
        manual: true,
        name,
        description: text.slice(0, 3000),
        rawText: text
      };
    }

    const raw = safeJsonParse(text, null);
    if (raw) return { character: normalizeCard(raw, name) };
    return { manual: true, name, description: '', rawText: text.slice(0, 20000) };
  }

  function looksLikeJson(text) {
    const clean = String(text || '').trim();
    return clean.startsWith('{') || clean.startsWith('[');
  }

  function parseLooseYaml(text) {
    const result = {};
    const lines = String(text || '').split(/\r?\n/);
    let blockKey = null;
    let block = [];
    function flushBlock() {
      if (blockKey) result[blockKey] = block.join('\n').trimEnd();
      blockKey = null;
      block = [];
    }
    for (const line of lines) {
      const blockMatch = line.match(/^([A-Za-z0-9_ -]+):\s*[>|]\s*$/);
      if (blockMatch) {
        flushBlock();
        blockKey = blockMatch[1].trim().replace(/\s+/g, '_');
        continue;
      }
      if (blockKey) {
        if (/^\S[^:]*:\s*/.test(line)) {
          flushBlock();
        } else {
          block.push(line.replace(/^\s{2,}/, ''));
          continue;
        }
      }
      const match = line.match(/^([A-Za-z0-9_ -]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim().replace(/\s+/g, '_');
        let value = match[2].trim();
        value = value.replace(/^['"]|['"]$/g, '');
        if (value.startsWith('[') && value.endsWith(']')) result[key] = value.slice(1, -1).split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        else result[key] = value;
      }
    }
    flushBlock();
    return result;
  }

  function parsePngCharacterCard(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!sig.every((value, index) => bytes[index] === value)) return null;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = readU32(bytes, offset); offset += 4;
      const type = latin1(bytes.slice(offset, offset + 4)); offset += 4;
      const data = bytes.slice(offset, offset + length); offset += length + 4;
      if (type === 'tEXt') {
        const zero = data.indexOf(0);
        if (zero > -1) {
          const keyword = latin1(data.slice(0, zero));
          const value = latin1(data.slice(zero + 1));
          const parsed = parseCardPayload(keyword, value);
          if (parsed) return parsed;
        }
      }
      if (type === 'iTXt') {
        const parsed = parseITXt(data);
        if (parsed) {
          const card = parseCardPayload(parsed.keyword, parsed.text);
          if (card) return card;
        }
      }
      if (type === 'IEND') break;
    }
    return null;
  }

  function parseITXt(data) {
    let cursor = 0;
    const readNullTerminated = () => {
      const start = cursor;
      while (cursor < data.length && data[cursor] !== 0) cursor += 1;
      const out = utf8(data.slice(start, cursor));
      cursor += 1;
      return out;
    };
    const keyword = readNullTerminated();
    const compressionFlag = data[cursor++];
    cursor += 1; // compression method
    readNullTerminated(); // language tag
    readNullTerminated(); // translated keyword
    if (compressionFlag) return null;
    return { keyword, text: utf8(data.slice(cursor)) };
  }

  function parseCardPayload(keyword, value) {
    const key = String(keyword || '').toLowerCase();
    if (!['chara', 'ccv2', 'ccv3', 'card', 'character'].some((token) => key.includes(token))) return null;
    const candidates = [String(value || '').trim()];
    try { candidates.push(base64ToUtf8(candidates[0])); } catch (_) {}
    for (const candidate of candidates) {
      const parsed = safeJsonParse(candidate, null);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    return null;
  }

  function readU32(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function readU16LE(view, offset) {
    return view.getUint16(offset, true);
  }

  function readU32LE(view, offset) {
    return view.getUint32(offset, true);
  }

  function latin1(bytes) {
    return [...bytes].map((byte) => String.fromCharCode(byte)).join('');
  }

  function utf8(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function base64ToUtf8(value) {
    const binary = atob(String(value).replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return utf8(bytes);
  }

  async function unzipCardEntries(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
      if (readU32LE(view, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是标准 ZIP/CHARX 文件');
    const entriesTotal = readU16LE(view, eocd + 10);
    let cdOffset = readU32LE(view, eocd + 16);
    const entries = [];
    for (let i = 0; i < entriesTotal; i++) {
      if (readU32LE(view, cdOffset) !== 0x02014b50) break;
      const method = readU16LE(view, cdOffset + 10);
      const compressedSize = readU32LE(view, cdOffset + 20);
      const fileNameLength = readU16LE(view, cdOffset + 28);
      const extraLength = readU16LE(view, cdOffset + 30);
      const commentLength = readU16LE(view, cdOffset + 32);
      const localOffset = readU32LE(view, cdOffset + 42);
      const name = utf8(bytes.slice(cdOffset + 46, cdOffset + 46 + fileNameLength));
      cdOffset += 46 + fileNameLength + extraLength + commentLength;
      if (name.endsWith('/')) continue;
      if (readU32LE(view, localOffset) !== 0x04034b50) continue;
      const localNameLength = readU16LE(view, localOffset + 26);
      const localExtraLength = readU16LE(view, localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) data = await inflateRaw(compressed);
      else continue;
      entries.push({ name, blob: new Blob([data]), type: guessMime(name) });
    }
    return entries;
  }

  async function inflateRaw(bytes) {
    if (!('DecompressionStream' in window)) throw new Error('当前浏览器不支持 ZIP Deflate 解压，请先解压后导入里面的 JSON/PNG');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function guessMime(name) {
    const ext = name.toLowerCase().split('.').pop();
    if (ext === 'json') return 'application/json';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'yaml' || ext === 'yml') return 'text/yaml';
    return 'text/plain';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function downloadText(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCharacter(character = getActiveCharacter()) {
    if (!character) return;
    const payload = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: character.name,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        first_mes: character.firstMessage,
        mes_example: character.exampleDialogue,
        system_prompt: character.systemPrompt,
        creator_notes: character.creatorNotes,
        tags: character.tags,
        extensions: {
          qing_tavern: {
            exported_at: nowIso(),
            backgroundDataUrl: character.backgroundDataUrl || ''
          }
        }
      }
    };
    downloadText(`${safeFilename(character.name)}.json`, JSON.stringify(payload, null, 2));
  }

  function safeFilename(name) {
    return String(name || 'character').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  }

  function saveApiFromFields() {
    const profile = getActiveApiProfile();
    if (!profile) return;
    profile.name = els.apiName.value.trim() || '未命名接口';
    profile.type = els.apiType.value;
    profile.model = els.apiModel.value.trim();
    profile.endpoint = els.apiEndpoint.value.trim();
    profile.apiKey = els.apiKey.value;
    profile.headers = els.apiHeaders.value.trim();
    profile.temperature = Number(els.apiTemperature.value || 0.85);
    profile.maxTokens = Number(els.apiMaxTokens.value || 800);
    profile.bodyTemplate = els.apiBodyTemplate.value || DEFAULT_BODY_TEMPLATE;
    profile.responsePath = els.apiResponsePath.value.trim() || 'choices.0.message.content';
    state.settings.activeApiProfileId = profile.id;
    scheduleSave();
    render();
    toast('API 设置已保存');
  }

  async function testApi() {
    if (busy) return;
    saveApiFromFields();
    const profile = getActiveApiProfile();
    try {
      setBusy(true, '正在测试 API……');
      const text = await callTextApi([
        { role: 'system', content: 'You are a connectivity test.' },
        { role: 'user', content: 'Reply with one short sentence: OK.' }
      ], profile);
      toast(`测试成功：${shortText(text, 120)}`);
    } catch (error) {
      console.error(error);
      toast(error.message || String(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function saveGeneralSettings() {
    state.settings.userName = els.userName.value.trim() || 'User';
    state.settings.contextLimit = Number(els.contextLimit.value || 24);
    state.settings.globalSystemPrompt = els.globalSystemPrompt.value || '';
    scheduleSave();
    render();
    toast('聊天设置已保存');
  }

  function forkFromMessage(messageId) {
    const chat = getActiveChat();
    const message = getMessage(messageId);
    if (!chat || !message || message.chatId !== chat.id) return;
    chat.activeLeafId = message.id;
    updateChatTimestamp(chat);
    scheduleSave();
    render();
    els.userInput.focus();
    toast('已定位到该消息。下一次发送会从这里开新分支。');
  }

  function editMessage(messageId, asFork = false) {
    const chat = getActiveChat();
    const message = getMessage(messageId);
    if (!chat || !message) return;
    const next = prompt(asFork ? '输入新分支消息内容：' : '编辑消息内容：', message.content);
    if (next == null) return;
    if (asFork) {
      const fork = createMessage(chat.id, message.parentId || null, message.role, next, { forkedFrom: message.id });
      state.messages.push(fork);
      chat.activeLeafId = fork.id;
    } else {
      message.content = next;
      message.updatedAt = nowIso();
    }
    updateChatTimestamp(chat);
    scheduleSave();
    render();
  }

  function deleteMessage(messageId) {
    const chat = getActiveChat();
    const message = getMessage(messageId);
    if (!chat || !message) return;
    if (!confirm('确定删除这条消息？下游分支不会被物理清除，但当前路径会回退到上一条。')) return;
    message.deleted = true;
    message.updatedAt = nowIso();
    const pathIds = getActivePath(chat).map((item) => item.id);
    if (chat.activeLeafId === message.id || pathIds.includes(message.id)) {
      chat.activeLeafId = message.parentId || null;
    }
    updateChatTimestamp(chat);
    scheduleSave();
    render();
  }

  function switchBranch(messageId) {
    const chat = getActiveChat();
    if (!chat) return;
    const leaf = deepestLeafFrom(chat.id, messageId);
    if (!leaf) return;
    chat.activeLeafId = leaf;
    updateChatTimestamp(chat);
    scheduleSave();
    render();
  }

  function autoresizeInput() {
    const input = els.userInput;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    syncKeyboardInsets();
  }

  function syncKeyboardInsets() {
    const vv = window.visualViewport;
    let keyboard = 0;
    if (vv) keyboard = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    document.documentElement.style.setProperty('--keyboard-offset', `${Math.round(keyboard)}px`);
    if (!els.composer.hidden) {
      const height = els.composer.getBoundingClientRect().height;
      els.messagesScroll.style.paddingBottom = `calc(${Math.ceil(height + 26)}px + var(--keyboard-offset))`;
    }
  }

  function bindEvents() {
    els.sidebarToggle.addEventListener('click', () => els.sidebar.classList.toggle('open'));
    els.newCharacterBtn.addEventListener('click', () => fillCharacterModal(null));
    els.importCardBtn.addEventListener('click', () => els.cardImportInput.click());
    els.emptyImportBtn.addEventListener('click', () => els.cardImportInput.click());
    els.cardImportInput.addEventListener('change', (event) => handleImportFiles(event.target.files));
    els.newChatBtn.addEventListener('click', () => {
      if (!getActiveCharacter()) return;
      els.newChatTitle.value = `${getActiveCharacter().name} · 新线`;
      openModal('chatModal');
    });
    els.createChatBtn.addEventListener('click', () => {
      const character = getActiveCharacter();
      if (!character) return;
      createNewChatForCharacter(character.id, els.newChatTitle.value.trim());
      closeModal('chatModal');
    });
    els.editCharacterBtn.addEventListener('click', () => {
      const character = getActiveCharacter();
      if (character) fillCharacterModal(character);
    });
    els.settingsBtn.addEventListener('click', () => { renderSettingsFields(); openModal('settingsModal'); });
    els.saveCharacterBtn.addEventListener('click', saveCharacterFromModal);
    els.avatarBtn.addEventListener('click', () => els.avatarInput.click());
    els.backgroundBtn.addEventListener('click', () => els.backgroundInput.click());
    els.avatarInput.addEventListener('change', (e) => setCharacterAsset('avatar', e.target.files[0]));
    els.backgroundInput.addEventListener('change', (e) => setCharacterAsset('background', e.target.files[0]));
    els.exportCharacterBtn.addEventListener('click', () => exportCharacter());
    els.sendBtn.addEventListener('click', sendUserMessage);
    els.userInput.addEventListener('input', autoresizeInput);
    els.userInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendUserMessage();
      }
    });
    els.suggestBtn.addEventListener('click', generateSuggestions);
    els.continueBtn.addEventListener('click', () => generateAssistantReply('continue'));
    els.forkHereBtn.addEventListener('click', () => {
      const chat = getActiveChat();
      if (!chat) return;
      toast('下一次发送会从当前最后一条消息开新分支。');
      els.userInput.focus();
    });
    els.apiProfileSelect.addEventListener('change', () => {
      state.settings.activeApiProfileId = els.apiProfileSelect.value;
      scheduleSave();
      renderSettingsFields();
    });
    els.newApiProfileBtn.addEventListener('click', () => {
      const profile = {
        ...state.settings.apiProfiles[0],
        id: uid('api'),
        name: '新接口',
        apiKey: '',
        model: '',
        endpoint: '',
        headers: '',
        bodyTemplate: DEFAULT_BODY_TEMPLATE,
        responsePath: 'choices.0.message.content'
      };
      state.settings.apiProfiles.push(profile);
      state.settings.activeApiProfileId = profile.id;
      scheduleSave();
      renderSettingsFields();
    });
    els.deleteApiProfileBtn.addEventListener('click', () => {
      if (state.settings.apiProfiles.length <= 1) return toast('至少保留一个 API 配置', 'error');
      const id = state.settings.activeApiProfileId;
      state.settings.apiProfiles = state.settings.apiProfiles.filter((profile) => profile.id !== id);
      state.settings.activeApiProfileId = state.settings.apiProfiles[0].id;
      scheduleSave();
      renderSettingsFields();
    });
    els.saveApiBtn.addEventListener('click', saveApiFromFields);
    els.testApiBtn.addEventListener('click', testApi);
    els.saveGeneralSettingsBtn.addEventListener('click', saveGeneralSettings);
    els.exportAllBtn.addEventListener('click', () => downloadText(`qing-tavern-backup-${Date.now()}.json`, JSON.stringify(state, null, 2)));
    els.importAllBtn.addEventListener('click', () => els.importAllInput.click());
    els.importAllInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const json = safeJsonParse(await file.text(), null);
      if (!json) return toast('备份 JSON 无法解析', 'error');
      state = migrateState(json);
      await saveState();
      render();
      toast('备份已导入');
    });
    els.saveManualImportBtn.addEventListener('click', () => {
      if (!currentManualImport) return;
      const character = normalizeCard({
        name: els.manualName.value.trim() || currentManualImport.name,
        description: els.manualDescription.value || currentManualImport.rawText,
        creator_notes: currentManualImport.rawText
      }, currentManualImport.name);
      addImportedCharacter(character);
      currentManualImport = null;
      closeModal('manualImportModal');
      scheduleSave();
      render();
      toast('未知格式已按手动映射导入');
    });

    document.addEventListener('click', (event) => {
      const close = event.target.closest('[data-close-modal]');
      if (close) closeModal(close.dataset.closeModal);
      const characterNode = event.target.closest('[data-character-id]');
      if (characterNode && characterNode.classList.contains('character-item')) selectCharacter(characterNode.dataset.characterId);
      const quickNewChat = event.target.closest('[data-action="quick-new-chat"]');
      if (quickNewChat) {
        event.stopPropagation();
        createNewChatForCharacter(quickNewChat.dataset.characterId);
      }
      const chatNode = event.target.closest('[data-chat-id]');
      if (chatNode) selectChat(chatNode.dataset.chatId);
      const themeNode = event.target.closest('[data-theme-id]');
      if (themeNode) {
        state.settings.theme = themeNode.dataset.themeId;
        scheduleSave();
        render();
      }
      const actionNode = event.target.closest('[data-action]');
      if (actionNode) {
        const action = actionNode.dataset.action;
        const messageId = actionNode.dataset.messageId;
        if (action === 'switch-branch') switchBranch(messageId);
        if (action === 'fork-from-message') forkFromMessage(messageId);
        if (action === 'edit-message') editMessage(messageId, false);
        if (action === 'fork-edit-message') editMessage(messageId, true);
        if (action === 'delete-message') deleteMessage(messageId);
      }
      const suggestion = event.target.closest('[data-suggestion]');
      if (suggestion) {
        els.userInput.value = suggestion.dataset.suggestion;
        autoresizeInput();
        els.userInput.focus();
      }
      if (event.target.classList.contains('modal')) event.target.hidden = true;
    });

    window.addEventListener('resize', syncKeyboardInsets);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncKeyboardInsets);
      window.visualViewport.addEventListener('scroll', syncKeyboardInsets);
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  async function init() {
    bindEvents();
    await loadState();
    render();
    autoresizeInput();
  }

  init().catch((error) => {
    console.error(error);
    toast(`初始化失败：${error.message || error}`, 'error');
  });
})();
