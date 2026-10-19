export interface ReceptionMessage {
  id: string;
  role: 'user' | 'assistant' | 'staff';
  content: string;
  at: string;
  status: 'streaming' | 'complete' | 'cancelled' | 'error';
  author?: string;
}
export interface ReceptionSession {
  id: string;
  mode: 'ai' | 'staff';
  ownerId: number | null;
  messages: ReceptionMessage[];
  updatedAt: string;
  revision: number;
}
export interface LibraryPoi {
  code: string;
  name: string;
  x: number;
  y: number;
  headingDeg: number;
}
export interface LibraryMap {
  id: string;
  name: string;
  widthM: number;
  heightM: number;
  pois: LibraryPoi[];
  standbyCode: string | null;
  returnPolicy: 'manual' | 'after_job';
  updatedAt: string;
}
