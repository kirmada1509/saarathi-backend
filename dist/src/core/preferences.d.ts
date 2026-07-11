import { UserRow, InferredPreference } from './types';
export declare function initEmbeddingModel(): Promise<void>;
export declare function inferPreferences(user: UserRow): Promise<InferredPreference>;
