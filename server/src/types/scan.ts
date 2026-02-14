import { ObjectId } from "mongodb";

export interface DeviceSpecs {
  avgWatts?: number;
  standbyWatts?: number;
  source?: string;
}

export interface ScanDocument {
  _id?: ObjectId;
  userId: string;
  imageUrl?: string;
  imageHash?: string;
  embedding: number[]; // 768-dimension vector from mobile app's on-device AI
  label: string;
  confidence: number;
  deviceSpecs?: DeviceSpecs;
  createdAt: Date;
}

export interface SimilarSearchRequest {
  userId: string;
  embedding: number[]; // 768-dimension vector from mobile app
  k?: number;
}

export interface ResolveRequest {
  userId: string;
  imageUrl?: string;
  imageHash?: string;
  embedding: number[]; // 768-dimension vector from mobile app
}

export interface SimilarMatch {
  _id: ObjectId;
  label: string;
  confidence: number;
  deviceSpecs?: DeviceSpecs;
  score: number;
}

export interface SimilarSearchResponse {
  hit: boolean;
  matches: SimilarMatch[];
}

export interface ResolveResponse {
  cacheHit: boolean;
  result: ScanDocument;
}
