import { cookies } from "next/headers";

import { createClient } from "@/utils/supabase/server";
import LocationsManager from "./locations-manager";

type LocationRow = {
  id: string;
  nama_site: string;
  lat: number;
  lng: number;
  radius_meter: number;
  created_at: string;
};

export default async function LocationsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return <p className="text-sm text-gray-500">Login diperlukan.</p>;
  }

  const isAdmin = await supabase
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single()
    .then(({ data }) => data?.role === "admin" || data?.role === "superadmin");

  const { data } = await supabase
    .from("locations")
    .select("id, nama_site, lat, lng, radius_meter, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h2 className="mb-1 font-mono text-xl font-semibold text-foreground">Locations</h2>
      <p className="mb-4 text-sm text-muted">
        Kelola lokasi geofence absensi (Sprint 3). Perubahan langsung berlaku
        untuk validasi absen berikutnya — tanpa restart service.
      </p>
      <LocationsManager initial={(data as LocationRow[] | null) ?? []} isAdmin={isAdmin} />
    </div>
  );
}
