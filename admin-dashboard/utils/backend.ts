export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export interface UserSummary {
  id: string;
  nama: string;
  email: string;
  role: string;
  status_enrollment: string;
  rejection_reason: string | null;
  created_at: string;
  sample_count: number;
}

export interface FaceSample {
  angle: string;
  photo_url: string | null;
  signed_url: string | null;
  created_at: string;
}

export interface UserDetail {
  id: string;
  nama: string;
  email: string;
  nim_nip: string | null;
  role: string;
  status_enrollment: string;
  rejection_reason: string | null;
  created_at: string;
  samples: FaceSample[];
  consents: { policy_version: string; accepted_at: string }[];
}

export interface ReEnrollResult {
  user_id: string;
  status_enrollment: string;
  deleted_embeddings: number;
  deleted_photos: number;
}

export interface LogRow {
  id: string;
  timestamp: string;
  nama: string | null;
  email: string | null;
  status: string;
  confidence_score: number | null;
  lat: number | null;
  lng: number | null;
  site: string | null;
  gps_accuracy: number | null;
  ip_address: string | null;
  ip_mismatch_flag: boolean;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
}

export interface LogPage {
  items: LogRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface LogDetail extends LogRow {
  photo_capture_url: string | null;
  photo_signed_url: string | null;
  user_agent: string | null;
  ip_geolocation_lat: number | null;
  ip_geolocation_lng: number | null;
}

export interface ReviewResult {
  id: string;
  reviewed_at: string;
  reviewed_by: string;
  review_note: string | null;
}

export async function backendFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      (data as { detail?: string }).detail ?? `Request gagal (HTTP ${resp.status})`,
    );
  }
  return data as T;
}
