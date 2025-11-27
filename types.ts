export interface Voter {
  sl_no: string;
  epic_no: string;
  name_en: string;
  name_te: string;
  relative_name: string; // Father/Husband/Mother/Guardian Name
  house_no: string;
  age: string;
  gender: string;
  assembly_name: string; // From Page Header
  parliament_name: string; // From Page Header
  polling_station_no: string; // From Page Header
  photoBase64?: string; // Cropped face image
  originalPage?: number;
  // Polling Data
  isVoted: boolean;
  votedParty: string | null;
  timestamp?: number;
}

export interface ProcessingStatus {
  total: number;
  current: number;
  message: string;
  isProcessing: boolean;
}

export interface VoterRawData {
  sl_no: string;
  epic_no: string;
  name_en: string;
  name_te: string;
  relative_name: string;
  house_no: string;
  age: string;
  gender: string;
  assembly_name: string;
  parliament_name: string;
  polling_station_no: string;
  photo_box_2d?: number[]; // [ymin, xmin, ymax, xmax]
}

export interface Party {
  name: string;
  color: string;
}

export interface StoredFile {
  id: string;
  fileName: string;
  pdfUrl: string;
  csvUrl: string;
  voterCount: number;
  assembly: string;
  createdAt: string;
  notes?: string;
}

export const DEFAULT_PARTIES: Party[] = [
  { name: 'INC', color: '#00B9F1' },
  { name: 'BRS', color: '#E6007E' },
  { name: 'BJP', color: '#FF9933' },
  { name: 'AIMIM', color: '#00953A' },
  { name: 'OTHERS', color: '#6B7280' }
];

declare global {
  const pdfjsLib: {
    getDocument: (data: any) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getViewport: (params: { scale: number }) => any;
          render: (params: { canvasContext: CanvasRenderingContext2D; viewport: any }) => { promise: Promise<void> };
          cleanup: () => void; // Important for memory management
        }>;
      }>;
    };
    GlobalWorkerOptions: {
      workerSrc: string;
    };
  };
}