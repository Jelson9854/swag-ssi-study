import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
}

export interface Message {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  conversationTitle?: string;
  timestamp?: number;
  metadata?: {
    isError?: boolean;
    errorCode?: string;
    webSearchEnabled?: boolean;
    webSearchUsed?: boolean;
    [key: string]: unknown;
  };
}

interface ChatState {
  // State
  mode: 'live' | 'replay';
  conversations: Conversation[];
  activeConversationId: string | null | 'all';
  messages: Message[];
  input: string;
  isLoading: boolean;
  isCreatingConversation: boolean;
  webSearchEnabled: boolean;

  // Actions
  setMode: (mode: 'live' | 'replay') => void;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversationId: (id: string | null | 'all') => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setInput: (input: string) => void;
  setLoading: (isLoading: boolean) => void;
  setCreatingConversation: (isCreating: boolean) => void;
  toggleWebSearch: () => void;
  reset: () => void;

  // Async Actions
  loadConversations: (sessionId: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  createConversation: (sessionId: string) => Promise<void>;
  updateConversationTitle: (conversationId: string, title: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  sendMessage: (params: {
    conversationId: string;
    sessionId?: string;
    assignmentId?: string;
  }) => Promise<void>;
}

const initialState = {
  mode: 'live' as const,
  conversations: [],
  activeConversationId: null as string | null | 'all',
  messages: [],
  input: '',
  isLoading: false,
  isCreatingConversation: false,
  webSearchEnabled: false,
};

const DEFAULT_CHAT_ERROR_MESSAGE =
  'The AI assistant ran into a problem and could not complete that reply. Please try again.';

interface ChatErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

const createAssistantErrorMessage = (content: string, code?: string): Message => ({
  id: `msg_${Date.now()}_error`,
  role: 'assistant',
  content,
  metadata: {
    isError: true,
    errorCode: code,
  },
});

const getFallbackErrorMessageForStatus = (status: number): string => {
  switch (status) {
    case 400:
      return 'The chat request was invalid. Please try again.';
    case 404:
      return 'The chat assistant configuration could not be found.';
    case 429:
      return 'The AI assistant is temporarily rate limited. Please wait a moment and try again.';
    case 503:
      return 'The AI assistant is temporarily unavailable. Please try again in a moment.';
    default:
      return DEFAULT_CHAT_ERROR_MESSAGE;
  }
};

const readChatErrorResponse = async (response: Response): Promise<{ message: string; code?: string }> => {
  const rawBody = await response.text();

  if (rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as ChatErrorResponse;
      if (parsed.error?.message) {
        return {
          message: parsed.error.message,
          code: parsed.error.code,
        };
      }
    } catch {
      return { message: rawBody.trim() };
    }
  }

  return {
    message: getFallbackErrorMessageForStatus(response.status),
  };
};

const getThrownErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return DEFAULT_CHAT_ERROR_MESSAGE;
};

