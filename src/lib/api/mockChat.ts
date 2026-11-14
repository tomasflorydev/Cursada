import type {
  ChatThread,
  ChatThreadWithMessages,
  CreateChatThreadInput,
  NoteWithCourse,
  SaveChatMessageAsNoteInput,
  SendChatMessageInput,
  SendChatMessageResult,
} from '../../types/domain';

export function resetMockChat(): void {
  // Stage 0 stub — implemented by Agent A
}

export async function mockListChatThreads(_courseId: string): Promise<ChatThread[]> {
  return [];
}

export async function mockGetChatThread(
  _threadId: string
): Promise<ChatThreadWithMessages | null> {
  return null;
}

export async function mockCreateChatThread(
  _input: CreateChatThreadInput
): Promise<ChatThread> {
  throw new Error('mockCreateChatThread not implemented');
}

export async function mockDeleteChatThread(_threadId: string): Promise<void> {
  // Stage 0 stub
}

export async function mockSendChatMessage(
  _input: SendChatMessageInput
): Promise<SendChatMessageResult> {
  throw new Error('mockSendChatMessage not implemented');
}

export async function mockSaveChatMessageAsNote(
  _input: SaveChatMessageAsNoteInput
): Promise<NoteWithCourse> {
  throw new Error('mockSaveChatMessageAsNote not implemented');
}
