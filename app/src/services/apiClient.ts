/**
 * API Client — calls the consolidated FastAPI backend (be/)
 *
 * Base URL should point to your dev machine's IP when testing on a
 * physical device, or localhost for emulators.
 */

import { API_V1_URL } from '../utils/apiConfig';
import { log } from '../utils/logger';

const BASE_URL = API_V1_URL;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PowerProfile {
  category: string;
  standby_watts_range: [number, number];
  standby_watts_typical: number;
  active_watts_range: [number, number];
  active_watts_typical: number;
  confidence: number;
  source: string;
  notes: string[];
}

export interface PowerProfileResponse {
  brand: string;
  model: string;
  name: string;
  region: string;
  profile: PowerProfile;
  cached: boolean;
}

export interface ScanInsertResponse {
  insertedId: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function post<T>(path: string, body: unknown): Promise<T> {
  log.api(`POST ${path}`, { url: `${BASE_URL}${path}` });
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    log.error('api', `POST ${path} failed (${res.status})`, new Error(data.error || data.detail?.error));
    throw new Error(data.error || data.detail?.error || `API error ${res.status}`);
  }

  log.api(`POST ${path} -> ${res.status}`);
  return data.data as T;
}

/**
 * Fetch power profile for a device from the backend.
 * Calls Gemini AI (with MongoDB cache + category fallback).
 */
export async function fetchPowerProfile(
  brand: string,
  model: string,
  name: string,
  region: string = 'US'
): Promise<PowerProfileResponse> {
  return post<PowerProfileResponse>('/power-profile', {
    brand,
    model,
    name,
    region,
  });
}

/**
 * Save a confirmed scan to the backend database.
 * Embedding is optional — pass a dummy 768-dim vector if not available.
 */
export async function saveScan(params: {
  userId: string;
  imageUrl: string;
  label: string;
  confidence: number;
  deviceSpecs?: {
    avgWatts: number;
    standbyWatts: number;
    source: string;
  };
}): Promise<ScanInsertResponse> {
  // Generate a placeholder embedding (768 zeros) since on-device model
  // embedding extraction is handled separately
  const embedding = new Array(768).fill(0);

  return post<ScanInsertResponse>('/scans', {
    userId: params.userId,
    imageUrl: params.imageUrl,
    imageHash: '',
    embedding,
    label: params.label,
    confidence: params.confidence,
    deviceSpecs: params.deviceSpecs,
  });
}

/**
 * Health check — verify server is reachable.
 */
export async function checkHealth(): Promise<{ status: string; database: string }> {
  log.api('GET /health');
  const res = await fetch(`${BASE_URL}/health`);
  const data = await res.json();
  log.api(`GET /health -> ${res.status}`, data.data);
  return data.data;
}

// ---------------------------------------------------------------------------
// Generic GET helper
// ---------------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  log.api(`GET ${path}`);
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    log.error('api', `GET ${path} failed (${res.status})`, new Error(data.error || data.detail?.error));
    throw new Error(data.error || data.detail?.error || `API error ${res.status}`);
  }
  log.api(`GET ${path} -> ${res.status}`);
  return data.data as T;
}

async function del<T>(path: string): Promise<T> {
  log.api(`DELETE ${path}`);
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok || !data.success) {
    log.error('api', `DELETE ${path} failed (${res.status})`, new Error(data.error || data.detail?.error));
    throw new Error(data.error || data.detail?.error || `API error ${res.status}`);
  }
  log.api(`DELETE ${path} -> ${res.status}`);
  return data.data as T;
}

// ---------------------------------------------------------------------------
// Home types
// ---------------------------------------------------------------------------

export interface RoomModel {
  roomId: string;
  name: string;
}

