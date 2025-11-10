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
export interface ImportResult {
    imported: Conversation[];
    archived: RawConversation[];
    warnings: ImportWarning[];
    metadata: ImportMetadata;
}
export interface ImportOptions {
    force?: boolean;
}
export interface RawConversation {
    id: string;
    format: string;
    rawData: any;
    filePath: string;
    timestamp: number;
}
export interface ImportWarning {
    type: 'unsupported_feature' | 'metadata_loss' | 'conversion_error';
    message: string;
    conversationId?: string;
    details?: any;
}
export interface ImportMetadata {
    format: string;
    sourcePath: string;
    timestamp: number;
    totalConversations: number;
    successfullyImported: number;
    archivedCount: number;
}
export interface ImportStrategy {
    format: string;
    canImport(sourcePath: string): Promise<boolean>;
    import(sourcePath: string, options?: ImportOptions): Promise<ImportResult>;
    getFormat(): string;
}
//# sourceMappingURL=types.d.ts.map