const getThrownErrorCode = (error: unknown): string | undefined => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return undefined;
};

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Simple actions
      setMode: (mode) => set({ mode }),
      setConversations: (conversations) => set({ conversations }),
      setActiveConversationId: (id) => set({ activeConversationId: id }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      setInput: (input) => set({ input }),
      setLoading: (isLoading) => set({ isLoading }),
      setCreatingConversation: (isCreatingConversation) => set({ isCreatingConversation }),
      toggleWebSearch: () => set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),
      reset: () => set(initialState),

      // Load conversations from API
      loadConversations: async (sessionId: string) => {
        try {
          const response = await fetch('/api/conversations/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });

          if (!response.ok) {
            throw new Error('Failed to load conversations');
          }

          const { conversations: existingConversations } = await response.json();

          if (existingConversations.length > 0) {
            set({
              conversations: existingConversations.map((conv: { id: string; title: string; createdAt: string | number | Date }) => ({
                id: conv.id,
                title: conv.title,
                createdAt: new Date(conv.createdAt),
              })),
              activeConversationId: existingConversations[existingConversations.length - 1].id,
            });
          } else {
            // No existing conversations, create a new one
            await get().createConversation(sessionId);
          }
        } catch (error) {
          console.error('Failed to load conversations:', error);
          // Fallback: create new conversation
          await get().createConversation(sessionId);
        }
      },

      // Load messages for a conversation
      loadMessages: async (conversationId: string) => {
        try {
          const response = await fetch('/api/conversations/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId }),
          });

          if (!response.ok) {
            throw new Error('Failed to load messages');
          }

          const { messages: loadedMessages } = await response.json();
          set({ messages: loadedMessages });
        } catch (error) {
          console.error('Failed to load messages:', error);
        }
      },

      // Create new conversation
      createConversation: async (sessionId: string) => {
        const { isCreatingConversation } = get();
        if (isCreatingConversation) return;

        set({ isCreatingConversation: true });

        try {
          const response = await fetch('/api/conversations/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });

          const { conversationId, title } = await response.json();

          const newConversation: Conversation = {
            id: conversationId,
            title,
            createdAt: new Date(),
          };

          set((state) => ({
            conversations: [...state.conversations, newConversation],
            activeConversationId: conversationId,
            messages: [], // Clear messages for new conversation
          }));
        } catch (error) {
          console.error('Failed to create conversation:', error);
        } finally {
          set({ isCreatingConversation: false });
        }
      },

      // Update conversation title
      updateConversationTitle: async (conversationId: string, title: string) => {
        try {
          await fetch('/api/conversations/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, title }),
          });

          set((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === conversationId ? { ...conv, title } : conv
            ),
          }));
        } catch (error) {
          console.error('Failed to update conversation title:', error);
        }
      },

      // Delete conversation
      deleteConversation: async (conversationId: string) => {
        if (!confirm('Delete this conversation?')) return;

        try {
          await fetch('/api/conversations/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId }),
          });

          const state = get();
          const remaining = state.conversations.filter((conv) => conv.id !== conversationId);

          set({ conversations: remaining });

          // If deleted conversation was active, switch to another or create new
          if (state.activeConversationId === conversationId) {
            if (remaining.length > 0) {
              set({ activeConversationId: remaining[0].id });
              await get().loadMessages(remaining[0].id);
            } else {
              // Will need sessionId passed separately for this
              set({ activeConversationId: null, messages: [] });
            }
          }
        } catch (error) {
          console.error('Failed to delete conversation:', error);
        }
      },

      // Send message with streaming
      sendMessage: async ({ conversationId, sessionId, assignmentId }) => {
        const { input, webSearchEnabled, messages } = get();
        if (!input.trim() || !conversationId) return;

        const userMessage: Message = {
          id: `msg_${Date.now()}`,
          role: 'user',
          content: input.trim(),
        };

        // Add user message immediately
        set((state) => ({
          messages: [...state.messages, userMessage],
          input: '',
          isLoading: true,
        }));

        const assistantMessageId = `msg_${Date.now() + 1}`;
        let assistantContent = '';
        let hasAssistantPlaceholder = false;

        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [...messages, userMessage],
              conversationId,
              sessionId,
              assignmentId,
              webSearchEnabled,
            }),
          });

          if (!response.ok) {
            const { message, code } = await readChatErrorResponse(response);
            const error = new Error(message) as Error & { code?: string };
            error.code = code;
            throw error;
          }

          // Read streaming response
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error('No reader available');
          }

          // Create assistant message placeholder
          hasAssistantPlaceholder = true;

          set((state) => ({
            messages: [
              ...state.messages,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
              },
            ],
          }));

          // Read stream
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            assistantContent += chunk;

            // Update assistant message with accumulated content
            set((state) => ({
              messages: state.messages.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: assistantContent }
                  : msg
              ),
            }));
          }
        } catch (error) {
          console.error('Failed to send message:', error);

          const errorMessage = getThrownErrorMessage(error);
          const errorCode = getThrownErrorCode(error);

          set((state) => {
            if (hasAssistantPlaceholder) {
              if (assistantContent.trim()) {
                return {
                  messages: [
                    ...state.messages,
                    createAssistantErrorMessage(errorMessage, errorCode),
                  ],
                };
              }

              return {
                messages: state.messages.map((msg) =>
                  msg.id === assistantMessageId
                    ? createAssistantErrorMessage(errorMessage, errorCode)
                    : msg
                ),
              };
            }

            return {
              messages: [
                ...state.messages,
                createAssistantErrorMessage(errorMessage, errorCode),
              ],
            };
          });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    { name: 'ChatStore' }
  )
);
