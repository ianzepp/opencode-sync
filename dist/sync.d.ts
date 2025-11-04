import { SyncResult } from './types';
export declare class SyncManager {
    private opencodeStorage;
    private syncPath;
    private conversationsPath;
    constructor(opencodePath: string, syncPath: string);
    check(): Promise<SyncResult>;
    push(): Promise<void>;
    pull(): Promise<void>;
    private getSyncConversations;
    private importConversation;
    static syncDirectories(path1: string, path2: string): Promise<void>;
}
//# sourceMappingURL=sync.d.ts.map