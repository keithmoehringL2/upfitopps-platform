// The header brand mark. Shows the distributor's uploaded logo when present,
// otherwise the default UpfitOutreach logo. Used in place of the brand wordmark
// across platform (apex/admin/portal/login) and distributor (rep/manager/tenant)
// surfaces. Plain <img> so it handles both the local default and remote blob
// logo URLs without next/image remote config.
export function BrandMark({
  logoUrl,
  name = "UpfitOutreach",
  height = 30,
}: {
  logoUrl?: string | null;
  name?: string;
  height?: number;
}) {
  const src = logoUrl || "/brand/upfit-outreach-logo.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      style={{ height, width: "auto", maxWidth: 200, objectFit: "contain", display: "block" }}
    />
  );
}
