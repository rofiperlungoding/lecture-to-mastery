import { create } from "zustand";
import type { Document } from "../types/db";
import { supabase } from "../lib/supabase";

interface AppState {
  documents: Document[];
  selectedDocId: string | null;
  loadingDocs: boolean;
  fetchDocuments: () => Promise<void>;
  setDocuments: (docs: Document[]) => void;
  addDocument: (doc: Document) => void;
  setSelectedDocId: (id: string | null) => void;
  isUploadOpen: boolean;
  setUploadOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  documents: [],
  selectedDocId: null,
  loadingDocs: false,
  isUploadOpen: false,

  fetchDocuments: async () => {
    set({ loadingDocs: true });
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      set({ documents: data });
    }
    set({ loadingDocs: false });
  },

  setDocuments: (documents) => set({ documents }),
  addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
  setSelectedDocId: (selectedDocId) => set({ selectedDocId }),
  setUploadOpen: (isUploadOpen) => set({ isUploadOpen }),
}));