export interface SceneObject {
  objectId: string;
  deviceId: string;
  roomId: string;
  category: string;
  assetKey: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface SceneRoom {
  roomId: string;
  name: string;
  size: [number, number, number];
}

export interface HomeScene {
  rooms: SceneRoom[];
  objects: SceneObject[];
}

export interface Home {
  id: string;
  userId: string;
  name: string;
  rooms: RoomModel[];
  scene?: HomeScene;
  createdAt: string;
}

export interface DevicePower {
  standby_watts_typical: number;
  standby_watts_range: [number, number];
  active_watts_typical: number;
  active_watts_range: [number, number];
  source: string;
  confidence: number;
}

export interface Device {
  id: string;
  homeId: string;
  roomId: string;
  label: string;
  brand: string;
  model: string;
  category: string;
  power: DevicePower;
  is_critical: boolean;
  control: { type: string; device_id?: string; capabilities: string[] };
  active_hours_per_day: number;
  usage_profile: string;
  addedAt: string;
}

export interface Assumptions {
  rate_per_kwh: number;
  kg_co2_per_kwh: number;
  profile: string;
  standby_reduction: number;
}

export interface DeviceBreakdown {
  deviceId: string;
  label: string;
  category: string;
  annual_kwh: number;
  annual_kwh_min: number;
  annual_kwh_max: number;
  annual_cost: number;
  annual_co2_kg: number;
  standby_annual_kwh: number;
  standby_annual_cost: number;
}

export interface HomeSummary {
  homeId: string;
  assumptions: Assumptions;
  totals: {
    device_count: number;
    annual_kwh: number;
    annual_kwh_min: number;
    annual_kwh_max: number;
    annual_cost: number;
    annual_cost_min: number;
    annual_cost_max: number;
    annual_co2_kg: number;
    monthly_cost: number;
    daily_cost: number;
    standby_annual_kwh: number;
    standby_annual_cost: number;
  };
  by_device: DeviceBreakdown[];
  action_savings?: {
    executed_actions: number;
    total_annual_kwh_saved: number;
    total_annual_dollars_saved: number;
    total_annual_co2_kg_saved: number;
  };
}

export interface ActionProposal {
  id: string;
  deviceId: string;
  label: string;
  action_type: string;
  parameters: {
    cost_usd: number;
    standby_reduction?: number;
    schedule_off_start?: string;
    schedule_off_end?: string;
    plug_model?: string;
    eco_mode?: string;
    replacement_model?: string;
    replacement_cost_usd?: number;
  };
  estimated_annual_kwh_saved: number;
  estimated_annual_dollars_saved: number;
  estimated_co2_kg_saved: number;
  estimated_cost_usd: number;
  payback_months: number;
  feasibility_score: number;
  rationale: string;
  safety_flags: string[];
}

export interface ActionRecord {
  id: string;
  homeId: string;
  deviceId: string;
  label: string;
  action_type: string;
  status: string;
  estimated_savings: {
    dollars_per_year: number;
    kwh_per_year: number;
    co2_kg_per_year: number;
  };
  rationale: string;
  createdAt: string;
  executedAt?: string;
  revertedAt?: string;
}

// ---------------------------------------------------------------------------
// Homes API
// ---------------------------------------------------------------------------

export async function createHome(userId: string, name: string, rooms?: RoomModel[]): Promise<Home> {
  return post<Home>('/homes', { userId, name, rooms: rooms ?? [] });
}

export async function listHomes(userId: string): Promise<Home[]> {
  return get<Home[]>(`/homes?userId=${encodeURIComponent(userId)}`);
}

export async function getHome(homeId: string): Promise<Home> {
  return get<Home>(`/homes/${homeId}`);
}

export async function deleteHome(homeId: string): Promise<void> {
  await del(`/homes/${homeId}`);
}

// ---------------------------------------------------------------------------
// Rooms API
// ---------------------------------------------------------------------------

export async function addRoom(homeId: string, name: string): Promise<Home> {
  return post<Home>(`/homes/${homeId}/rooms`, { name });
}

export async function removeRoom(homeId: string, roomId: string): Promise<Home> {
  return del<Home>(`/homes/${homeId}/rooms/${roomId}`);
}

// ---------------------------------------------------------------------------
// Scene API
// ---------------------------------------------------------------------------

export async function getScene(homeId: string): Promise<HomeScene> {
  return get<HomeScene>(`/homes/${homeId}/scene`);
}

// ---------------------------------------------------------------------------
// Devices API
// ---------------------------------------------------------------------------

export async function addDevice(homeId: string, device: {
  roomId?: string;
  label: string;
  brand?: string;
  model?: string;
  category: string;
  power?: Partial<DevicePower>;
  is_critical?: boolean;
  active_hours_per_day?: number;
  usage_profile?: string;
}): Promise<Device> {
  return post<Device>(`/homes/${homeId}/devices`, device);
}

export async function listDevices(homeId: string): Promise<Device[]> {
  return get<Device[]>(`/homes/${homeId}/devices`);
}

export async function deleteDevice(deviceId: string): Promise<void> {
  await del(`/devices/${deviceId}`);
}

// ---------------------------------------------------------------------------
// Summary & Assumptions API
// ---------------------------------------------------------------------------

export async function getHomeSummary(homeId: string): Promise<HomeSummary> {
  return get<HomeSummary>(`/homes/${homeId}/summary`);
}

export async function getAssumptions(homeId: string): Promise<Assumptions> {
  return get<Assumptions>(`/homes/${homeId}/assumptions`);
}

export async function setAssumptions(homeId: string, updates: {
  rate_per_kwh?: number;
  kg_co2_per_kwh?: number;
  profile?: string;
}): Promise<Assumptions> {
  return post<Assumptions>(`/homes/${homeId}/assumptions`, updates);
}

// ---------------------------------------------------------------------------
// Actions API
// ---------------------------------------------------------------------------

export async function proposeActions(homeId: string, options?: {
  top_n?: number;
  constraints?: Record<string, unknown>;
}): Promise<{ proposals: ActionProposal[] }> {
  return post<{ proposals: ActionProposal[] }>(`/homes/${homeId}/actions/propose`, {
    top_n: options?.top_n ?? 5,
    constraints: options?.constraints,
  });
}

export async function executeActions(homeId: string, actionIds: string[]): Promise<{
  execution_results: Array<{ id: string; status: string; error?: string }>;
  updated_summary: HomeSummary['totals'];
  total_savings: HomeSummary['action_savings'];
}> {
  return post(`/homes/${homeId}/actions/execute`, { action_ids: actionIds });
}

export async function listActions(homeId: string): Promise<ActionRecord[]> {
  return get<ActionRecord[]>(`/homes/${homeId}/actions`);
}

export async function revertAction(homeId: string, actionId: string): Promise<{ success: boolean }> {
  return post(`/homes/${homeId}/actions/${actionId}/revert`, {});
}

// ---------------------------------------------------------------------------
// Agent Command API — natural language home control
// ---------------------------------------------------------------------------

export interface AgentCommandResult {
  intent: string;
  message: string;
  proposals: ActionProposal[];
  executed: Array<{ id: string; status: string; error?: string }>;
  auto_executed: boolean;
}

export async function sendAgentCommand(
  homeId: string,
  command: string,
  constraints?: Record<string, unknown>,
): Promise<AgentCommandResult> {
  return post<AgentCommandResult>(`/homes/${homeId}/agent`, { command, constraints });
}

// ---------------------------------------------------------------------------
// Categories API — for device search/confirm
// ---------------------------------------------------------------------------

export interface CategoryInfo {
  category: string;
  modelAsset: string;
}

export async function listCategories(): Promise<CategoryInfo[]> {
  return get<CategoryInfo[]>('/categories');
}
