export type KnowledgeDocument = {
  id: string;
  title: string;
  content: string;
  sourceType: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  author: string | null;
  sourceNote: string | null;
  aiSummary: string | null;
  aiTags: string[];
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Idea = {
  id: string;
  title: string;
  originalContent: string;
  sourceDocumentId: string | null;
  sourceQuote: string | null;
  aiSummary: string | null;
  aiTags: string[];
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TodoStatus = "not_started" | "in_progress" | "completed";
export type TodoPriority = "low" | "medium" | "high";

export type Todo = {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  isToday: boolean;
  sourceType: string | null;
  sourceDocumentId: string | null;
  sourceIdeaId: string | null;
  sourceQuote: string | null;
  result: string | null;
  completedAt: string | null;
  scheduledStartDate: string | null;
  scheduledTime: string | null;
  scheduledDuration: number;
  automationKind: string | null;
  automationDate: string | null;
  wasScheduled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceData = {
  folders: KnowledgeFolder[];
  documents: KnowledgeDocument[];
  ideas: Idea[];
  todos: Todo[];
};
