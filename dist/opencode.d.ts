import { Conversation } from './types';
export declare class OpenCodeStorage {
    private storagePath;
    constructor(storagePath: string);
    getConversations(): Promise<Map<string, number>>;
    getConversationData(conversationId: string): Promise<Conversation | null>;
    private getMessages;
}
//# sourceMappingURL=opencode.d.ts.map