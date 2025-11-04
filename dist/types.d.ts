export interface Conversation {
    id: string;
    metadata: {
        title: string;
        project: string;
        directory: string;
        created: number;
        updated: number;
        machine: string;
    };
    messages: Message[];
}
export interface Message {
    id: string;
    sessionID: string;
    role: 'user' | 'assistant';
    time: {
        created: number;
    };
    summary: {
        title?: string;
        body?: string;
    };
}
export interface SyncState {
    localConversations: Map<string, number>;
    syncConversations: Map<string, number>;
}
export interface SyncResult {
    needsPush: string[];
    needsPull: string[];
    upToDate: string[];
}
//# sourceMappingURL=types.d.ts.map