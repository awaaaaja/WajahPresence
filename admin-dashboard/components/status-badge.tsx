import Badge, { type BadgeVariant } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  approved: "success",
  success: "success",
  rejected: "danger",
  pending: "warning",
  suspicious: "warning",
  not_enrolled: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  success: "Sukses",
  rejected: "Ditolak",
  pending: "Pending",
  suspicious: "Mencurigakan",
  not_enrolled: "Belum enroll",
};

export default function StatusBadge({
  status,
}: {
  status: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
